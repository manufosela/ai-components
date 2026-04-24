---
'@manufosela/ai-form': minor
---

Ship **voice I/O** (opt-in):

- `<ai-form>` now applies `VoiceMixin` from `@manufosela/ai-voice` over `AIElement`, so it inherits reactive `listening` / `speaking` / `speechInAvailable` / `speechOutAvailable` plus `voice-*` lifecycle events.
- New boolean attribute `voice-input`: enables the toolbar 🎤 button. Click it to dictate into the currently focused `[ai-voice]` input (or the first one in the slotted form when nothing is focused); a second click stops. The button stays disabled when either the attribute is missing or the browser has no `SpeechRecognition`.
- New boolean attribute `voice-output`: when validation fails on submit, the collected reasons are read aloud via `SpeechSynthesis` in the form's `language`. No-op when either the attribute is missing or the browser has no `SpeechSynthesis`.

Depends on `@manufosela/ai-voice` (workspace dependency at publish time).
