---
'@manufosela/ai-form': major
'@manufosela/ai-core': major
'@manufosela/ai-voice': major
'@manufosela/ai-testing': major
---

**1.0.0 release.** Project policy from now on: semver from 1.0.0, no 0.x phase.

Hybrid AI + deterministic decision tree in `<ai-form>` (AIC-TSK-0019):

- **Heuristic pre-pass.** Each AI-candidate with `ai-format` has a deterministic regex pattern. The pre-pass runs first and writes any value it can extract — emails, Spanish phones with optional `+34` prefix, NIFs, NIEs, CIFs, IBAN-style accounts, postal codes, credit cards. The AI is only invoked if the pre-pass leaves candidates uncovered.
- **Universal canonicalization.** Every value (from pre-pass or AI) is run through the paired `normalize()` from `@manufosela/form-validators` before validation and writing. So `"+34 639 01 89 87"` ends up in the field as `"639018987"`, `" Manu@Example.IO "` as `"manu@example.io"`, `" 12345678z "` as `"12345678Z"`. Manual edits are also canonicalised by the submit-time gate.
- **Diagnostic pre-pass for NIF / NIE.** When the regex matches digits but they don't form a valid NIF (missing letter, wrong letter), the pre-pass computes the correct control letter and pushes a diagnostic bubble immediately — no AI round-trip needed.
- **Confirmation state machine.** When the assistant pushes a diagnostic with a computed suggestion (e.g. "Tu DNI sería 52117098H. ¿Me lo confirmas?"), the next user turn is matched against affirmation / negation patterns ("sí", "correcto", "no", "incorrecto", …). On affirmation, the suggested value is written directly without invoking the AI. On negation, the suggestion is dropped.
- **`helpHandlers` extension point.** New reactive prop `helpHandlers` (Object) lets consumers override or add custom answers for help/clarify intents.
- **New events:** `ai-confirmation-applied` (suggestion accepted by user). `ai-extraction-rejected` now also fires from the pre-pass with `stage: 'prepass'`.

This bumps `@manufosela/ai-form` and its sister packages to **1.0.0**, consolidating every accumulated change since the previous 0.1.0 line.

Runtime dep on `@manufosela/form-validators` bumped to `^1.0.0` (which now exports `normalize<Name>` per validator and a `normalize(name)` dispatcher).
