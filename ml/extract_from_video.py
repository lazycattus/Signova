"""
Signova: extract hand landmarks from VIDEO FILES (instead of live webcam).

Put your videos in folders named after the sign:

    ml/videos/
        pain/      clip1.mp4  clip2.mp4
        help/      take1.mov
        thank_you/ ...

The folder name is the label (must be one of the 37 signs in collect_data.py).
The script runs MediaPipe on the frames, and saves the SAME rows as
collect_data.py: participant_id, label, then 126 numbers
(left hand 63 + right hand 63, zeros if a hand is missing).

Run:
    python extract_from_video.py --participant P01
    python extract_from_video.py --participant P01 --every 2 --show

Output: data/landmarks_P01_video.csv  (re-running overwrites this file, so you
never get duplicate rows). Only numbers are saved, the videos are not copied.
"""
import argparse
import csv
import os
import time

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# Reuse the exact same layout / helpers as the webcam script
from collect_data import HEADER, MODEL_PATH, SIGNS, draw_hands, ensure_model, flatten_hands, put_text

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_EXTS = (".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm", ".3gp")
MAX_WIDTH = 960  # shrink big phone videos (1080p / 4K) so it runs faster


def find_videos(video_dir):
    """Return [(label, path)] for every video inside video_dir/<sign>/."""
    found, unknown = [], []
    for folder in sorted(os.listdir(video_dir)):
        folder_path = os.path.join(video_dir, folder)
        if not os.path.isdir(folder_path):
            continue
        label = folder.strip().lower().replace(" ", "_").replace("-", "_")
        if label not in SIGNS:
            unknown.append(folder)
            continue
        for name in sorted(os.listdir(folder_path)):
            if name.lower().endswith(VIDEO_EXTS):
                found.append((label, os.path.join(folder_path, name)))
    return found, unknown


def make_landmarker():
    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
    )
    return vision.HandLandmarker.create_from_options(options)


def process_video(path, detect, every=3, show=False, label=""):
    """
    Go through one video. detect(frame_bgr, timestamp_ms) -> MediaPipe result.
    Returns (rows_of_126_numbers, frames_read, frames_with_hands).
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return [], 0, 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    rows, frame_no, with_hands = [], 0, 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_no += 1
        if (frame_no - 1) % every != 0:
            continue  # only use every Nth frame (neighbour frames are nearly identical)

        h, w = frame.shape[:2]
        if w > MAX_WIDTH:
            frame = cv2.resize(frame, (MAX_WIDTH, int(h * MAX_WIDTH / w)))

        timestamp_ms = int(frame_no * 1000 / fps)
        result = detect(frame, timestamp_ms)
        hands = len(result.hand_landmarks)
        if hands > 0:
            rows.append(flatten_hands(result))
            with_hands += 1

        if show:
            display = frame.copy()
            # draw_hands mirrors x (for the webcam view), so mirror the picture too
            display = cv2.flip(display, 1)
            draw_hands(display, result)
            put_text(display, f"{label}  hands: {hands}   (Q = skip rest)", 28)
            cv2.imshow("Signova video extraction", display)
            if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                break

    cap.release()
    return rows, frame_no, with_hands


def main():
    parser = argparse.ArgumentParser(description="Extract hand landmarks from videos into CSV")
    parser.add_argument("--participant", required=True, help="e.g. P01 (anonymous ID)")
    parser.add_argument("--videos", default=os.path.join(HERE, "videos"), help="folder with sign sub-folders")
    parser.add_argument("--every", type=int, default=3, help="use every Nth frame (default 3 = ~10 samples/sec at 30fps)")
    parser.add_argument("--show", action="store_true", help="show the video while processing")
    args = parser.parse_args()

    if not os.path.isdir(args.videos):
        raise SystemExit(f"Video folder not found: {args.videos}")
    videos, unknown = find_videos(args.videos)
    if unknown:
        print("Skipped folders (name is not one of the 37 signs):", ", ".join(unknown))
        print("Valid names:", ", ".join(SIGNS), "\n")
    if not videos:
        raise SystemExit("No videos found. Put them in videos/<sign>/clip.mp4")

    ensure_model()
    out_dir = os.path.join(HERE, "data")
    os.makedirs(out_dir, exist_ok=True)
    csv_path = os.path.join(out_dir, f"landmarks_{args.participant}_video.csv")

    totals = {s: 0 for s in SIGNS}
    start = time.time()
    with open(csv_path, "w", newline="") as f:  # "w" = overwrite, no duplicates on re-run
        writer = csv.writer(f)
        writer.writerow(HEADER)
        for i, (label, path) in enumerate(videos, 1):
            landmarker = make_landmarker()  # fresh tracker per video

            def detect(frame_bgr, ts):
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                return landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)

            try:
                rows, frames, with_hands = process_video(path, detect, args.every, args.show, label)
            finally:
                landmarker.close()
            for r in rows:
                writer.writerow([args.participant, label] + r)
            totals[label] += len(rows)
            note = "" if rows else "   <-- NO HANDS FOUND, check this video"
            print(f"[{i}/{len(videos)}] {label:<10} {os.path.basename(path)}: "
                  f"{len(rows)} samples from {frames} frames{note}")

    cv2.destroyAllWindows()
    print(f"\nSaved {sum(totals.values())} samples to {csv_path} in {time.time() - start:.0f}s")
    for s in SIGNS:
        if totals[s]:
            print(f"  {s:<10} {totals[s]}")
    missing = [s for s in SIGNS if totals[s] == 0]
    if missing:
        print("No data yet for:", ", ".join(missing))


if __name__ == "__main__":
    main()
