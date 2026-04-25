---
'@manufosela/ai-form': minor
---

Deterministic format validation via [`@manufosela/form-validators`](https://www.npmjs.com/package/@manufosela/form-validators). Mark a field with `ai-format="<validator>"` (or the equivalent `data-tovalidate="<validator>"` for drop-in compat with `automatic_form_validation`) to guarantee the AI never writes a value that fails the format check.

After every extraction, each value is run through the matching pure predicate. If it fails, the value is **dropped**, the chat assistant pushes a localized error bubble (es / en) and the field stays empty so the next dynamic prompt re-asks for it. The same predicate runs as a final safety net at submit time, so manual edits cannot bypass the check.

Catalogue includes Spanish documents (`nif`, `nie`, `cif`), banking (`bankAccountEs`, `creditCard`), communications (`email`, `url`, `mobileEs`, `landlineEs`, `telephoneEs`, `postalCodeEs`, `iccid`), date and primitive checkers. Aliases like `movil`, `correo`, `tarjetacredito`, `cuentabancaria` are accepted.

**New event:** `ai-extraction-rejected` with `detail: { fields: [{name, format, value}], stage? }`. `stage === 'submit'` indicates the failure was caught at the submit gate rather than during chat extraction.

**New runtime dependency:** `@manufosela/form-validators ^0.1.0` (MIT, zero deps, zero DOM).
