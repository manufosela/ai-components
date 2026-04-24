---
'@manufosela/ai-form': patch
---

Fix the "Chrome Built-in AI not available" notice being unreadable in dark mode. The `[data-state='unsupported']` status banner hardcoded near-black text via `rgba(0, 0, 0, 0.6)` and was invisible on dark hosts. Now derives both text and border from `currentColor` via `color-mix`, and keeps `--ai-form-status-muted-fg` / `--ai-form-status-muted` as overrides.
