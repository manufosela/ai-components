# @manufosela/ai-form

`<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome Built-in AI when available:

- Paste free text to auto-fill inputs (AIC-TSK-0008, shipped).
- Natural-language validation rules (AIC-TSK-0009, shipped).
- Optional voice input / output (roadmap: AIC-TSK-0010).

If Chrome Built-in AI is **not** available, the component renders the slotted `<form>` as-is and delegates to HTML5 native validation. The underlying `<form>` always works.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## Status

> Fill-from-text and **semantic validation** are shipped. Voice I/O (0010) is next.

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
    <label
      >Teléfono
      <input
        name="telefono"
        type="tel"
        ai-extract="número de móvil"
        ai-validate="móvil español válido"
    /></label>
    <label>Email <input name="email" type="email" ai-extract="dirección de email" /></label>
    <label
      >Comentario
      <textarea name="about" ai-validate="tono profesional, máximo 200 palabras"></textarea>
    </label>
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

## Semantic validation

Declare natural-language rules on inputs with `ai-validate`:

```html
<textarea name="about" ai-validate="professional tone, max 200 words"></textarea>
<input name="mobile" ai-validate="valid Spanish mobile number" />
```

On submit, `<ai-form>` asks the Prompt API whether each value satisfies its rule (one call per non-empty field, in parallel). Failed rules are reported via the native [Constraint Validation API](https://developer.mozilla.org/docs/Web/API/Constraint_validation): `setCustomValidity(reason)` + `form.reportValidity()`. When every rule passes, the original submit is replayed (the component sets a one-shot bypass flag so it is not re-validated).

If the Prompt API is unavailable, validation is skipped and native HTML5 validation runs as usual.

## Events

Inherits `ai-ready` / `ai-unavailable` from [`AIElement`](../ai-core#events). Emits additionally:

| Event                    | Detail                             | Fired when                                                                  |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------------------- |
| `ai-paste-assist-start`  | —                                  | User opens the paste panel.                                                 |
| `ai-paste-assist-result` | `{ fields: [{name, value}], raw }` | Paste-assist succeeded; listed fields have been filled.                     |
| `ai-no-match`            | `{ reason, response?, parsed? }`   | No usable data extracted, or no slotted inputs had `ai-extract`.            |
| `ai-validation-start`    | `{ fields: string[] }`             | Semantic validation started on submit.                                      |
| `ai-validation-passed`   | `{ results: ValidationResult[] }`  | Every field satisfied its rule; submit proceeds natively.                   |
| `ai-validation-failed`   | `{ results: ValidationResult[] }`  | At least one rule failed; submit blocked and `reportValidity()` called.     |
| `ai-error`               | `{ error, stage }`                 | An AI call failed (`stage` is `'paste-assist'` or `'semantic-validation'`). |

## License

MIT © Mánu Fosela
