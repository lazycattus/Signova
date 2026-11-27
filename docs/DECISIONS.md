# Decisions

Short record of project decisions, newest first. Add a line when you and your partner decide something.

## 27 Nov 2026: Registration and patient-confirmed summaries

- **Scope approved by the project owner:** use one front-desk device for registration, nurse identity verification, and patient review. This updates the earlier no-patient-storage scope below for these specific records.
- **Saved:** nurse-confirmed patient/visit records and versioned snapshots explicitly confirmed by the patient, linked to that visit in PostgreSQL.
- **Temporary:** registration drafts and AAC/pain messages remain in browser memory until confirmation. Reloading clears drafts. No clinical drafts are written to localStorage; legacy AAC storage is removed.
- **Review:** show the patient's original messages, with missing answers displayed as “Not answered”. Corrections require another confirmation. Generated wording and staff messages are excluded.
- **Access:** patient lookup and visit registration require nurse/admin sign-in. IC entry alone does not reveal a record. The nurse verifies which patient owns temporary pain reports before linking them.
- **Handoff:** nurse sign-out preserves only the current patient's device binding. Ending the device session revokes that binding and clears the screen; it does not delete the visit or mark consultation complete.
- **Later work:** downloadable doctor handoff forms and daily reports are not implemented by this update. Retention/deployment decisions remain separate work.

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
