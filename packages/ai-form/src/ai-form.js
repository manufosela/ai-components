import { html, css } from 'lit';
import { AIElement } from '@manufosela/ai-core';

/**
 * `<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome
 * Built-in AI when available.
 *
 * When Chrome AI is present (at least one of Prompt / Writer / Summarizer /
 * Translator is `available` or `downloadable`), the component renders an
 * AI toolbar above the slotted form. When AI is unavailable, it renders the
 * slotted form as-is and relies on native HTML5 validation.
 *
 * This release (0.1.0) is the skeleton. The toolbar buttons are placeholders;
 * the fill-from-text, semantic validation and voice behaviors land in
 * AIC-TSK-0008 / 0009 / 0010.
 * @customElement ai-form
 * @slot       Default slot: the `<form>` the component wraps.
 * @fires ai-ready       Inherited from AIElement.
 * @fires ai-unavailable Inherited from AIElement.
 */
export class AIForm extends AIElement {
  static properties = {
    /** BCP-47 language tag used by upcoming AI + voice features. */
    language: { type: String, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
      font: inherit;
      color: inherit;
    }
    .ai-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      align-items: center;
      padding: 0.25rem 0;
      margin-bottom: 0.5rem;
      border-bottom: 1px solid var(--ai-form-toolbar-border, rgba(0, 0, 0, 0.1));
    }
    .ai-toolbar button {
      appearance: none;
      border: 1px solid var(--ai-form-button-border, rgba(0, 0, 0, 0.15));
      background: var(--ai-form-button-bg, transparent);
      color: inherit;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      font: inherit;
    }
    .ai-toolbar button[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ai-form-errors {
      margin-top: 0.5rem;
    }
    .ai-form-errors:empty {
      display: none;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.language = 'en-US';
  }

  /** @override */
  renderAI() {
    return html`
      <div class="ai-toolbar" part="toolbar" role="toolbar">
        <button type="button" disabled data-action="paste-assist" title="Coming in AIC-TSK-0008">
          📋 Paste & fill
        </button>
        <button type="button" disabled data-action="voice-input" title="Coming in AIC-TSK-0010">
          🎤 Voice input
        </button>
      </div>
      <slot></slot>
      <div class="ai-form-errors" part="errors" aria-live="polite"></div>
    `;
  }

  /** @override */
  renderFallback() {
    return html`<slot></slot>`;
  }
}
