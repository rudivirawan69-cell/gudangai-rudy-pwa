# GudangAI Operations Hub — Setup

This feature is additive. It uses a dedicated `Aktivitas Operasional` sheet and Google Calendar. It does not write to `Stock CV`, `Stock PT`, transaction sheets, PO sheets, or Dashboard ranges.

## Files added or changed

- `src/features/operationsHub/OperationsHub.jsx` — four activity cards, editor, checklist, delete and Calendar search.
- `src/features/operationsHub/operationsHub.css` — theme-aware card and modal styles.
- `src/pages/DashboardPage.jsx` — mounts the new hub above the existing stock summary.
- `src/data/api.js` — authenticated API wrappers for list/save/delete.
- `Code.gs` — isolated POST actions and dedicated sheet/Calendar handlers.

## Backend authorization and setup

1. Open the Apps Script project currently deployed as the GudangAI Web App.
2. Copy the updated `Code.gs` from this branch into that Apps Script project. Keep the existing script properties, especially `API_SECRET` and `SPREADSHEET_ID`.
3. In the Apps Script editor, select and run `setupOperationsHubCalendarAuthorization` once.
4. Approve the Google Calendar permission prompt. This function creates/validates only the `Aktivitas Operasional` tab and checks access to the default Calendar. Events are created in the default Calendar of the Google account that owns/runs the Apps Script Web App; use a shared calendar instead if the team needs a centrally shared calendar.
5. Deploy a **new version** of the existing Web App when you are ready. Keep the existing Web App URL and the same API secret; the PWA already calls that URL.
6. After backend authorization and deployment, build and publish the PWA from this branch using the intended hosting target. This branch has not been merged or deployed by this implementation.

## Sheet schema

The backend creates the following columns automatically on first use:

1. ID Aktivitas
2. Kategori
3. Judul
4. Deskripsi
5. Penanggung Jawab
6. Tanggal
7. Jam
8. Status
9. Checklist JSON
10. Calendar Event ID
11. Dibuat
12. Update Terakhir\n13. Detail Kategori JSON (otomatis ditambahkan ke tab lama tanpa mengubah 12 kolom sebelumnya)

Categories are `order`, `team`, `meeting`, and `logistics`.

## Sync behavior

- New activities receive a stable client-generated ID before the first request. Retrying after a timeout updates the same row rather than creating another.
- The Spreadsheet record is saved first. Calendar failures are reported separately; they do not discard the activity.
- Calendar events are updated by stored event ID. A stable activity marker is also searched on the event date to recover from an interrupted save without creating duplicates.
- Deleting an activity removes its Calendar event first. If Calendar cannot be accessed, the Spreadsheet row is retained and the API reports the error.
- Checklist, owner, date/time, status, description, and category-specific fields are stored in the dedicated activity row. Existing 12-column tabs are upgraded by adding column 13 only.
- All write actions require the existing authenticated POST flow. GET remains read-only.

## Category-specific fields\n\n- **Tambahan Order:** supplier, item/SKU, quantity, unit, confirmation deadline.\n- **Jadwal Off & Tugas:** personel, jenis agenda, end/return date, shift, replacement. Calendar events span through 23:59 WIB on the selected end date.\n- **Meeting & Project:** location/link, participants, agenda, decision, follow-up.\n- **Kirim Luar Kota:** destination, departure time, arrival estimate, vehicle, driver, cargo, quantity.\n\nFields are stored as structured JSON in the dedicated activity sheet, not in stock or PO sheets.\n\n## Validation boundary

The Apps Script source parses successfully with a JavaScript syntax check. A full Vite build has not been verified in this branch. GitHub's automatic Vercel checks for the branch reported build-rate-limit failures; no successful Vercel build or deployment is claimed.
