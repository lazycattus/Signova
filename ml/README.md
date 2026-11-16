# ml/ — data collection and training

## 1. Collect data

```bash
cd ml
python -m venv venv
venv\Scripts\activate        # Windows (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python collect_data.py --participant P01
```

Use Python 3.10, 3.11 or 3.12 (MediaPipe may not support newer versions yet).

Keys (click the camera window first):

| Key | What it does |
|-----|--------------|
| D / A | next / previous sign |
| SPACE | save one sample |
| R | auto-record on/off (about 5 samples per second) |
| Q or ESC | quit |

- Goal: 100 samples per sign per participant, 40 signs (4,000 rows per person).
  The full list, grouped by sentence slot, is `SIGNS_BY_SLOT` at the top of `collect_data.py`.
  Tip: do one group at a time (e.g. all symptoms first). Auto-record (R) takes about 20 seconds per sign.
- Vary hand position, distance, speed and lighting a little between samples.
- Each participant gets their own file: `data/landmarks_P01.csv`, `data/landmarks_P02.csv`, ...
  Running again with the same ID continues where you stopped.
- Use anonymous IDs (P01, P02...), never real names. Only numbers are saved, no video.

## 1b. Or: collect from VIDEOS (no live recording needed)

Film each sign (phone is fine), then let the script do the tracking.

1. Put videos in a folder per sign (folder name = label, must match the 40 signs):
   ```
   ml/videos/pain/clip1.mp4
   ml/videos/pain/clip2.mp4
   ml/videos/thank_you/take1.mov
   ml/videos/last_night/clip1.mp4
   ```
   Two-word signs use an underscore: `last_night`, `a_little`, `thank_you` (a space or a dash also works).
2. Run:
   ```bash
   python extract_from_video.py --participant P01
   ```
   Optional: `--every 2` (more samples), `--show` (watch the tracking while it runs).
3. Output: `data/landmarks_P01_video.csv`, same 126-number format as the webcam script.
   Re-running overwrites that file, so you never get duplicate rows.

Filming tips (so the model works on the live webcam later):
- Both hands fully inside the frame, plain background, good light.
- One sign per video, repeat it several times, with small changes in distance/angle.
- Film the same way the web app will see it: facing the camera. Don't use a "mirror"
  / flip option on the phone camera.
- Different people = different participant IDs (P01, P02, ...).
- The videos are NOT uploaded to Git (they stay on your laptop). Only the numbers are
  kept, which matches the proposal. If you use videos of other signers, get their
  consent first.

## 2. Row format

`participant_id, label, L0_x, L0_y, L0_z, ... L20_z, R0_x ... R20_z` = 2 + 126 columns.
Left hand first, then right hand, zeros if a hand is not in view.
This matches `frontend/src/lib/landmarks.js`, so don't change one without the other.

## 3. Training (next)

Combine all `data/*.csv`, train in Google Colab, export the model.


## 2. Train the model that reads movement, head and face (this is the one the website uses)

The first scripts above save ONE still picture per row. A still picture cannot tell apart signs that look the
same and differ by movement, head nod/shake, eyebrows or mouth. So this newer path keeps a short video window
(2 seconds) with, per frame, 145 numbers: both hands (126), where the hands are compared to the face (8),
head turn / nod / tilt (3) and face expression (8). The maths is in `features.py`.

### Step 1: videos in folders (same layout as 1b)

```
ml/videos/pain/clip1.mp4
ml/videos/thank_you/take1.mov
```

- Dictionary videos (e.g. BIM SignBank): check the site's terms before using them, and keep the videos
  out of Git (only the numbers are used and saved).
- Your own recordings are better for the final model: a few different people, different light and distance,
  facing the camera so the face and both hands are visible. Film with the normal camera, not a mirror mode.
- Aim for at least 5 clips per sign. With only 1-2 clips the model still trains, but there is no honest test
  for that sign and the live result will be weak.

### Step 2: videos to numbers

```bash
pip install -r requirements.txt
python extract_sequences.py --participant SB     # SB = dictionary videos, P01 = your own, and so on
```

Saves `data/sequences_SB.npz`. Use a different `--participant` per person or source, so the test can use
clips from someone the model did not learn from. Use `--show` to watch the tracking.

### Step 3: train and send the model to the website

```bash
python train.py
```

It prints the TEST accuracy on clips it never trained on, and the signs it mixes up most
("pain -> fever x2"). Record more clips for those. It writes the model into
`../frontend/public/models/signova/` (about 0.5 MB). Commit that folder so the website can load it.

### Step 4: try it

```bash
cd ../frontend
npm install
npm run dev
```

Open the Recognition page and sign. The word appears on the camera picture (grey = guessing, green with a
tick = accepted and added to the signed words). Lower your hands for half a second between signs.
No model files yet? The camera still works and says "Sign model not trained yet".

### If you change the numbers per frame

`features.py` (Python) and `frontend/src/lib/features.js` must stay identical. After a change, run
`python make_fixture.py` then `cd ../frontend && npm run test:features`.
