# Sleep Protocol Runner

A local-first, installable PWA for running configurable N-of-1 sleep studies without requiring perfect bedtime logging.

## Daily workflow

- **Daytime:** track an optional private routine (four 15-minute sessions by default).
- **Afternoon/evening:** preview the protocol and record intended meal, screen, wind-down, bed, and lights-out times.
- **Bedtime:** optionally capture actual events with one tap and complete the short subjective check-in.
- **Morning:** record outcomes and whether the evening intention was followed before inspecting external data.
- **Later corrections:** tap a date under Study → Activity & Valid Nights to fill gaps or amend the record.

Plans and observations are never silently merged. Actual events include provenance (`live`, `recalled_next_morning`, `recalled_later`, or `wearable`) so downstream analysis can distinguish them.

## Personal configuration

The Settings page lets users change:

- normal workdays;
- whether the evening intention plan is shown;
- the generic name of the private daily routine;
- number of routine sessions and minutes per session.

These personal defaults are stored separately from study protocols and survive a study reset. The routine's meaning does not need to be entered anywhere.

Study protocols are JSON data. Add another built-in protocol in `config/`, register it in `lib/config/study-config.ts`, or import a compatible JSON protocol from Settings.

## Data model

`NightRecord.date` is the civil date on which the evening began. For example, a morning assessment completed on September 14 belongs to the September 13 night record. Times after midnight remain ISO timestamps on September 14 while staying attached to that record.

All study and preference data is saved to the current browser profile first. Durable data lives in IndexedDB; existing `localStorage` installations are migrated automatically with a recovery snapshot retained. Changes are also written to a persistent record-level outbox and retried against the private Pi hub. Newer unsent revisions of the same record coalesce without losing deletion tombstones. OAuth credentials remain device-local and never enter that outbox.

The app checks persistent-storage status when supported and falls back to `localStorage` if IndexedDB fails. Storage and hub-sync state are visible in Settings; Today only shows storage failures. Full study JSON and CSV exports remain available from the Study page. Production collection never falls back to the simulator; synthetic data is created only through explicit developer simulation controls.

`lib/storage/hub-sync.ts` sends stable batches to the same-origin `/api/v1/mutations` endpoint. Only `accepted` and `duplicate` acknowledgements remove an exact mutation revision; failed or absent acknowledgements remain queued. Flushes are serialized within a tab and across cooperating tabs with the Web Locks API. The Settings page also provides a manual retry control.

The production PWA and API share one canonical private origin. Set that origin as `PWA_URL` when running the browser integration harness; it is deliberately not committed to the repository. Browser storage is scoped to the exact origin, so opening the app through a LAN hostname, IP, or different port would create a different browser database. Existing data from another origin should be exported there and restored once from the canonical origin.

## External health data

The current browser connector targets the legacy Google Fit REST API. Android Health Connect is an on-device native API and cannot be read directly by a browser-only PWA. A future robust integration should use either the Google Health API for supported cloud data, file imports, or a small Android companion that bridges Health Connect.

## Development

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
```

`next.config.ts` produces a static export in `out/`. Deploy that directory to `/home/pi/data-hub/pwa-dist` and install `deploy/data-hub.env` from the hub repository as `/etc/data-hub.env`. The service worker is registered only in production builds, avoiding stale development bundles.
