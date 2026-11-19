"""Hero-free backdrops ("plates") from the heroes' film stills, for the rotatable 3D hero after the story movie.

    python scripts/hero_plates.py            (needs: mediapipe==0.10.14 opencv-python-headless numpy)

For each still (assets/video/<hero>_still.jpg) the painted hero is found with MediaPipe Pose's full-body segmentation,
the mask is grown to cover hair and the soft edge, and the hole is filled with OpenCV inpainting (at a quarter
of the size, then blended in at full size with a little film grain, so the fill is a smooth continuation of
the snow / sky / track instead of streaks). The 3D hero stands in front of that spot, so the fill only shows
in the slivers a turned hero uncovers.

Writes assets/video/<hero>_plate.jpg and prints where the painted hero stood, as fractions of the frame
(x: feet centre, foot: feet line from the top, height: head-to-feet) for HeroScreen's placement.
"""
import json
import os
import sys

import cv2
import mediapipe as mp
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'video')
HEROES = sys.argv[1:] or ['arjun', 'meera', 'veera']   # or just the ones named: python scripts/hero_plates.py veera


def person_mask(img):
    """full-body mask (MediaPipe Pose segmentation: the selfie model misses legs and feet)"""
    with mp.solutions.pose.Pose(static_image_mode=True, model_complexity=2, enable_segmentation=True) as pose:
        r = pose.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    m = (r.segmentation_mask > 0.3).astype(np.uint8)
    # keep the biggest blob (the hero), drop stray pixels
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        m = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    return m


def fill(img, mask):
    h, w = mask.shape
    small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    msmall = cv2.resize(mask, (w // 4, h // 4), interpolation=cv2.INTER_NEAREST)
    msmall = cv2.dilate(msmall, np.ones((3, 3), np.uint8))
    filled = cv2.inpaint(small, msmall * 255, 6, cv2.INPAINT_TELEA)
    up = cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    rng = np.random.default_rng(1)
    up += rng.normal(0, 3.0, up.shape).astype(np.float32)  # film grain, so the fill isn't flat
    soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 6)[..., None]
    return np.clip(img * (1 - soft) + up * soft, 0, 255).astype(np.uint8)


# Parts of a hero the person segmentation misses, as boxes in fractions of the frame (x0, y0, x1, y1): Veera's
# iron arm and the teal glow rising off it.
EXTRA = {'veera': [(0.125, 0.15, 0.37, 0.62)]}

out = {}
for hero in HEROES:
    img = cv2.imread(os.path.join(ROOT, f'{hero}_still.jpg'))
    h, w = img.shape[:2]
    m = person_mask(img)
    ys, xs = np.nonzero(m)
    top, bottom = ys.min(), ys.max()
    feet = xs[ys > bottom - (bottom - top) * 0.06]
    grown = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    for x0, y0, x1, y1 in EXTRA.get(hero, []):
        grown[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 1
    plate = fill(img, grown)
    cv2.imwrite(os.path.join(ROOT, f'{hero}_plate.jpg'), plate, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if os.environ.get('PLATE_MASKS'):  # a directory to save the masks in, for checking
        cv2.imwrite(os.path.join(os.environ['PLATE_MASKS'], f'{hero}_mask.png'), grown * 255)
    out[hero] = {'x': round(float(feet.mean()) / w, 4), 'foot': round(float(bottom) / h, 4),
                 'height': round(float(bottom - top) / h, 4)}
print(json.dumps(out))
