# Module B: daily patient dashboard

Open `/nurse-dashboard` on the Vite frontend after signing in at `/nurse-login`. A Patient dashboard menu entry and a dashboard link after successful login are included. Public access returns 401; both nurse (`staff`) and administrator accounts can use the reports.

## Data rules

- Reads the existing PostgreSQL patients, visits and visit_summaries tables. No new migration or dependency is required by this update.
- Date filtering uses `Visit.visit_date`, the Malaysia-local date assigned by registration. Registration/confirmation timestamps are displayed in Asia/Kuala_Lumpur.
- Every registered visit for the selected date is included, including waiting, called, served and cancelled statuses. Unique patients are counted separately from visits.
- Each visit contributes only its highest confirmed summary version. Unsubmitted summaries remain pending; drafts never enter this dashboard.
- Visits with pain count visits containing at least one pain report, even if the reported score is zero. It is a report count, not a severity classification.
- Common symptoms use the eight most frequent exact English symptom labels, counted once per visit. Free text is retained verbatim under other patient messages, not classified or translated. Labels are not diagnoses or prevalence estimates.
- A missing answer displays Not answered. A zero pain score displays 0/10. The table/details only show masked identification numbers.
- Search (name or queue) and summary filters affect the table only. Overview metrics, charts and the daily PDF cover the full selected date.
- The dashboard is a saved-data snapshot. Refresh saved records to see new registrations or corrected summaries. The snapshot time is shown at the bottom.

## Reports

- `GET /api/dashboard/daily?date=YYYY-MM-DD`: protected JSON snapshot.
- `GET /api/dashboard/daily/print?date=YYYY-MM-DD`: protected, escaped printable HTML containing the full day's latest summaries.
- `GET /api/dashboard/visits/<uuid>/print`: protected individual patient handoff report.

Print / PDF buttons open a new browser tab. Choose Print / Save as PDF, then choose Save as PDF in the browser print dialog. PDF rendering is provided by the browser, not a server PDF library. The report queries saved records at the time it opens; a new confirmation between the dashboard refresh and report generation may change the report. Generated time appears on both.

Responses have no-store headers. Dashboard data lives only in component memory. Access is checked on page load, every 30 seconds and on window focus. Nurse-login/dashboard logout broadcasts clear other open dashboards. Close any printed report tabs and sign out before returning the shared device to a patient. Existing saved visits and summaries are never deleted or edited by viewing/exporting the report.

## Verification

From backend, with the existing environment active:

```bash
python -m unittest discover -s tests -v
```

The tests use fictional data and an isolated SQLite database, never the configured PostgreSQL database. They cover date boundaries, unique-patient counts, latest versions, zero/missing values, symptom deduplication, report escaping and access revocation. PostgreSQL and browser interaction checks still need to run locally.

Manual check: register a fictional TEST- patient, confirm pain/symptoms, sign in as nurse, open the selected day's dashboard, view the patient, print the individual/daily reports, correct and reconfirm the summary in AAC, refresh the dashboard, and check that only the new version appears. Test an empty date, pending visit, table search/filter and logout. Use the Vite URL printed by npm, with Flask on 5002.
