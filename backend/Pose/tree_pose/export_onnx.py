"""
Export trained_tree_pose_model.pth to an int8 ONNX model that the app runs
on-device (offline) inside the camera WebView with onnxruntime-web.

    pip install torch torchvision onnx onnxruntime onnxscript pillow opencv-python
    python backend/Pose/tree_pose/export_onnx.py      (or: make tree-pose-onnx)

Writes android/app/src/main/assets/web/tree_pose/{tree_pose_classifier.onnx,
tree_pose_classifier.json}, which LocalAssetServer serves at
http://127.0.0.1:8888/tree_pose/...
"""
import glob
import json
import os

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PTH = os.path.join(HERE, "trained_tree_pose_model.pth")
OUT_DIR = os.path.join(ROOT, "android", "app", "src", "main", "assets", "web", "tree_pose")
FP32 = os.path.join(OUT_DIR, "tree_pose_classifier.fp32.onnx")
INT8 = os.path.join(OUT_DIR, "tree_pose_classifier.onnx")

SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class WithSoftmax(nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, x):
        return torch.softmax(self.net(x), dim=1)


def build_model():
    net = models.resnet50(weights=None)
    net.fc = nn.Sequential(
        nn.Dropout(0.3), nn.Linear(net.fc.in_features, 256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 2)
    )
    ckpt = torch.load(PTH, map_location="cpu", weights_only=False)
    net.load_state_dict(ckpt["model_state_dict"])
    return WithSoftmax(net).eval(), ckpt.get("classes", ["correct_pose", "wrong_pose"])


def preprocess(path, flip=False, scale=1.0):
    """Same as torchvision Resize((224,224)) + ToTensor + Normalize (bilinear)."""
    img = Image.open(path).convert("RGB")
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    if scale != 1.0:
        w, h = img.size
        cw, ch = int(w * scale), int(h * scale)
        img = img.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2))
    arr = np.asarray(img.resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)[None].astype(np.float32)


def main():
    from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process
    import onnxruntime as ort

    os.makedirs(OUT_DIR, exist_ok=True)
    model, classes = build_model()
    torch.onnx.export(
        model, torch.zeros(1, 3, SIZE, SIZE), FP32, input_names=["input"], output_names=["probs"],
        opset_version=17, dynamo=False,
    )

    images = sorted(glob.glob(os.path.join(HERE, "dataset", "*", "*.png")))
    calib = [preprocess(p, f, s) for p in images for f in (False, True) for s in (1.0, 0.85)]

    class Reader(CalibrationDataReader):
        def __init__(self):
            self.it = iter([{"input": x} for x in calib])

        def get_next(self):
            return next(self.it, None)

    prep = FP32.replace(".fp32.", ".prep.")
    quant_pre_process(FP32, prep)
    quantize_static(
        prep, INT8, Reader(), quant_format=QuantFormat.QOperator,
        activation_type=QuantType.QUInt8, weight_type=QuantType.QUInt8, per_channel=False,
    )
    os.remove(prep)

    with open(os.path.join(OUT_DIR, "tree_pose_classifier.json"), "w") as f:
        json.dump({"classes": classes, "size": SIZE, "mean": MEAN.tolist(), "std": STD.tolist(),
                   "wrong_threshold": 0.5}, f, indent=2)

    # Parity check: torch vs int8 ONNX on the dataset
    sess = ort.InferenceSession(INT8, providers=["CPUExecutionProvider"])
    agree = 0
    for p in images:
        x = preprocess(p)
        with torch.no_grad():
            pt = model(torch.from_numpy(x))[0].numpy()
        ox = sess.run(None, {"input": x})[0][0]
        agree += int(np.argmax(pt) == np.argmax(ox))
        print(f"{os.path.basename(p):20s} torch={pt.round(3)} int8={ox.round(3)}")
    print(f"agreement {agree}/{len(images)}; int8 size {os.path.getsize(INT8) / 1e6:.1f} MB")
    os.remove(FP32)


if __name__ == "__main__":
    main()
