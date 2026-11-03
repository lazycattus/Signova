# Decisions

Short record of project decisions, newest first. Add a line when you and your partner decide something.

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
