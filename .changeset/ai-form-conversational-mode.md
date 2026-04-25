---
'@manufosela/ai-form': minor
---

Conversational mode for `<ai-form>`. When Chrome Built-in AI is available, the component now renders a chat UI above the slotted `<form>`: an instructional prompt listing required/optional AI-candidate fields (plus a reminder for required manual fields), a free-text textarea (optionally with a 🎤 mic), and a **Check** button. Typing or dictating an answer and pressing Check calls the Prompt API; the AI extracts values and fills matching slotted inputs (by `name`), which remain visible as a live ledger. A **Submit** button surfaces only when `form.checkValidity()` passes — every required field (AI or manual) is satisfied and no semantic rule failed.

**Breaking UX (no API break):**

- The 📋 Paste & fill toolbar has been replaced by the conversational chat. Consumers did not need to invoke paste-assist programmatically, so published types are compatible; the visual UI is new.
- `voice-input` now dictates into the chat textarea (not the focused `[ai-voice]` input). The `ai-voice` attribute no longer has any special meaning — voice always targets the chat.
- Events `ai-paste-assist-start` / `ai-paste-assist-result` are removed. Replace with `ai-conversation-update` (chat state changes) and `ai-field-extracted` (value written into a specific input).

**New:**

- `ai-extract` is still the marker for AI-fillable fields. Inputs without it (file, checkbox, select, date, …) are treated as **manual**; the dynamic prompt mentions them when required and empty.
- Dynamic chat prompt in `en` and `es` (BCP-47 first segment). Unknown languages fall back to `en`.
- New events: `ai-conversation-update`, `ai-field-extracted`.
- New shadow parts: `chat`, `chat-prompt`, `chat-textarea`, `check`, `mic`, `submit`, `submit-wrap`.
- `setCustomValidity('')` is now cleared automatically when the user edits a field, preventing stale custom validity from blocking the Submit button.
- While the AI model is `downloadable` / `downloading`, the chat textarea and Check button stay disabled so the user can't interact before the model is ready.
