# Signova frontend

React + Vite + Tailwind. Run it:

```bash
npm install
npm run dev
```

## How pages work (read this before adding one)

Every file in `src/pages/` is a page. It shows up in the top menu and gets its own web address
**automatically**. To add a page you only create ONE new file. You never edit `App.jsx`, the menu
or any shared file, so you and your partner can add pages at the same time without clashing.

```
src/
  pages/        <- one file per page (HomePage, RecognitionPage, AacPage, ...)
  components/   <- shared parts (Layout = top bar, HandCamera, ...)
  lib/          <- helpers (landmarks.js, speak.js, pages.js)
```

### Add a page, step by step

1. Pull and make a branch named after the page:
   ```
   git checkout main
   git pull
   git checkout -b feat/page-history
   ```
2. Create `src/pages/HistoryPage.jsx`:
   ```jsx
   export const title = 'History'   // text in the menu (optional)
   export const order = 40          // position in the menu, smaller = earlier (optional)

   export default function HistoryPage() {
     return <h1 className="text-2xl font-bold">History</h1>
   }
   ```
   - File name ends with `Page.jsx`, starts with a capital letter.
   - The web address comes from the name: `HistoryPage` becomes `/history`, `SignGuidePage` becomes `/sign-guide`.
     (`HomePage` is `/`.) Set `export const path = '/custom'` only if you need a different one.
3. Check it: `npm run dev`, then click your page in the top menu.
4. Save, push, merge:
   ```
   git add .
   git commit -m "Add history page"
   git push -u origin feat/page-history
   ```
   Then make the pull request on GitHub and merge.

### Rules

- **Only edit your own page file.** Need a change in a shared part (`Layout.jsx`, `HandCamera.jsx`)?
  Tell your partner and do it in its own small branch.
- Put page-only pieces in `src/components/` with a clear name (e.g. `HistoryList.jsx`), not inside someone else's page.
- Menu order numbers (`order`): Home 0, Recognition 10, AAC 20, Sign guide 30, History 40. Pick a free number.
- Do not change the 126-number layout in `src/lib/landmarks.js` without also changing `ml/collect_data.py`.

### Pages now

| Page | File | Owner |
| --- | --- | --- |
| Home | `HomePage.jsx` | TBD |
| Recognition (Module A, working camera) | `RecognitionPage.jsx` | TBD |
| AAC (Module B) | `AacPage.jsx` | TBD |
| Sign guide | `SignGuidePage.jsx` | TBD |
| History | `HistoryPage.jsx` | TBD |

Write the owner's name in the table when you start a page.
