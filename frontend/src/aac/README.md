# Module B AAC board

Adapted from https://github.com/sshananth07/signova-yeehan at commit 734fd38bc7b29f33be4bb091877b1a24be334b01.

The AAC route embeds `aac-board.html`, built as a second Vite entry. This keeps the reference board's Tailwind design tokens and reset isolated from the existing Module A pages. Open AAC in the shared menu, or `/aac-board.html` directly for a full-window board.

Retained: front-desk guided services, English/Malay cards and speech, quick replies, message composer, local wording suggestions, symptoms/allergies, 3D pain map, typing, drawing, feelings/questions, counter view, visit summary, staff replies, local emergency alarm, guide, layout notes, and temporary in-memory drafts.

Removed: bedside profile, ward/bed identity, inpatient care cards, ward reply/question presets, nurse-station page and tab links, shift handover and stay trends, night mode, and timed pain follow-ups. Emergency alerts only sound on the current device. Voice questions and AI wording/summary remain local simulations, as in the reference.

Development: run `npm install` and `npm run dev` from `frontend/`.
Checks: `npm run typecheck:aac`, `npm run test:aac`, `npm run build`.

Anatomy source and license notes are in `public/aac-models/README.md`. The bundled meshes are adapted Z-Anatomy / BodyParts3D data. Keep their attribution and share-alike notices when distributing.

Registration now opens a dedicated bilingual form. The patient reviews their details, then an authenticated nurse verifies identity and confirms the visit on the same device. Returning patients reuse their patient record and an active visit for today when one exists.

The separate Pain button works before registration. Reports stay in memory until a nurse confirms the current patient/visit and the patient reviews and confirms the summary. Missing pain details display “Not answered”; zero remains a valid score. Summary versions contain original patient messages, excluding generated wording and staff replies. Clinical drafts are not stored in localStorage.

Apply the new backend migration before using registration. Backend functional checks use an isolated SQLite database: `python -m unittest discover -s tests -v` from `backend/`. They do not verify PostgreSQL concurrency or a real deployment. Downloadable forms and daily reports are future work.
