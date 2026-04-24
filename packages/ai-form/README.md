# @manufosela/ai-form

> **Web component.** Registers the `<ai-form>` custom element on import. Depends on the libraries `@manufosela/ai-core` and `@manufosela/ai-voice`.

`<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome Built-in AI when available:

- Paste free text to auto-fill inputs (AIC-TSK-0008, shipped).
- Natural-language validation rules (AIC-TSK-0009, shipped).
- Optional voice input / output (AIC-TSK-0010, shipped).

If Chrome Built-in AI is **not** available, the component renders the slotted `<form>` as-is and delegates to HTML5 native validation. The underlying `<form>` always works.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## Status

> Fill-from-text, semantic validation and **voice I/O** are shipped. Sprint 1 complete pending docs site and 0.1.0 release (AIC-TSK-0011 / 0012).

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

| Attribute      | Description                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`     | BCP-47 language tag (default `en-US`). Used by all AI + voice features.                                                                      |
| `voice-input`  | When present, the toolbar 🎤 button is enabled and uses SpeechRecognition to dictate into the focused `[ai-voice]` input (or the first one). |
| `voice-output` | When present, validation failures are read aloud via SpeechSynthesis.                                                                        |

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

## Voice I/O

Opt in with attributes on `<ai-form>`. Mark the inputs that should receive dictated text with `ai-voice`:

```html
<ai-form language="es-ES" voice-input voice-output>
  <form>
    <input name="ciudad" ai-voice />
    <textarea name="comentario" ai-voice ai-validate="tono profesional"></textarea>
    <button type="submit">Enviar</button>
  </form>
</ai-form>
```

- Click the toolbar 🎤 button to start dictating into the focused `[ai-voice]` input (or the first `[ai-voice]` input when nothing is focused). Click again to stop. A browser without `SpeechRecognition` keeps the button disabled.
- When `voice-output` is present and validation fails on submit, the collected reasons are read aloud in `language`. `SpeechSynthesis` must be available; otherwise this is a no-op.

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
