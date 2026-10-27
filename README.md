# Signova
Web-based real-time BIM sign language recognition for Malaysian healthcare (UPM FYP)

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) and allow camera access.
Hand detection needs an internet connection the first time (it downloads the MediaPipe model).

## Structure

- `frontend/` — React + Vite + Tailwind app (camera, MediaPipe hand landmarks, speech output)
- `backend/` — Flask classifier API (coming)
- `ml/` — data collection script + training notebook (coming)

## Git workflow

`main` stays working. Make one branch per feature (e.g. `feat/camera-mediapipe`), open a pull request, merge.
