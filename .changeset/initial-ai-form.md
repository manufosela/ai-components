---
'@manufosela/ai-form': minor
---

Initial release of `@manufosela/ai-form` — skeleton.

- `<ai-form>` custom element, extends `AIElement` from `@manufosela/ai-core`.
- Reactive `language` attribute (BCP-47 tag, default `"en-US"`).
- Renders the AI toolbar + error container when Chrome AI is available (placeholder buttons for now — functionality lands in 0.2.0+), or the slotted `<form>` as-is on fallback.
- Shadow parts `toolbar` and `errors` for consumer theming.
- Inherits the `ai-ready` / `ai-unavailable` events from `AIElement`.
- 100% JavaScript + JSDoc. `.d.ts` generated from JSDoc at publish time.

Planned follow-ups: fill-from-text (AIC-TSK-0008), semantic validation (AIC-TSK-0009), voice I/O (AIC-TSK-0010).
