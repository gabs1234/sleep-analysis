# Sleep Protocol Runner

A local-first, installable PWA for running configurable N-of-1 sleep studies without requiring perfect bedtime logging.

## Daily workflow

- **Daytime:** track an optional private routine (four 15-minute sessions by default).
- **Afternoon/evening:** preview the protocol and record intended meal, screen, wind-down, bed, and lights-out times.
- **Bedtime:** optionally capture actual events with one tap and complete the short subjective check-in.
- **Morning:** record outcomes first, reconstruct only missing bedtime details, then inspect external data.

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

All study and preference data is local to the current browser profile. Full study JSON and CSV exports are available from the Study page. Production collection never falls back to the simulator; synthetic data is created only through explicit developer simulation controls.

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

The service worker is registered only in production builds, avoiding stale development bundles.
