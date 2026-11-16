"""
Signova: what the model "sees" in ONE video frame.

One frame = 145 numbers:
    126   both hands, 21 points x (x,y,z) each (same as before, zeros if a hand is missing)
      8   where each hand is compared to the face (wrist and index fingertip, x and y)
      3   head movement: turn left/right, nod up/down, tilt sideways
      8   face expression: mouth open, smile, frown, pucker, brows down, brows up, eyes closed, cheeks puffed

The model reads a short WINDOW of these frames (about 2 seconds), so it can tell
signs apart by MOVEMENT and by head/face, not only by the hand shape in one picture.

IMPORTANT: frontend/src/lib/features.js does exactly the same maths. If you change
anything here (order, formulas, window length), change it there too, and run
`python test_features.py` + the frontend parity test.
"""
import math

WINDOW = 40  # frames per window
FPS = 20  # frames per second the window is sampled at  ->  40 / 20 = 2 seconds

HAND_NUMBERS = 126
HAND_FACE_NUMBERS = 8
HEAD_NUMBERS = 3
EXPRESSION_NUMBERS = 8
FEATURE_COUNT = HAND_NUMBERS + HAND_FACE_NUMBERS + HEAD_NUMBERS + EXPRESSION_NUMBERS  # 145

# FaceLandmarker point numbers used for head position
NOSE, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN = 1, 234, 454, 10, 152
WRIST, INDEX_TIP = 0, 8

EXPRESSIONS = [
    "jawOpen", "mouthSmile", "mouthFrown", "mouthPucker",
    "browDown", "browInnerUp", "eyeBlink", "cheekPuff",
]


def _avg(blend, left, right):
    return (blend.get(left, 0.0) + blend.get(right, 0.0)) / 2


def expression_numbers(blend):
    """blend: {blendshape name: score 0..1} from MediaPipe FaceLandmarker."""
    return [
        blend.get("jawOpen", 0.0),
        _avg(blend, "mouthSmileLeft", "mouthSmileRight"),
        _avg(blend, "mouthFrownLeft", "mouthFrownRight"),
        blend.get("mouthPucker", 0.0),
        _avg(blend, "browDownLeft", "browDownRight"),
        blend.get("browInnerUp", 0.0),
        _avg(blend, "eyeBlinkLeft", "eyeBlinkRight"),
        blend.get("cheekPuff", 0.0),
    ]


def face_numbers(hands, face, aspect):
    """
    hands: {"Left": 21 (x,y,z) points or None, "Right": ...}
    face:  None, or {"points": {1: (x,y), 234: (x,y), 454: .., 10: .., 152: ..}, "blend": {...}}
    aspect: video width / height (so a wide and a tall video give the same numbers)
    Returns 8 + 3 + 8 numbers (all zeros if no face is visible).
    """
    zeros = [0.0] * (HAND_FACE_NUMBERS + HEAD_NUMBERS + EXPRESSION_NUMBERS)
    if face is None:
        return zeros
    p = face["points"]

    def xy(i):  # squash x by the aspect so distances are real
        return (p[i][0] * aspect, p[i][1])

    nose, lc, rc, top, chin = xy(NOSE), xy(LEFT_CHEEK), xy(RIGHT_CHEEK), xy(FOREHEAD), xy(CHIN)
    width = math.dist(lc, rc)
    height = math.dist(top, chin)
    if width < 1e-6 or height < 1e-6:
        return zeros

    # hand vs face: (hand point - nose) / face width. Near the head or down by the chest?
    hand_face = []
    for side in ("Left", "Right"):
        hand = hands.get(side)
        if hand is None:
            hand_face += [0.0] * 4
            continue
        for idx in (WRIST, INDEX_TIP):
            hx, hy = hand[idx][0] * aspect, hand[idx][1]
            hand_face += [(hx - nose[0]) / width, (hy - nose[1]) / width]

    # head: turn (shake), nod, tilt
    yaw = (nose[0] - (lc[0] + rc[0]) / 2) / width
    pitch = (nose[1] - (top[1] + chin[1]) / 2) / height
    roll = math.atan2(rc[1] - lc[1], rc[0] - lc[0])
    if roll > math.pi / 2:  # keep the tilt small and continuous around 0
        roll -= math.pi
    elif roll < -math.pi / 2:
        roll += math.pi

    return hand_face + [yaw, pitch, roll] + expression_numbers(face["blend"])


def hand_numbers(hands):
    """126 numbers: left hand 63 + right hand 63 (same layout as landmarks.js / collect_data.py)."""
    out = []
    for side in ("Left", "Right"):
        hand = hands.get(side)
        if hand is None:
            out += [0.0] * 63
        else:
            for pt in hand:
                out += [pt[0], pt[1], pt[2]]
    return out


def frame_features(hands, face, aspect):
    """The 145 numbers for one frame."""
    nums = hand_numbers(hands) + face_numbers(hands, face, aspect)
    assert len(nums) == FEATURE_COUNT
    return nums


# ---------- helpers that turn MediaPipe (Python) results into the plain inputs above ----------

def slot_hands(result):
    """HandLandmarker result -> {"Left": points|None, "Right": points|None}."""
    slots = {"Left": None, "Right": None}
    for i, hand in enumerate(result.hand_landmarks):
        label = None
        if i < len(result.handedness) and result.handedness[i]:
            label = result.handedness[i][0].category_name
        if label not in slots or slots[label] is not None:
            label = "Right" if slots["Left"] is not None else "Left"
        slots[label] = [(p.x, p.y, p.z) for p in hand]
    return slots


def read_face(result):
    """FaceLandmarker result -> {"points": ..., "blend": ...} or None if no face."""
    if not result.face_landmarks:
        return None
    lm = result.face_landmarks[0]
    points = {i: (lm[i].x, lm[i].y) for i in (NOSE, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN)}
    blend = {}
    if result.face_blendshapes:
        blend = {c.category_name: c.score for c in result.face_blendshapes[0]}
    return {"points": points, "blend": blend}
