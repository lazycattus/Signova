# Individual patient communication report

## Open through the dashboard

Nurse login → Patient dashboard → Patient visits → View → Patient Details → View Individual Report. Pending visits show a disabled Summary not submitted button.

The preview is a separate Vite HTML entry (`patient-report.html`), isolated from dashboard/AAC styling and navigation. It fetches protected saved data from `/api/dashboard/visits/<id>/report?version=<number>`. The dashboard includes the selected confirmed version in the link. An old link opens that same saved version even after a newer confirmation; refreshing the dashboard produces the latest version's link.

## What is saved

The existing `visit_summaries.answers` JSON stores new pain selections with `region: {model_version, part, sub, side}`. Report identifiers use the full visit UUID and summary version. No new table, migration, external service or dependency is required. The database retains the confirmed source data, not a rendered PDF binary. Front/back PNG images are regenerated in memory from that saved version and the bundled model when opening the report. Save as PDF creates a local file through the browser.

Anatomy geometry loading is shared between the existing Pain interface and the report (`bodyModel.ts`). Model version `signova-body-v1` refers to the current bundled body.glb and region classifier. A future geometry/classifier change must use a new model version while preserving old-version rendering or explicitly marking it unavailable. Model attribution remains in public/aac-models/README.md and is included in the report footer.

## Accuracy and fallback

The current Pain screen identifies regions, not exact point coordinates. The report highlights those same regions. Numbered leaders indicate approximate regions, never inferred exact tap positions; front/back labels use the patient's left/right. Regions that face backward place markers in the back view. At most eight selections appear per pair of images; more selections create additional pairs.

Older summaries without region data remain valid. Their pain table displays the saved location text and a clear note that body-map information was not saved. No region is guessed from free text. If model rendering fails, the nurse can retry or explicitly choose a text-only print with a missing-image note. The ordinary print button waits for image decoding. No pain answers are labelled Pain not reported, not No pain. Missing answers remain Not answered; zero remains 0/10.

## Layout and printing

A4 report: header/report ID, patient/visit details, symptoms, body map, numbered pain table, other patient messages, confirmation/version and generation timestamps. The layout supports multiple pages; table headers repeat and map pairs/rows avoid splitting. Print / Save as PDF uses the browser's print dialog. Enable browser headers/footers to add page numbers. The saved data remains pinned to the report's version while generation time changes on reopening.

Preview data/images remain in memory, never localStorage. Access is checked at load, on focus, every 30 seconds, and before printing. Logout broadcasts from the dashboard/login clear the preview. Close report tabs before returning the device to a patient; downloaded/printed files are independent of browser logout.

## Verification

Backend tests use fictional data in SQLite and check nurse access, pending reports, saved region persistence after session refresh, older-version retrieval, legacy records and invalid/mismatched regions. Frontend tests check that the original selected region is transmitted without text-based inference. TypeScript, ESLint and the production build cover the new Vite entry and shared loader.

Local checks still required: front/back WebGL rendering, left/right markers, dense/multiple selections, long text/multi-page PDF output, model load failure, pinned-version reopening, logout, and PostgreSQL persistence. Automated Chrome preview could not launch in the preparation environment; browser appearance and exported PDF pagination are not verified here.
