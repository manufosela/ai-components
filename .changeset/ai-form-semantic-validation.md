---
'@manufosela/ai-form': minor
---

Ship **semantic validation**:

- Inputs, textareas and selects can declare a natural-language rule with `ai-validate="<rule>"` (e.g. `"valid Spanish mobile number"`, `"professional tone, max 200 words"`).
- On submit, `<ai-form>` intercepts the bubbled submit event. For every non-empty `[ai-validate][name]` field it asks the Chrome Prompt API whether the value satisfies the rule (parallel calls). Failed rules are reported with the native Constraint Validation API: `setCustomValidity(reason)` + `form.reportValidity()`. When every rule passes, the submit is replayed once with a one-shot bypass flag, so the browser performs a normal submission.
- If the Prompt API is not available (or the form has no `ai-validate` fields), the submit proceeds natively with the browser's HTML5 validation.

New events: `ai-validation-start`, `ai-validation-passed`, `ai-validation-failed`. The existing `ai-error` event now carries `stage: 'paste-assist' | 'semantic-validation'` in its detail. Host reflects `aria-busy="true"` while validating.
