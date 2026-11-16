"""
Makes fixtures/frame_fixture.json: a few frames with the numbers Python computes.
The website test (cd frontend && npm run test:features) checks that features.js gives the same numbers.
Only run this again if you change the maths in features.py (and then change features.js the same way).
"""
import json
import math
import os

from features import frame_features

HERE = os.path.dirname(os.path.abspath(__file__))


def hand(cx, cy):
    return [(cx + 0.02 * math.cos(i), cy + 0.02 * math.sin(i), -0.01 * i) for i in range(21)]


FACE = {
    "points": {1: (0.52, 0.47), 234: (0.40, 0.50), 454: (0.63, 0.44), 10: (0.50, 0.30), 152: (0.51, 0.68)},
    "blend": {"jawOpen": 0.3, "mouthSmileLeft": 0.2, "mouthSmileRight": 0.4, "mouthFrownLeft": 0.1,
              "mouthFrownRight": 0.0, "mouthPucker": 0.05, "browDownLeft": 0.5, "browDownRight": 0.3,
              "browInnerUp": 0.7, "eyeBlinkLeft": 0.9, "eyeBlinkRight": 0.1, "cheekPuff": 0.02},
}
CASES = [
    ("both hands + face", {"Left": hand(0.3, 0.6), "Right": hand(0.7, 0.5)}, FACE, 16 / 9),
    ("right hand only, tall video", {"Left": None, "Right": hand(0.55, 0.4)}, FACE, 9 / 16),
    ("no face", {"Left": hand(0.4, 0.5), "Right": None}, None, 4 / 3),
    ("nothing", {"Left": None, "Right": None}, None, 4 / 3),
]

out = []
for name, hands, face, aspect in CASES:
    out.append({
        "name": name, "hands": hands, "aspect": aspect,
        "face": None if face is None else {"points": {str(k): v for k, v in face["points"].items()}, "blend": face["blend"]},
        "expected": frame_features(hands, face, aspect),
    })
os.makedirs(os.path.join(HERE, "fixtures"), exist_ok=True)
with open(os.path.join(HERE, "fixtures", "frame_fixture.json"), "w") as f:
    json.dump(out, f)
print("wrote fixtures/frame_fixture.json")
