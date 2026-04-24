# @manufosela/ai-core

Base class and helpers for building web components backed by Chrome Built-in AI.

**100% JavaScript + JSDoc.** Published `.d.ts` generated from JSDoc for full type support in consumers.

## What's inside

| Export                   | Description                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIElement`              | `LitElement` subclass with reactive `aiAvailable` / `aiCapabilities`, capability detection on mount, and a default `render()` that switches between `renderAI()` and `renderFallback()`. |
| `detectAICapabilities()` | Standalone function that inspects the browser for Prompt / Writer / Summarizer / Translator / Speech APIs and returns a capability object.                                               |
| Helpers                  | Thin wrappers around Chrome AI APIs (`prompt`, `summarize`, `write`, `translate`) that manage session lifecycle and errors.                                                              |

## Install

```bash
npm install @manufosela/ai-core
```

## Usage

```js
import { AIElement } from '@manufosela/ai-core';
import { html } from 'lit';

class MyAIThing extends AIElement {
  renderAI() {
    return html`<button @click=${this._run}>Ask AI</button>`;
  }

  renderFallback() {
    return html`<p>AI is not available in this browser.</p>`;
  }

  async _run() {
    const answer = await this.prompt('Hello');
    // …
  }
}
customElements.define('my-ai-thing', MyAIThing);
```

## Events

| Event            | Fired when                                                          |
| ---------------- | ------------------------------------------------------------------- |
| `ai-ready`       | Capability detection finished and at least one AI API is available. |
| `ai-unavailable` | Capability detection finished and no AI API is available.           |
| `ai-error`       | A helper call failed.                                               |

## Philosophy

No adapter abstraction. No fallback backend. The component decides at mount time whether to render an AI-enriched UI or a plain one — both are implemented in the same component.

## License

MIT © Mánu Fosela
