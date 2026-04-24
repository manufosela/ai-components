---
'@manufosela/ai-core': minor
---

Initial release of `@manufosela/ai-core`:

- `AIElement` base class (extends `LitElement`) with reactive `aiAvailable` / `aiCapabilities`, automatic capability detection on `connectedCallback`, `ai-ready` / `ai-unavailable` lifecycle events, and a default `render()` that dispatches to `renderAI()` / `renderFallback()`.
- `detectAICapabilities()` standalone utility: probes `globalThis` for Prompt / Writer / Summarizer / Translator / SpeechRecognition / SpeechSynthesis and returns a typed `AICapabilities` object. Never throws.
- Thin helpers `prompt()`, `summarize()`, `write()`, `translate()` around Chrome Built-in AI APIs, with session creation, single-call execution and guaranteed session destruction.
- 100% JavaScript + JSDoc. `.d.ts` are generated from JSDoc at publish time.
