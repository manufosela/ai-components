---
'@manufosela/ai-form': minor
---

Status banner + "Enable AI" UX:

- When the Prompt API is `'downloadable'`, `<ai-form>` renders a banner above the toolbar with an **Enable AI** button that triggers `ensureAIReady()` from the click (user-gesture requirement of Chrome). The model downloads once, the banner updates with progress, and the toolbar enables automatically when the state becomes `'available'`.
- When the API is `'downloading'`, the banner shows a live `<progress>` bar driven by `aiDownloadProgress`.
- When no core AI API is usable, the fallback path now renders a small "Chrome Built-in AI not available" notice with a link to the Chrome requirements, so users understand why they see the plain `<form>`.
- The Paste & fill button is now gated on `aiCapabilities.prompt === 'available'` (previously any non-`'unavailable'` state enabled it — which silently failed if the model wasn't downloaded yet).

Shadow part `status` exposes the banner for consumer theming.
