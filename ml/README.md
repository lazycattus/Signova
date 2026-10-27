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

- Goal: 100 samples per sign per participant, 20 signs.
- Vary hand position, distance, speed and lighting a little between samples.
- Each participant gets their own file: `data/landmarks_P01.csv`, `data/landmarks_P02.csv`, ...
  Running again with the same ID continues where you stopped.
- Use anonymous IDs (P01, P02...), never real names. Only numbers are saved, no video.

## 2. Row format

`participant_id, label, L0_x, L0_y, L0_z, ... L20_z, R0_x ... R20_z` = 2 + 126 columns.
Left hand first, then right hand, zeros if a hand is not in view.
This matches `frontend/src/lib/landmarks.js`, so don't change one without the other.

## 3. Training (next)

Combine all `data/*.csv`, train in Google Colab, export the model.
