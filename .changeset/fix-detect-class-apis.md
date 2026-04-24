---
'@manufosela/ai-core': patch
---

Fix `detectAICapabilities()` returning `'unavailable'` for real Chrome Built-in AI APIs. The probe guard required `typeof api === 'object'`, but `LanguageModel`, `Writer`, `Summarizer` and `Translator` are exposed as classes (`typeof === 'function'`), so detection always failed and `<ai-form>` silently rendered the fallback even with the flags enabled. Also accept class/constructor shapes and add a regression test.
