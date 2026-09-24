"""
Tree Pose image classifier used by the app to cross-check the MediaPipe
geometry engine (same ResNet50 head as tree_pose_tracker.NeuralPoseCrossChecker).

The model is loaded lazily on the first request so the server still starts
when torch / the .pth weights are not installed.
"""
import os
import threading

import cv2
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trained_tree_pose_model.pth")
WRONG_THRESHOLD = 0.50  # same gate as tree_pose_tracker.py

_lock = threading.Lock()
_state = {"model": None, "transform": None, "classes": None, "device": None, "error": None}


def _load():
    if _state["model"] is not None or _state["error"] is not None:
        return
    with _lock:
        if _state["model"] is not None or _state["error"] is not None:
            return
        try:
            import torch
            import torch.nn as nn
            from torchvision import models, transforms

            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError(f"missing weights: {MODEL_PATH}")

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model = models.resnet50(weights=None)
            model.fc = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(model.fc.in_features, 256),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(256, 2),
            )
            ckpt = torch.load(MODEL_PATH, map_location=device, weights_only=False)
            model.load_state_dict(ckpt["model_state_dict"])
            model.to(device).eval()

            _state["classes"] = ckpt.get("classes", ["correct_pose", "wrong_pose"])
            _state["transform"] = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            _state["device"] = device
            _state["model"] = model
            print(f"[TreePose] Loaded classifier on {device} (classes={_state['classes']})")
        except Exception as e:  # torch not installed, weights missing, etc.
            _state["error"] = str(e)
            print(f"[TreePose] Classifier unavailable: {e}")


def is_available():
    _load()
    return _state["model"] is not None


def classify_jpeg(jpeg_bytes):
    """Returns {"available", "correct", "wrong", "is_correct"} for one JPEG frame."""
    _load()
    if _state["model"] is None:
        return {"available": False, "reason": _state["error"]}

    import torch
    from PIL import Image

    frame = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return {"available": True, "error": "bad image"}

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    tensor = _state["transform"](Image.fromarray(rgb)).unsqueeze(0).to(_state["device"])
    with torch.no_grad():
        probs = torch.softmax(_state["model"](tensor), dim=1)[0].cpu().numpy()

    classes = _state["classes"]
    correct_idx = 0 if "correct" in classes[0].lower() else 1
    correct = float(probs[correct_idx])
    wrong = float(probs[1 - correct_idx])
    return {
        "available": True,
        "correct": correct,
        "wrong": wrong,
        "is_correct": wrong <= WRONG_THRESHOLD,
    }
