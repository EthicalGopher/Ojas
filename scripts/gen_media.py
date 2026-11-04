# /// script
# requires-python = ">=3.10"
# dependencies = ["google-genai>=1.0.0", "pillow>=10.0.0"]
# ///
"""Generate images and video with Google's Gemini API (Veo, Gemini image models).

    uv run scripts/gen_media.py models
    uv run scripts/gen_media.py image "<prompt>" <out.png> [--model M] [--ref a.png --ref b.png] [--aspect 16:9]
    uv run scripts/gen_media.py video "<prompt>" <out.mp4> [--model M] [--image first_frame.png] [--aspect 16:9] [--seconds 8]

Reads GOOGLE_API_KEY from the environment. Image generation may be free; Veo bills per second of video.
Output goes wherever <out> says; scripts/blender/.cache/generated/ is gitignored. Downloaded clips are
kept because Google only stores them for a short time.
"""
import argparse
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

DEFAULT_IMAGE_MODEL = "gemini-3-pro-image"
DEFAULT_VIDEO_MODEL = "veo-3.1-generate-preview"


def list_models(client):
    for m in client.models.list():
        methods = ",".join(m.supported_actions or [])
        if any(k in m.name for k in ("image", "veo", "imagen")):
            print(m.name, "|", methods)


def gen_image(client, a):
    contents = [Image.open(p) for p in a.ref] + [a.prompt]
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=a.aspect),
    )
    res = client.models.generate_content(model=a.model or DEFAULT_IMAGE_MODEL, contents=contents, config=config)
    for part in res.candidates[0].content.parts:
        if part.inline_data:
            Path(a.out).parent.mkdir(parents=True, exist_ok=True)
            Path(a.out).write_bytes(part.inline_data.data)
            print("WROTE", a.out)
            return
    sys.exit(f"no image returned: {res.candidates[0].finish_reason}")


def gen_video(client, a):
    kwargs = {}
    if a.image:
        kwargs["image"] = types.Image.from_file(location=a.image)
    op = client.models.generate_videos(
        model=a.model or DEFAULT_VIDEO_MODEL,
        prompt=a.prompt,
        config=types.GenerateVideosConfig(aspect_ratio=a.aspect, duration_seconds=a.seconds),
        **kwargs,
    )
    while not op.done:
        print("generating...", flush=True)
        time.sleep(15)
        op = client.operations.get(op)
    if op.error or not op.response or not op.response.generated_videos:
        sys.exit(f"no video returned: {op.error or op.response}")
    video = op.response.generated_videos[0].video
    client.files.download(file=video)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    video.save(a.out)
    print("WROTE", a.out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("models")
    im = sub.add_parser("image")
    im.add_argument("prompt")
    im.add_argument("out")
    im.add_argument("--model")
    im.add_argument("--ref", action="append", default=[])
    im.add_argument("--aspect", default="16:9")
    vi = sub.add_parser("video")
    vi.add_argument("prompt")
    vi.add_argument("out")
    vi.add_argument("--model")
    vi.add_argument("--image")
    vi.add_argument("--aspect", default="16:9")
    vi.add_argument("--seconds", type=int, default=8)
    a = ap.parse_args()

    client = genai.Client()  # GOOGLE_API_KEY from the environment
    {"models": lambda: list_models(client), "image": lambda: gen_image(client, a), "video": lambda: gen_video(client, a)}[a.cmd]()


if __name__ == "__main__":
    main()
