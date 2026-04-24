# @manufosela/ai-voice

> **Library.** No custom element, no tag. Exports a factory mixin (`VoiceMixin`) that decorates any class with voice I/O, plus two standalone Web Speech helpers (`listen`, `speak`). Does not import Lit — the mixin augments whatever Base class you pass it (typically `LitElement` or `AIElement`).

`VoiceMixin` and standalone Web Speech API helpers (`SpeechRecognition` + `SpeechSynthesis`) for AIElement-based web components.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc.

## What's inside

| Export                                       | Description                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `VoiceMixin`                                 | Factory mixin: `class MyEl extends VoiceMixin(AIElement) { … }`. Adds reactive state, methods and events for voice I/O. |
| `listen()`                                   | Standalone helper. Promisified SpeechRecognition. Normalizes the `webkit` prefix.                                       |
| `speak()`                                    | Standalone helper. Promisified SpeechSynthesis.                                                                         |
| `isListenAvailable()` / `isSpeakAvailable()` | Cheap boolean capability probes for both APIs.                                                                          |

## Install

```bash
npm install @manufosela/ai-voice @manufosela/ai-core
```

## Usage

```js
import { AIElement } from '@manufosela/ai-core';
import { VoiceMixin } from '@manufosela/ai-voice';
import { html } from 'lit';

class VoiceDemo extends VoiceMixin(AIElement) {
  renderAI() {
    return html`
      <button @click=${() => this.startSpeechInput({ lang: 'es-ES' })}>🎤</button>
      <button @click=${() => this.speak('Hola', { lang: 'es-ES' })}>🔈</button>
    `;
  }
  renderFallback() {
    return html`<input type="text" />`;
  }
}
customElements.define('voice-demo', VoiceDemo);
```

## Events (mixin)

| Event               | Fired when                                                    |
| ------------------- | ------------------------------------------------------------- |
| `voice-transcript`  | A speech recognition result is available. `detail.transcript` |
| `voice-start`       | Synthesis starts speaking.                                    |
| `voice-end`         | Synthesis finishes or recognition stops cleanly.              |
| `voice-error`       | Either API errored. `detail.error`                            |
| `voice-unavailable` | The user tried to use an unsupported API.                     |

## License

MIT © Mánu Fosela
