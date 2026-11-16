"""
Signova: turn VIDEOS into training data that includes MOVEMENT, head and face.

Same folders as extract_from_video.py (folder name = sign):

    ml/videos/pain/clip1.mp4
    ml/videos/thank_you/take1.mov

Run:
    python extract_sequences.py --participant P01
    python extract_sequences.py --participant P01 --show      (watch the tracking)

For every video it:
  1. runs MediaPipe on the hands AND the face,
  2. keeps 20 frames per second,
  3. cuts away the start and end where no hand is visible,
  4. saves the frames of the sign (145 numbers per frame, see features.py).

Output: data/sequences_P01.npz  (re-running overwrites it). Only numbers, no video is copied.
Use a different --participant for each person / video source, e.g. P01 = your own recordings,
SB = videos from the sign dictionary. Training keeps a participant out as a test when it can.
"""
import argparse
import os
import time
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from collect_data import MODEL_PATH as HAND_MODEL_PATH, SIGNS, ensure_model as ensure_hand_model
from extract_from_video import MAX_WIDTH, find_videos
from features import FPS, HAND_NUMBERS, FEATURE_COUNT, frame_features, read_face, slot_hands

HERE = os.path.dirname(os.path.abspath(__file__))
FACE_MODEL_PATH = os.path.join(HERE, "models", "face_landmarker.task")
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
MARGIN = 2  # keep a couple of frames before/after the first/last hand


def ensure_face_model():
    if os.path.exists(FACE_MODEL_PATH):
        return
    os.makedirs(os.path.dirname(FACE_MODEL_PATH), exist_ok=True)
    print("Downloading face model (first time only)...")
    urllib.request.urlretrieve(FACE_MODEL_URL, FACE_MODEL_PATH)


def make_landmarkers():
    hands = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=HAND_MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
        )
    )
    face = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
        )
    )
    return hands, face


def trim(frames):
    """Keep only from the first to the last frame where a hand is visible."""
    arr = np.asarray(frames, dtype=np.float32)
    has_hand = np.abs(arr[:, :HAND_NUMBERS]).sum(axis=1) > 0
    if not has_hand.any():
        return None
    idx = np.where(has_hand)[0]
    return arr[max(0, idx[0] - MARGIN): idx[-1] + MARGIN + 1]


def process_video(path, hands, face, show=False):
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames, n, next_t, last_ms = [], 0, 0.0, -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = n / src_fps  # seconds into the video
        n += 1
        if t + 1e-6 < next_t:  # only keep FPS frames per second
            continue
        next_t += 1.0 / FPS
        h, w = frame.shape[:2]
        if w > MAX_WIDTH:
            frame = cv2.resize(frame, (MAX_WIDTH, int(h * MAX_WIDTH / w)))
            h, w = frame.shape[:2]
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        ms = max(int(t * 1000), last_ms + 1)  # MediaPipe needs strictly rising times
        last_ms = ms
        hand_result = hands.detect_for_video(image, ms)
        face_result = face.detect_for_video(image, ms)
        frames.append(frame_features(slot_hands(hand_result), read_face(face_result), w / h))
        if show:
            cv2.imshow("extract (Q to stop)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    cap.release()
    return frames


def main():
    parser = argparse.ArgumentParser(description="Videos -> sequences with hands, head and face")
    parser.add_argument("--participant", required=True, help="e.g. P01, or SB for dictionary videos")
    parser.add_argument("--videos", default=os.path.join(HERE, "videos"))
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()

    found, unknown = find_videos(args.videos)
    if unknown:
        print("Skipped folders (not one of the 40 signs):", ", ".join(unknown))
    if not found:
        print(f"No videos found in {args.videos}/<sign>/")
        return

    ensure_hand_model()
    ensure_face_model()
    clips, labels, names, no_face = [], [], [], 0
    start = time.time()
    for k, (label, path) in enumerate(found, 1):
        hands, face = make_landmarkers()  # fresh trackers per video (the time restarts at 0)
        frames = process_video(path, hands, face, args.show)
        hands.close()
        face.close()
        seg = trim(frames) if frames else None
        if seg is None or len(seg) < 4:
            print(f"[{k}/{len(found)}] {label}/{os.path.basename(path)}: no hand found, skipped")
            continue
        if np.abs(seg[:, HAND_NUMBERS:]).sum() == 0:
            no_face += 1
        clips.append(seg)
        labels.append(label)
        names.append(os.path.relpath(path, args.videos))
        print(f"[{k}/{len(found)}] {label}/{os.path.basename(path)}: {len(seg)} frames ({len(seg) / FPS:.1f}s)")

    if not clips:
        print("Nothing saved.")
        return
    out = os.path.join(HERE, "data", f"sequences_{args.participant}.npz")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    np.savez_compressed(
        out, labels=np.array(labels), names=np.array(names), feature_count=FEATURE_COUNT,
        **{f"clip{i}": c for i, c in enumerate(clips)},
    )
    per = {}
    for lab in labels:
        per[lab] = per.get(lab, 0) + 1
    print(f"\nSaved {len(clips)} clips to {out} in {time.time() - start:.0f}s")
    print(f"Signs covered: {len(per)} of {len(SIGNS)}. Fewest clips: {min(per.values())}")
    if no_face:
        print(f"WARNING: no face was found in {no_face} clip(s). Head/face numbers are empty there.")


if __name__ == "__main__":
    main()
