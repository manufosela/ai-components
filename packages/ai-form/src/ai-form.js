import { html, css, nothing } from 'lit';
import { AIElement, prompt as promptApi } from '@manufosela/ai-core';

/**
 * Extracted field ready to be written back onto a slotted form input.
 * @typedef {object} ExtractedField
 * @property {string} name  The `name` attribute of the target input.
 * @property {string} value The extracted string value.
 */

/**
 * Field descriptor built from a slotted input with `ai-extract`.
 * @typedef {object} ExtractableField
 * @property {string} name        Input's `name` attribute (used as the JSON key).
 * @property {string} description Natural-language hint from `ai-extract`.
 * @property {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element The DOM node to fill.
 */

/**
 * `<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome
 * Built-in AI when available.
 *
 * When Chrome AI is present, the component renders an AI toolbar above the
 * slotted form. When AI is unavailable, it renders the slotted form as-is.
 *
 * Implemented features:
 * - Capability detection + render switch (AIC-TSK-0007).
 * - Paste-assist: click 📋 Paste & fill → type/paste free text → Apply.
 *   The component asks Chrome's Prompt API to extract the fields declared
 *   via `ai-extract` on slotted inputs and fills them (AIC-TSK-0008).
 * @customElement ai-form
 * @slot                   Default slot: the `<form>` the component wraps.
 * @fires ai-ready             Inherited from AIElement.
 * @fires ai-unavailable       Inherited from AIElement.
 * @fires ai-paste-assist-start    Paste-assist session started.
 * @fires ai-paste-assist-result   Paste-assist finished; `detail.fields` is an array of ExtractedField.
 * @fires ai-no-match              Paste-assist finished with no fields extracted.
 * @fires ai-error                 Paste-assist failed (`detail.error`).
 */
export class AIForm extends AIElement {
  static properties = {
    /** BCP-47 language tag used by upcoming AI + voice features. */
    language: { type: String, reflect: true },
    _pasteOpen: { type: Boolean, state: true },
    _pasteText: { type: String, state: true },
    _pasteBusy: { type: Boolean, state: true },
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
    .ai-paste {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
      padding: 0.5rem;
      border: 1px dashed var(--ai-form-paste-border, rgba(0, 0, 0, 0.2));
      border-radius: 4px;
      background: var(--ai-form-paste-bg, transparent);
    }
    .ai-paste textarea {
      width: 100%;
      min-height: 4.5rem;
      resize: vertical;
      font: inherit;
      padding: 0.25rem;
      box-sizing: border-box;
    }
    .ai-paste-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.25rem;
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
    /** @type {boolean} */
    this._pasteOpen = false;
    /** @type {string} */
    this._pasteText = '';
    /** @type {boolean} */
    this._pasteBusy = false;
  }

  /** @override */
  renderAI() {
    const promptAvailable = this.aiCapabilities?.prompt !== 'unavailable';
    return html`
      <div class="ai-toolbar" part="toolbar" role="toolbar">
        <button
          type="button"
          data-action="paste-assist"
          ?disabled=${!promptAvailable || this._pasteBusy}
          @click=${this._openPasteAssist}
          title=${promptAvailable
            ? 'Paste free text to auto-fill the form'
            : 'Prompt API not available'}
        >
          📋 Paste & fill
        </button>
        <button type="button" disabled data-action="voice-input" title="Coming in AIC-TSK-0010">
          🎤 Voice input
        </button>
      </div>
      ${this._pasteOpen ? this._renderPasteUI() : nothing}
      <slot></slot>
      <div class="ai-form-errors" part="errors" aria-live="polite"></div>
    `;
  }

  /** @override */
  renderFallback() {
    return html`<slot></slot>`;
  }

  /**
   * @returns {unknown}
   */
  _renderPasteUI() {
    return html`
      <div class="ai-paste" part="paste">
        <textarea
          .value=${this._pasteText}
          @input=${(/** @type {Event} */ e) => {
            this._pasteText = /** @type {HTMLTextAreaElement} */ (e.target).value;
          }}
          placeholder="Paste the text to extract from…"
          ?disabled=${this._pasteBusy}
        ></textarea>
        <div class="ai-paste-actions">
          <button
            type="button"
            data-action="paste-cancel"
            ?disabled=${this._pasteBusy}
            @click=${this._cancelPasteAssist}
          >
            Cancel
          </button>
          <button
            type="button"
            data-action="paste-apply"
            ?disabled=${this._pasteBusy || !this._pasteText.trim()}
            @click=${this._applyPasteAssist}
          >
            ${this._pasteBusy ? 'Working…' : 'Apply'}
          </button>
        </div>
      </div>
    `;
  }

  _openPasteAssist() {
    this._pasteOpen = true;
    this._pasteText = '';
    this.dispatchEvent(new CustomEvent('ai-paste-assist-start', { bubbles: true, composed: true }));
  }

  _cancelPasteAssist() {
    this._pasteOpen = false;
    this._pasteText = '';
  }

  async _applyPasteAssist() {
    const text = this._pasteText.trim();
    if (!text) return;

    const fields = this._findExtractableFields();
    if (fields.length === 0) {
      this.dispatchEvent(
        new CustomEvent('ai-no-match', {
          bubbles: true,
          composed: true,
          detail: { reason: 'no-extractable-inputs' },
        }),
      );
      this._pasteOpen = false;
      return;
    }

    this._pasteBusy = true;
    try {
      const response = await promptApi(this._buildExtractionPrompt(text, fields));
      const parsed = this._parseExtractionResponse(response);

      if (!parsed || Object.keys(parsed).length === 0) {
        this.dispatchEvent(
          new CustomEvent('ai-no-match', {
            bubbles: true,
            composed: true,
            detail: { reason: 'empty-extraction', response },
          }),
        );
        return;
      }

      /** @type {ExtractedField[]} */
      const extracted = [];
      for (const field of fields) {
        const value = parsed[field.name];
        if (value == null || value === '') continue;
        const str = String(value);
        field.element.value = str;
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        extracted.push({ name: field.name, value: str });
      }

      if (extracted.length === 0) {
        this.dispatchEvent(
          new CustomEvent('ai-no-match', {
            bubbles: true,
            composed: true,
            detail: { reason: 'no-fields-matched', response, parsed },
          }),
        );
        return;
      }

      this.dispatchEvent(
        new CustomEvent('ai-paste-assist-result', {
          bubbles: true,
          composed: true,
          detail: { fields: extracted, raw: response },
        }),
      );
      this._pasteOpen = false;
      this._pasteText = '';
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('ai-error', {
          bubbles: true,
          composed: true,
          detail: { error, stage: 'paste-assist' },
        }),
      );
    } finally {
      this._pasteBusy = false;
    }
  }

  /**
   * Walk the slotted `<form>` and return every input/textarea/select that
   * declares an `ai-extract` attribute and has a usable `name`.
   * @returns {ExtractableField[]}
   */
  _findExtractableFields() {
    const slot = this.shadowRoot?.querySelector('slot');
    if (!slot) return [];
    const assigned = /** @type {HTMLSlotElement} */ (slot).assignedElements({
      flatten: true,
    });
    /** @type {ExtractableField[]} */
    const fields = [];
    for (const root of assigned) {
      const candidates = root.querySelectorAll('[ai-extract][name]');
      for (const c of candidates) {
        const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ (c);
        const description = el.getAttribute('ai-extract') ?? '';
        if (!el.name) continue;
        fields.push({ name: el.name, description, element: el });
      }
    }
    return fields;
  }

  /**
   * Build the extraction prompt sent to the Chrome Prompt API.
   * @param {string} text
   * @param {ExtractableField[]} fields
   * @returns {string}
   */
  _buildExtractionPrompt(text, fields) {
    const list = fields.map((f) => `- ${f.name}: ${f.description}`).join('\n');
    return [
      'You extract structured data from free text.',
      'Return ONLY a minified JSON object with the listed field names as keys and the extracted string values.',
      'Omit fields that are not present in the text. Do not wrap the JSON in markdown fences. Do not add commentary.',
      `Language hint: ${this.language}.`,
      '',
      'Fields:',
      list,
      '',
      'Text:',
      '"""',
      text,
      '"""',
    ].join('\n');
  }

  /**
   * Tolerant JSON parser: accepts raw JSON, markdown-fenced JSON, or JSON
   * embedded in surrounding prose. Returns `null` if nothing parses.
   * @param {string} response
   * @returns {Record<string, unknown> | null}
   */
  _parseExtractionResponse(response) {
    if (typeof response !== 'string') return null;
    const attempts = [];
    attempts.push(response.trim());

    const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) attempts.push(fenced[1].trim());

    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      attempts.push(response.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of attempts) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return /** @type {Record<string, unknown>} */ (parsed);
        }
      } catch {
        /* try next candidate */
      }
    }
    return null;
  }
}
