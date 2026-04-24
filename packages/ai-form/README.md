# @manufosela/ai-form

`<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome Built-in AI when available:

- Paste free text to auto-fill inputs (AIC-TSK-0008, shipped).
- Natural-language validation rules (roadmap: AIC-TSK-0009).
- Optional voice input / output (roadmap: AIC-TSK-0010).

If Chrome Built-in AI is **not** available, the component renders the slotted `<form>` as-is and delegates to HTML5 native validation. The underlying `<form>` always works.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## Status

> This release introduces **fill-from-text**. Semantic validation (0009) and voice I/O (0010) are still roadmap.

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
    <label>Nombre <input name="nombre" ai-extract="nombre completo" required /></label>
    <label>Teléfono <input name="telefono" type="tel" ai-extract="número de móvil" /></label>
    <label>Email <input name="email" type="email" ai-extract="dirección de email" /></label>
    <button type="submit">Enviar</button>
  </form>
</ai-form>
```

## Attributes

| Attribute  | Description                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| `language` | BCP-47 language tag (default `en-US`). Consumed by AI + voice features in upcoming releases. |

## Fill-from-text

Declare what each input represents via the `ai-extract` attribute (natural language, any language), then click **📋 Paste & fill** on the toolbar. Paste a free-text blurb, click **Apply**, and the component calls Chrome's Prompt API to extract values and fill matching inputs by `name`.

```html
<input name="telefono" ai-extract="número de móvil" />
```

## Events

Inherits `ai-ready` / `ai-unavailable` from [`AIElement`](../ai-core#events). Emits additionally:

| Event                    | Detail                             | Fired when                                                       |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `ai-paste-assist-start`  | —                                  | User opens the paste panel.                                      |
| `ai-paste-assist-result` | `{ fields: [{name, value}], raw }` | Extraction succeeded; listed fields have been filled.            |
| `ai-no-match`            | `{ reason, response?, parsed? }`   | No usable data extracted, or no slotted inputs had `ai-extract`. |
| `ai-error`               | `{ error, stage: 'paste-assist' }` | The Prompt API call failed.                                      |

## License

MIT © Mánu Fosela
