---
'@manufosela/ai-voice': minor
---

Initial release of `@manufosela/ai-voice`:

- `VoiceMixin(Base)` factory mixin that adds reactive voice state (`listening`, `speaking`, `speechInAvailable`, `speechOutAvailable`), methods (`startSpeechInput`, `stopSpeechInput`, `speak`) and bubbled/composed lifecycle events (`voice-transcript`, `voice-start`, `voice-end`, `voice-error`, `voice-unavailable`) to any `LitElement` subclass. Pairs naturally with `AIElement` from `@manufosela/ai-core`.
- `listen(options)` standalone helper: promisified `SpeechRecognition` with `AbortSignal` support and optional interim-result callback.
- `speak(text, options)` standalone helper: promisified `SpeechSynthesis` with `AbortSignal` support.
- `isListenAvailable()` / `isSpeakAvailable()` capability probes.
- 100% JavaScript + JSDoc. `.d.ts` generated from JSDoc at publish time.
