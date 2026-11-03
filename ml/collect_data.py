"""
Signova data collection tool.

Opens your webcam, detects both hands with MediaPipe, and saves hand landmark
numbers to a CSV file each time you press a key. Only numbers are saved,
no video or photos.

Each row = participant_id, label, then 126 numbers:
    left hand 21 points x (x,y,z) = 63  +  right hand 63
    (zeros for a hand that is not in view)
This is exactly the same layout as frontend/src/lib/landmarks.js,
so the trained model will work with the web app.

Run:
    python collect_data.py --participant P01

Keys (click the camera window first):
    D / A   next / previous sign
    SPACE   save one sample
    R       auto-record on/off (saves ~5 samples per second while a hand is visible)
    Q / ESC quit
"""
import argparse
import csv
import os
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# The 37 healthcare BIM signs from the SRS (v2), grouped by the slot each one fills
# in the sentence builder. Names must match the video folder names too.
SIGNS_BY_SLOT = {
    "symptom": ["pain", "dizzy", "breathe", "headache", "fever", "allergy", "hungry",
                "vomit", "cough", "cold"],
    "body": ["head", "chest", "stomach", "back", "leg", "hand"],
    "time": ["today", "last_night", "morning", "night"],
    "intensity": ["a_little", "very"],
    "need": ["doctor", "nurse", "medicine", "water", "toilet"],
    "question": ["what", "when"],
    "reply": ["yes", "no", "repeat", "thank_you"],
    "emergency": ["emergency", "help", "ambulance", "stop"],
}
SIGNS = [sign for group in SIGNS_BY_SLOT.values() for sign in group]
assert len(SIGNS) == 37 and len(set(SIGNS)) == 37, "SRS says 37 different signs"

POINTS_PER_HAND = 21
NUMBERS_PER_HAND = POINTS_PER_HAND * 3  # 63
TOTAL_FEATURES = NUMBERS_PER_HAND * 2  # 126

HEADER = ["participant_id", "label"] + [
    f"{hand}{i}_{axis}" for hand in ("L", "R") for i in range(POINTS_PER_HAND) for axis in "xyz"
]

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "hand_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)

# Which dots to join with lines when drawing a hand
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (17, 18), (18, 19), (19, 20),  # pinky
    (0, 17),                                 # palm edge
]


def flatten_hands(result):
    """MediaPipe result -> list of 126 numbers (left 63 + right 63, zeros if missing)."""
    slots = {"Left": None, "Right": None}
    for i, hand in enumerate(result.hand_landmarks):
        label = None
        if i < len(result.handedness) and result.handedness[i]:
            label = result.handedness[i][0].category_name  # "Left" or "Right"
        # If two hands got the same label, put the second in the empty slot
        if label not in slots or slots[label] is not None:
            label = "Right" if slots["Left"] is not None else "Left"
        slots[label] = hand

    def one_hand(hand):
        if hand is None:
            return [0.0] * NUMBERS_PER_HAND
        out = []
        for p in hand:
            out.extend([p.x, p.y, p.z])
        return out

    return one_hand(slots["Left"]) + one_hand(slots["Right"])


def ensure_model():
    """Download the hand model the first time (about 8 MB)."""
    if os.path.exists(MODEL_PATH):
        return
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    print("Downloading hand model (first time only)...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


def count_existing(csv_path):
    """How many samples per sign are already saved in this participant's file."""
    counts = {s: 0 for s in SIGNS}
    if os.path.exists(csv_path):
        with open(csv_path, newline="") as f:
            for row in csv.DictReader(f):
                if row["label"] in counts:
                    counts[row["label"]] += 1
    return counts


def draw_hands(frame, result):
    """Draw dots + lines. Frame is shown mirrored, so flip x."""
    h, w = frame.shape[:2]
    for hand in result.hand_landmarks:
        pts = [(int((1 - p.x) * w), int(p.y * h)) for p in hand]
        for a, b in HAND_CONNECTIONS:
            cv2.line(frame, pts[a], pts[b], (80, 200, 80), 2)
        for pt in pts:
            cv2.circle(frame, pt, 4, (60, 60, 230), -1)


def put_text(frame, text, y, color=(255, 255, 255), scale=0.7):
    cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 4)
    cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2)


def main():
    parser = argparse.ArgumentParser(description="Record hand landmarks to CSV")
    parser.add_argument("--participant", required=True, help="e.g. P01 (no names, keep anonymous)")
    parser.add_argument("--target", type=int, default=100, help="samples wanted per sign")
    parser.add_argument("--camera", type=int, default=0, help="camera number (0 = default webcam)")
    args = parser.parse_args()

    out_dir = os.path.join(HERE, "data")
    os.makedirs(out_dir, exist_ok=True)
    # One file per participant, so two people collecting never clash in Git
    csv_path = os.path.join(out_dir, f"landmarks_{args.participant}.csv")
    is_new_file = not os.path.exists(csv_path)
    counts = count_existing(csv_path)

    ensure_model()
    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
    )
    landmarker = vision.HandLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Could not open the camera. Close other apps using it, or try --camera 1")

    csv_file = open(csv_path, "a", newline="")
    writer = csv.writer(csv_file)
    if is_new_file:
        writer.writerow(HEADER)

    sign_index = 0
    auto = False
    last_auto_save = 0.0
    flash_until = 0.0
    start = time.time()
    print(f"Saving to {csv_path}")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Detect on the normal (un-mirrored) frame, same as the web app
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((time.time() - start) * 1000)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)
            hands = len(result.hand_landmarks)

            sign = SIGNS[sign_index]
            now = time.time()

            def save_sample():
                writer.writerow([args.participant, sign] + flatten_hands(result))
                csv_file.flush()
                counts[sign] += 1

            if auto and hands > 0 and now - last_auto_save >= 0.2:
                if counts[sign] < args.target:
                    save_sample()
                    last_auto_save = now
                    flash_until = now + 0.08
                else:
                    auto = False  # reached target, stop auto-record

            display = cv2.flip(frame, 1)  # mirror for the user
            draw_hands(display, result)
            if now < flash_until:
                cv2.rectangle(display, (0, 0), (display.shape[1] - 1, display.shape[0] - 1), (0, 255, 0), 8)

            done = counts[sign] >= args.target
            put_text(display, f"Sign {sign_index + 1}/{len(SIGNS)}: {sign.upper()}", 30, (0, 255, 255), 0.9)
            put_text(display, f"Saved: {counts[sign]} / {args.target}" + ("  DONE" if done else ""), 62,
                     (0, 255, 0) if done else (255, 255, 255))
            put_text(display, f"Hands: {hands}   Auto: {'ON' if auto else 'off'}", 92,
                     (0, 255, 0) if hands else (80, 80, 255))
            put_text(display, "A/D sign  SPACE save  R auto  Q quit", display.shape[0] - 14, scale=0.55)

            cv2.imshow("Signova data collection", display)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            elif key == ord("d"):
                sign_index = (sign_index + 1) % len(SIGNS)
                auto = False
            elif key == ord("a"):
                sign_index = (sign_index - 1) % len(SIGNS)
                auto = False
            elif key == ord("r"):
                auto = not auto
            elif key == 32 and hands > 0:
                save_sample()
                flash_until = time.time() + 0.08
    finally:
        csv_file.close()
        cap.release()
        landmarker.close()
        cv2.destroyAllWindows()

    total = sum(counts.values())
    print(f"Done. {total} samples in {csv_path}")
    for s in SIGNS:
        print(f"  {s:<10} {counts[s]}")


if __name__ == "__main__":
    main()
