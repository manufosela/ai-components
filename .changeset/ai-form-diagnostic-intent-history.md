---
'@manufosela/ai-form': minor
---

Three improvements after first real-user testing of the conversational chat:

**Diagnostic rejection messages for NIF / NIE.** When a NIF is sent without its control letter, the assistant now computes and offers it back ("Te falta la letra de control. Tu DNI sería 52117098H. ¿Me lo confirmas?"). When the letter is wrong, it tells the user which one would match instead of the generic "letra no encaja". Other validators keep their existing per-name messages.

**Intent detection.** The extraction prompt now asks the model to classify the user's message as `extract` / `help` / `clarify` / `correct`. When it isn't data (a question, a doubt, a meta-comment like _"no recuerdo la letra"_), the model returns `__intent` + `__answer`, the answer is shown as a chat bubble, and **no field is written or rejected**. Stops the AI from hallucinating extractions out of conversational utterances. New event `ai-conversation-help` with `{ intent, answer }`.

**Multi-turn context.** New `history-turns` attribute (default `6`, set `0` to disable). The last N assistant + user messages are passed to the extraction prompt as context, so the AI can resolve elided references like _"la letra es L"_ to the DNI mentioned in a previous turn.
