# @manufosela/ai-form

> **Web component.** Registers the `<ai-form>` custom element on import. Depends on the libraries `@manufosela/ai-core` and `@manufosela/ai-voice`.

`<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome Built-in AI when available:

- **Conversational chat UI** — when AI is on, renders a chat above the form: instructional prompt, free-text textarea (optionally with a 🎤 mic) and a "Check" button. The AI extracts values from the user's reply and fills the slotted inputs live. The submit button surfaces only when every `required` field is satisfied.
- **Natural-language validation rules** — inputs with `ai-validate="<rule>"` are validated against the rule via the Prompt API on submit.
- **Voice I/O** — `voice-input` dictates into the chat textarea; `voice-output` reads validation failures aloud.
- **Mixed AI + manual fields** — file uploads, checkboxes, selects, dates (or any input without `ai-extract`) stay visible for the user to fill; the dynamic prompt reminds them when required manual fields are still empty.

If Chrome Built-in AI is **not** available, the component renders the slotted `<form>` as-is and delegates to HTML5 native validation. The underlying `<form>` always works.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## Install

```bash
npm install @manufosela/ai-form @manufosela/ai-core
```

## Usage

```html
<script type="module">
  import '@manufosela/ai-form';
</script>

<ai-form language="es-ES" voice-input voice-output>
  <form>
    <label>Nombre <input name="nombre" ai-extract="nombre completo" required /></label>
    <label>
      Teléfono
      <input
        name="telefono"
        type="tel"
        ai-extract="número de móvil"
        ai-validate="móvil español válido"
        required
      />
    </label>
    <label>Email <input name="email" type="email" ai-extract="dirección de email" /></label>
    <label>
      Comentario
      <textarea
        name="about"
        ai-extract="comentario libre"
        ai-validate="tono profesional, máximo 200 palabras"
      ></textarea>
    </label>
    <label>CV (PDF) <input name="cv" type="file" required /></label>
    <label><input name="tos" type="checkbox" required /> Acepto los términos</label>
  </form>
</ai-form>
```

## Attributes

| Attribute       | Description                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`      | BCP-47 language tag (default `en-US`). Used for the dynamic chat prompt (currently `es` / `en` templates; other languages fall back to `en`) and by all voice features.                                                                              |
| `voice-input`   | When present, a 🎤 button is rendered next to the chat textarea; pressing it dictates via SpeechRecognition into the textarea so the user can review/edit before pressing **Check**.                                                                 |
| `voice-output`  | When present, validation failures are read aloud via SpeechSynthesis.                                                                                                                                                                                |
| `history-turns` | Number of previous chat messages (assistant + user) sent as context to the extraction prompt (default `6`). Set to `0` to disable. Helps the AI resolve elided references like _"the letter is L"_ when the previous turn already mentioned the DNI. |

## Conversational flow

When the Prompt API is available, `<ai-form>` renders a chat UI above the slotted `<form>`:

1. An instructional prompt listing the `required` AI-candidate fields (and optional ones), plus a reminder about any required manual fields.
2. A free-text textarea (+ optional mic).
3. A **Check** button.

The user types or dictates an answer and clicks **Check**. The component calls the Prompt API with every field's `ai-extract` hint, parses the JSON response and writes the extracted values into the matching inputs (by `name`), dispatching `input` + `change` events so any consumer bindings stay in sync. If something is missing, the prompt updates ("¿Me dices tu teléfono?"). When `form.checkValidity()` passes — i.e. every required field (AI or manual) is filled and no semantic rule failed — a **Submit** button appears.

```html
<input name="telefono" ai-extract="número de móvil" required />
```

AI-candidates are **strictly opt-in** via `ai-extract`. Inputs without it — file uploads, checkboxes, `<select>`, dates, or plain text without a hint — are left for the user to fill manually and mentioned in the prompt when required.

## Deterministic format validation

Mark a field with `ai-format="<validator>"` (or the equivalent `data-tovalidate="<validator>"` for drop-in compat with [`automatic_form_validation`](https://www.npmjs.com/package/automatic_form_validation)) to guarantee the AI never writes a value that fails the format check.

```html
<input name="dni" ai-extract="DNI" ai-format="nif" required />
<input name="iban" ai-extract="IBAN" ai-format="bankAccountEs" />
<input name="movil" ai-extract="móvil" ai-format="mobileEs" />
```

After every extraction, the value is run through the matching pure predicate from [`@manufosela/form-validators`](https://www.npmjs.com/package/@manufosela/form-validators). If it fails, the value is **dropped**, the chat assistant pushes a localized error bubble and the field stays empty so the next dynamic prompt re-asks for it. The same predicate runs as a final safety net at submit time, so a manual edit can't bypass the check.

For NIF and NIE the assistant is **diagnostic**: when only the 8 digits are dictated, it computes and offers the correct control letter (_"Te falta la letra de control. Tu DNI sería 52117098H. ¿Me lo confirmas?"_); when the letter is wrong, it tells the user which one would match. Other validators get a generic per-name message.

| Common validators                                                                | Notes                         |
| -------------------------------------------------------------------------------- | ----------------------------- |
| `email`, `url`, `mobileEs`, `landlineEs`, `telephoneEs`, `postalCodeEs`, `iccid` | Communications                |
| `nif`, `nie`, `cif`, `bankAccountEs`                                             | Spanish documents and banking |
| `creditCard`                                                                     | Luhn-checked                  |
| `date`, `integer`, `float`, `number`, `alpha`, `alphanumeric`, `fileExtension`   | Primitives                    |

See the [`@manufosela/form-validators` README](https://www.npmjs.com/package/@manufosela/form-validators) for the full catalogue and the alias list (`movil`, `correo`, `tarjetacredito`, `cuentabancaria`, etc.).

## Semantic validation

Declare natural-language rules on inputs with `ai-validate`:

```html
<textarea name="about" ai-validate="professional tone, max 200 words"></textarea>
<input name="mobile" ai-validate="valid Spanish mobile number" />
```

On submit, `<ai-form>` asks the Prompt API whether each value satisfies its rule (one call per non-empty field, in parallel). Failed rules are reported via the native [Constraint Validation API](https://developer.mozilla.org/docs/Web/API/Constraint_validation): `setCustomValidity(reason)` + `form.reportValidity()`. When every rule passes, the original submit is replayed (the component sets a one-shot bypass flag so it is not re-validated).

If the Prompt API is unavailable, validation is skipped and native HTML5 validation runs as usual.

## Voice I/O

Opt in with attributes on `<ai-form>`. The mic dictates into the chat textarea so the user can review/edit before pressing **Check** — you no longer need to tag individual inputs.

```html
<ai-form language="es-ES" voice-input voice-output>
  <form>
    <input name="ciudad" ai-extract="ciudad donde vive" required />
    <textarea
      name="comentario"
      ai-extract="comentario libre"
      ai-validate="tono profesional"
    ></textarea>
  </form>
</ai-form>
```

- Click the 🎤 next to the chat textarea to start dictating. Click again to stop. A browser without `SpeechRecognition` keeps the button disabled.
- When `voice-output` is present and validation fails on submit, the collected reasons are read aloud in `language`. `SpeechSynthesis` must be available; otherwise this is a no-op.

## Events

Inherits `ai-ready` / `ai-unavailable` / `ai-download-*` from [`AIElement`](../ai-core#events). Emits additionally:

| Event                    | Detail                                             | Fired when                                                                                                                                         |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-conversation-update` | `{ pendingAIFields, pendingManualFields, prompt }` | The chat state (prompt or complete flag) changed.                                                                                                  |
| `ai-conversation-help`   | `{ intent, answer }`                               | The AI classified the user's message as `'help' \| 'clarify' \| 'correct'` instead of data; `answer` is shown as a bubble and no field is written. |
| `ai-field-extracted`     | `{ name, value }`                                  | The AI wrote a value into a slotted input.                                                                                                         |
| `ai-extraction-rejected` | `{ fields: [{name, format, value}], stage? }`      | One or more values failed their `ai-format` predicate and were dropped (or blocked submit when `stage === 'submit'`).                              |
| `ai-no-match`            | `{ reason, response?, parsed? }`                   | An extraction round produced no fields (no `ai-extract`, empty JSON, …).                                                                           |
| `ai-validation-start`    | `{ fields: string[] }`                             | Semantic validation started on submit.                                                                                                             |
| `ai-validation-passed`   | `{ results: ValidationResult[] }`                  | Every field satisfied its rule; submit proceeds natively.                                                                                          |
| `ai-validation-failed`   | `{ results: ValidationResult[] }`                  | At least one rule failed; submit blocked and `reportValidity()` called.                                                                            |
| `ai-error`               | `{ error, stage }`                                 | An AI call failed (`stage` is `'conversation-extract'` or `'semantic-validation'`).                                                                |

## License

MIT © Mánu Fosela
