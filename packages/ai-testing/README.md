# @manufosela/ai-testing

> **Library (devDependency).** No custom element, no tag. Exports setup functions and low-level factories for mocking Chrome AI + Web Speech APIs inside tests.

Reusable mocks of Chrome Built-in AI APIs (LanguageModel, Writer, Summarizer, Translator) and Web Speech APIs (SpeechRecognition, SpeechSynthesis) for testing `AIElement`-based components.

**100% JavaScript + JSDoc. Framework-agnostic** — no peer dependency on Vitest / Jest / mocha. A tiny internal spy tracks calls via a `.calls` array; wrap with your own spy library if you need more.

## What's inside

| Export                                                                              | Description                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setupChromeAIMock(config)`                                                         | Installs fake `LanguageModel` / `Writer` / `Summarizer` / `Translator` on `globalThis` per `config`. Returns `{ mocks, teardown }`.              |
| `setupWebSpeechMock(config)`                                                        | Installs fake `SpeechRecognition`, `SpeechSynthesisUtterance` and `speechSynthesis`. Returns drivers to fire events plus `{ teardown }`.         |
| `createLanguageModelMock(cfg)`                                                      | Low-level factory for a Chrome Prompt API mock.                                                                                                  |
| `createWriterMock(cfg)` / `createSummarizerMock(cfg)` / `createTranslatorMock(cfg)` | Same for the other AI APIs.                                                                                                                      |
| `createSpeechRecognitionMock()`                                                     | Fake SpeechRecognition constructor with an `.instances` array of live instances exposing `.fireResult(items)`, `.fireError(code)`, `.fireEnd()`. |
| `createSynthMock()`                                                                 | Fake `speechSynthesis` + `SpeechSynthesisUtterance` pair with `drive.finish(utterance)` / `drive.fail(utterance, code)` helpers.                 |

## Install

```bash
npm install -D @manufosela/ai-testing
```

## Usage (Vitest example)

```js
import { beforeEach, afterEach, it, expect } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing/chrome-ai';
import { prompt } from '@manufosela/ai-core/helpers';

let teardown;
beforeEach(() => {
  ({ teardown } = setupChromeAIMock({
    prompt: { availability: 'available', response: 'mocked answer' },
  }));
});
afterEach(() => teardown());

it('prompt() returns the mocked response', async () => {
  const out = await prompt('hello');
  expect(out).toBe('mocked answer');
});
```

## License

MIT © Mánu Fosela
