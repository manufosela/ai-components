---
'@manufosela/ai-core': patch
---

Fix `requireApi()` in helpers.js rejecting Chrome's class-shaped AI APIs. `prompt()`, `summarize()`, `write()` and `translate()` guarded with `typeof api !== 'object'`, but Chrome exposes `LanguageModel` / `Writer` / `Summarizer` / `Translator` as classes (`typeof === 'function'`), so every helper call threw `"Chrome X API not available"` in real browsers — even after detection reported the API as ready. Now accepts both object and function shapes and adds a regression test using a class with a static `create()`. Same family of fix as the previous `detectAICapabilities()` patch.
