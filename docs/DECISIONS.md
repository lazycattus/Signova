# Decisions

Short record of project decisions, newest first. Add a line when you and your partner decide something.

## 16 Nov 2026: Recognise signs from movement, head and face, running in the browser

- **Decision:** the model reads a 2-second window of frames, not one still picture. Per frame it gets both hands,
  where the hands are compared to the face, head turn / nod / tilt, and face expression (mouth, brows, eyes, cheeks).
  The word being signed is shown on the camera picture.
- **Why:** some signs look the same in one picture and differ by movement or by head and face (as taught in sign
  language class). The supervisor also asked to see the signed word on the camera.
- **Where it runs:** in the browser with TensorFlow.js (no network delay per sign). Training is in Python (`ml/train.py`).
  This differs from the proposal, which says a Flask classifier API. Flask is still possible for training or later use.
- **Training data:** videos (dictionary videos and our own recordings), turned into numbers by `ml/extract_sequences.py`.
  Only numbers are stored, no video or faces are kept in the repo.
- **Headshake = no (built, switched OFF):** BIM has its own sign for NO (one of the 37), so patients say "no pain"
  by signing NO + PAIN, and the sentence builder already makes "I am not in pain". An optional rule that adds "no"
  after a headshake exists (`HEADSHAKE_MEANS_NO` in `recognizer.js`) but stays off until a BIM teacher or Deaf signer
  confirms a headshake is used like that. A wrong "no" would be a risky mistake. The head and face numbers are still
  used by the model to tell signs apart.
- **Not decided:** how many recordings and people are needed for a good accuracy. Check the TEST accuracy that
  `train.py` prints and record more clips for the signs that get mixed up.

## 16 Nov 2026: Help desk and patient only, no bed or ward wording

- **Decision:** for now the system is a conversation between the help desk (nurse) and the patient. It is not a
  bedside system, so the screens do not mention bed, ward or the patient's name.
- **Why:** if a doctor used it, the system would need to know which patient it is, which means a patient ID.
  There is no patient ID yet, and no patient information is stored (see 3 Nov).
- **Changed:** Home page wording (no "Bed 12", "Wad 5B", "Hello, Farhan", "bedside camera"). The Module B AAC
  board already had its bedside and ward identity removed.
- **Not decided:** doctor use. It would need a patient ID first.
- **Note:** the hospital / bed bar from the Stitch design (footer) should not be built with bed or ward text.

## 3 Nov 2026: No patient history is stored

- **Decision:** the system does not save session history. There is no History page and no logging of sentences,
  captions, questions or alerts to Firebase.
- **Instead:** the nurse sees the conversation of the **current visit** as a list on the screen. It lives only in
  the browser's memory and is cleared when the visit ends or the page is closed.
- **Why:** the conversation contains health information (symptoms). Keeping it needs a clear PDPA basis and
  retention rules, which are not decided yet.
- **Still stored:** queue tickets (clinic ticket number only, deleted at the end of each clinic day).
- **Future work:** optional stored history (off by default, auto-deleted, nurse sign-in) if the supervisor approves.
- **Affects:** SRS use case SRS_UC_06 and requirements FR 6.0 to FR 6.3 (moved to future work); task "Session
  history log" becomes "Visit list on screen (not saved)".
