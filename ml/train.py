"""
Signova: train the sign model and export it for the browser.

    pip install -r requirements.txt
    python train.py

It reads data/sequences_*.npz (made by extract_sequences.py), trains a small model on
2-second windows (hands + movement + head + face), prints how well it does on clips it
has NOT seen, and writes the model for the website to:

    ../frontend/public/models/signova/model.json
    ../frontend/public/models/signova/weights.bin

Useful options:
    --epochs 40          more / fewer rounds of learning
    --per-clip 80        how many varied copies of each clip to train on
    --out PATH           where to write the web model

Few clips per sign (e.g. only 1 or 2 from the dictionary)? Training still works, because every clip is
copied many times with small changes (shift, speed, noise). But then there is NO honest test score
for that sign, and the live result will be weaker. Record more clips of your own for the signs that
get confused (see the "most confused" list printed at the end).
"""
import argparse
import glob
import json
import os
import random

import numpy as np

from features import FEATURE_COUNT, FPS, HAND_NUMBERS, WINDOW

HERE = os.path.dirname(os.path.abspath(__file__))
FACE_START = HAND_NUMBERS  # columns from here on are hand-vs-face, head and expression numbers


# ----------------------------------------------------------------------------- data

def load_clips(data_dir):
    clips = []  # (frames, label, participant, name)
    for path in sorted(glob.glob(os.path.join(data_dir, "sequences_*.npz"))):
        who = os.path.basename(path)[len("sequences_"):-len(".npz")]
        z = np.load(path)
        if int(z["feature_count"]) != FEATURE_COUNT:
            raise SystemExit(f"{path} has a different number of features. Run extract_sequences.py again.")
        for i, (label, name) in enumerate(zip(z["labels"], z["names"])):
            clips.append((z[f"clip{i}"].astype(np.float32), str(label), who, str(name)))
    return clips


def split_clips(clips, seed):
    """Hold one clip back per sign (only if the sign has 3 or more clips) to test honestly."""
    rng = random.Random(seed)
    by_label = {}
    for c in clips:
        by_label.setdefault(c[1], []).append(c)
    train, test = [], []
    for label, group in by_label.items():
        group = group[:]
        rng.shuffle(group)
        if len(group) >= 3:
            test.append(group[0])
            train += group[1:]
        else:
            train += group
    return train, test


# ----------------------------------------------------------------------------- windows

def stretch(clip, new_len):
    """Play the clip faster/slower: resample to new_len frames."""
    if new_len == len(clip):
        return clip
    old = np.linspace(0, 1, len(clip))
    new = np.linspace(0, 1, new_len)
    return np.stack([np.interp(new, old, clip[:, j]) for j in range(clip.shape[1])], axis=1)


def place(clip, offset):
    """Put the clip inside an empty (all zero = no hands, no face) window."""
    w = np.zeros((WINDOW, FEATURE_COUNT), dtype=np.float32)
    w[offset: offset + len(clip)] = clip
    return w


def fit_length(clip):
    return stretch(clip, WINDOW) if len(clip) > WINDOW else clip


def centered_windows(clip):
    clip = fit_length(clip)
    room = WINDOW - len(clip)
    return [place(clip, o) for o in sorted({0, room // 2, room})]


def augmented_window(clip, rng):
    speed = rng.uniform(0.8, 1.25)
    clip = stretch(clip, max(4, int(round(len(clip) * speed))))
    clip = fit_length(clip).copy()
    active = np.abs(clip[:, :HAND_NUMBERS]).sum(axis=1) > 0

    # move / zoom the whole person in the picture: only the absolute hand dots change,
    # the hand-vs-face numbers stay the same (they are relative), just like in real life
    dx, dy = rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08)
    zoom = rng.uniform(0.9, 1.1)
    for hand in (0, 63):
        on = np.abs(clip[:, hand:hand + 63]).sum(axis=1) > 0
        for p in range(21):
            col = hand + p * 3
            clip[on, col] = (clip[on, col] - 0.5) * zoom + 0.5 + dx
            clip[on, col + 1] = (clip[on, col + 1] - 0.5) * zoom + 0.5 + dy
    clip[active, :HAND_NUMBERS] += np.where(
        clip[active, :HAND_NUMBERS] != 0, np.random.default_rng(rng.randrange(1 << 30)).normal(0, 0.004, (active.sum(), HAND_NUMBERS)), 0
    )
    clip[active, FACE_START:] += np.random.default_rng(rng.randrange(1 << 30)).normal(0, 0.01, (active.sum(), FEATURE_COUNT - FACE_START))

    if rng.random() < 0.12:  # sometimes the face is not found: the model must still cope
        clip[:, FACE_START:] = 0

    return place(clip, rng.randint(0, WINDOW - len(clip)))


def build_set(clips, labels, per_clip, seed, augment):
    rng = random.Random(seed)
    xs, ys = [], []
    for frames, label, _, _ in clips:
        y = labels.index(label)
        if augment:
            for _ in range(per_clip):
                xs.append(augmented_window(frames, rng))
                ys.append(y)
        else:
            for w in centered_windows(frames):
                xs.append(w)
                ys.append(y)
    return np.stack(xs), np.array(ys)


# ----------------------------------------------------------------------------- model

def build_model(n_classes):
    from tensorflow import keras
    from tensorflow.keras import layers

    # Only layer kinds that the website (TensorFlow.js) can rebuild exactly. See frontend/src/lib/recognizer.js
    return keras.Sequential([
        keras.Input(shape=(WINDOW, FEATURE_COUNT)),
        layers.Conv1D(64, 5, padding="same", activation="relu"),
        layers.Dropout(0.2),
        layers.MaxPooling1D(2),
        layers.Conv1D(96, 5, padding="same", activation="relu"),
        layers.MaxPooling1D(2),
        layers.Conv1D(128, 3, padding="same", activation="relu"),
        layers.GlobalMaxPooling1D(),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(n_classes, activation="softmax"),
    ])


def export_web(model, labels, mean, std, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    weights = model.get_weights()
    with open(os.path.join(out_dir, "weights.bin"), "wb") as f:
        for w in weights:
            f.write(np.asarray(w, dtype="<f4").tobytes())
    meta = {
        "version": 1,
        "window": WINDOW,
        "fps": FPS,
        "features": FEATURE_COUNT,
        "labels": labels,
        "mean": [round(float(v), 6) for v in mean],
        "std": [round(float(v), 6) for v in std],
        "weightShapes": [list(w.shape) for w in weights],
    }
    with open(os.path.join(out_dir, "model.json"), "w") as f:
        json.dump(meta, f)
    size = sum(w.size for w in weights) * 4 / 1024
    print(f"Wrote web model to {out_dir} ({size:.0f} KB of weights)")


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "data"))
    ap.add_argument("--out", default=os.path.join(HERE, "..", "frontend", "public", "models", "signova"))
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--per-clip", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    clips = load_clips(args.data)
    if not clips:
        raise SystemExit("No data/sequences_*.npz found. Run extract_sequences.py first.")
    from collect_data import SIGNS
    present = {c[1] for c in clips}
    labels = [s for s in SIGNS if s in present]
    print(f"{len(clips)} clips, {len(labels)} of 37 signs.")
    counts = {l: sum(1 for c in clips if c[1] == l) for l in labels}
    few = [l for l, n in counts.items() if n < 3]
    if few:
        print(f"Only 1-2 clips (no honest test for these): {', '.join(few)}")
    missing = [s for s in SIGNS if s not in present]
    if missing:
        print(f"No clips yet, the website will NOT recognise: {', '.join(missing)}")

    train, test = split_clips(clips, args.seed)
    from tensorflow import keras
    keras.utils.set_random_seed(args.seed)

    x_train, y_train = build_set(train, labels, args.per_clip, args.seed, augment=True)
    active = np.abs(x_train[:, :, :HAND_NUMBERS]).sum(axis=2) > 0
    frames = x_train[active]
    mean = frames.mean(axis=0)
    std = np.maximum(frames.std(axis=0), 0.01)
    norm = lambda x: ((x - mean) / std).astype(np.float32)

    # every sign counts the same, even if it has more clips
    freq = np.bincount(y_train, minlength=len(labels)).astype(np.float32)
    weights = (1.0 / np.maximum(freq, 1))[y_train]
    weights *= len(weights) / weights.sum()

    val = None
    if test:
        x_val, y_val = build_set(test, labels, 0, args.seed, augment=False)
        val = (norm(x_val), y_val)
        print(f"Testing on {len(test)} clips the model never trains on.")

    model = build_model(len(labels))
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    cb = [keras.callbacks.ReduceLROnPlateau(monitor="loss", factor=0.5, patience=4, min_lr=1e-5)]
    if val:
        cb.append(keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=10, restore_best_weights=True))
    model.fit(norm(x_train), y_train, sample_weight=weights, epochs=args.epochs, batch_size=64,
              validation_data=val, callbacks=cb, verbose=2)

    if val:
        pred = model.predict(val[0], verbose=0).argmax(axis=1)
        acc = float((pred == val[1]).mean())
        print(f"\nTEST accuracy on unseen clips: {acc * 100:.1f}%  ({len(test)} clips)")
        pairs = {}
        for t, p in zip(val[1], pred):
            if t != p:
                pairs[(labels[t], labels[p])] = pairs.get((labels[t], labels[p]), 0) + 1
        if pairs:
            print("Most confused (real -> model said):")
            for (a, b), n in sorted(pairs.items(), key=lambda kv: -kv[1])[:8]:
                print(f"  {a} -> {b}  x{n}")
    else:
        tr = model.predict(norm(x_train[:2000]), verbose=0).argmax(axis=1)
        print(f"\nTraining accuracy {float((tr == y_train[:2000]).mean()) * 100:.1f}% (NOT a real test: no unseen clips)")

    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    model.save(os.path.join(HERE, "models", "signova.keras"))
    export_web(model, labels, mean, std, args.out)


if __name__ == "__main__":
    main()
