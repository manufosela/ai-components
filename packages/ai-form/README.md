# @manufosela/ai-form

`<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome Built-in AI when available:

- Paste free text to auto-fill inputs (roadmap: AIC-TSK-0008).
- Natural-language validation rules (roadmap: AIC-TSK-0009).
- Optional voice input / output (roadmap: AIC-TSK-0010).

If Chrome Built-in AI is **not** available, the component renders the slotted `<form>` as-is and delegates to HTML5 native validation. The underlying `<form>` always works.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## Status

> This release (**0.1.0**) is the skeleton: capability detection and the AI/fallback UI switch, with the AI toolbar rendered as disabled placeholders. Functionality lands in follow-up releases.

## Install

```bash
npm install @manufosela/ai-form @manufosela/ai-core
```

## Usage

```html
<script type="module">
  import '@manufosela/ai-form';
</script>

<ai-form language="es-ES">
  <form>
    <label>Nombre <input name="name" required /></label>
    <label>Teléfono <input name="phone" type="tel" /></label>
    <button type="submit">Enviar</button>
  </form>
</ai-form>
```

## Attributes

| Attribute  | Description                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| `language` | BCP-47 language tag (default `en-US`). Consumed by AI + voice features in upcoming releases. |

## Events

Inherits from [`AIElement`](../ai-core#events):

| Event            | Fired when                                                 |
| ---------------- | ---------------------------------------------------------- |
| `ai-ready`       | Detection finished and at least one core AI API is usable. |
| `ai-unavailable` | Detection finished and no core AI API is usable.           |

## License

MIT © Mánu Fosela
