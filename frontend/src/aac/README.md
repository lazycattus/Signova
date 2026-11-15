# Module B AAC board

Adapted from https://github.com/sshananth07/signova-yeehan at commit 734fd38bc7b29f33be4bb091877b1a24be334b01.

The AAC route embeds `aac-board.html`, built as a second Vite entry. This keeps the reference board's Tailwind design tokens and reset isolated from the existing Module A pages. Open AAC in the shared menu, or `/aac-board.html` directly for a full-window board.

Retained: front-desk guided services, English/Malay cards and speech, quick replies, message composer, local wording suggestions, symptoms/allergies, 3D pain map, typing, drawing, feelings/questions, counter view, visit summary, staff replies, local emergency alarm, guide, layout notes, and browser storage.

Removed: bedside profile, ward/bed identity, inpatient care cards, ward reply/question presets, nurse-station page and tab links, shift handover and stay trends, night mode, and timed pain follow-ups. Emergency alerts only sound on the current device. Voice questions and AI wording/summary remain local simulations, as in the reference.

Development: run `npm install` and `npm run dev` from `frontend/`.
Checks: `npm run typecheck:aac`, `npm run test:aac`, `npm run build`.

Anatomy source and license notes are in `public/aac-models/README.md`. The bundled meshes are adapted Z-Anatomy / BodyParts3D data. Keep their attribution and share-alike notices when distributing.
