---
'@manufosela/ai-core': minor
---

Align with Chrome Built-in AI's real four-state lifecycle and expose it to consumers:

- `AICapabilityState` now distinguishes `'downloading'` from `'downloadable'` (previously collapsed into `'downloadable'`). `'after-download'` and `'readily'` are still normalized for backward compatibility.
- `AIElement` exposes two reactive booleans:
  - `aiAvailable`: any core AI API is not `'unavailable'` (what `render()` uses to pick AI vs fallback).
  - `aiReady`: at least one core AI API is `'available'` (synchronously usable — no download needed).
- New method `AIElement.ensureAIReady({ apis })` — must be called from a user gesture. Triggers `create({ monitor })` on the first requested API that is `'downloadable'` or `'downloading'`, surfaces progress via new events `ai-download-start`, `ai-download-progress` (`detail.loaded` 0..1), `ai-download-complete` and `ai-download-error`. Concurrent calls share the in-flight promise.
- New reactive `aiDownloading` (boolean) and `aiDownloadProgress` (0..1) so consumers can render progress UI.
