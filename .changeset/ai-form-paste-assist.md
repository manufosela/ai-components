---
'@manufosela/ai-form': minor
---

Ship **fill-from-text** (paste-assist):

- Add `ai-extract="<description>"` to any slotted input, textarea or select with a `name`.
- Click the toolbar's **📋 Paste & fill** button (now enabled when the Chrome Prompt API is available) and paste a free-text blurb.
- `<ai-form>` asks the Prompt API to extract the declared fields and fills the matching inputs by `name`, then dispatches `input` and `change` events on each filled element so external validators re-run.

The parser tolerates raw JSON, markdown-fenced JSON and JSON embedded in surrounding prose. New events: `ai-paste-assist-start`, `ai-paste-assist-result`, `ai-no-match`, `ai-error`.
