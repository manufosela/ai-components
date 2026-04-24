---
'@manufosela/ai-testing': minor
---

Initial release of `@manufosela/ai-testing`:

- `setupChromeAIMock(config)` — installs fake `LanguageModel` / `Writer` / `Summarizer` / `Translator` on `globalThis` per config and returns `{ mocks, teardown }`.
- `setupWebSpeechMock(config)` — installs fake `SpeechRecognition` / `SpeechSynthesisUtterance` / `speechSynthesis` and returns drivers (`fireResult`, `fireError`, `fireEnd`, `drive.finish`, `drive.fail`) plus teardown.
- Low-level factories: `createLanguageModelMock`, `createWriterMock`, `createSummarizerMock`, `createTranslatorMock`, `createSpeechRecognitionMock`, `createSynthMock`.
- Framework-agnostic: no peer dependency on Vitest / Jest. Internal spy exposes a `.calls` array and `.reset()` so consumers can wrap with their favorite assertion library.
- 100% JavaScript + JSDoc. `.d.ts` generated from JSDoc at publish time.
