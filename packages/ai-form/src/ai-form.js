import { html, css, nothing } from 'lit';
import { AIElement, prompt as promptApi } from '@manufosela/ai-core';
import { VoiceMixin } from '@manufosela/ai-voice';

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
 * @property {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element The DOM node that receives the extracted value.
 */

/**
 * Field descriptor built from a slotted input with `ai-validate`.
 * @typedef {object} ValidatableField
 * @property {string} name Input's `name` attribute (identifies the field in events).
 * @property {string} rule Natural-language rule from `ai-validate`.
 * @property {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element The DOM node under validation.
 */

/**
 * Outcome of validating a single field.
 * @typedef {object} ValidationResult
 * @property {string}  name  Field `name`.
 * @property {boolean} valid `true` when the value satisfies the rule.
 * @property {string=} reason Short explanation shown to the user when `valid` is false.
 */

/**
 * `<ai-form>` — wraps a `<form>` and progressively enhances it with Chrome
 * Built-in AI when available.
 *
 * When AI is present, the component renders a conversational chat UI above
 * the slotted form: an instructional prompt, a free-text textarea, an
 * optional mic (with `voice-input`) and a "Check" button. The AI extracts
 * values from the user's reply and fills the slotted inputs in place —
 * they stay visible and act as a live ledger. The submit button only
 * surfaces when the slotted form's native validity reports complete.
 * When AI is unavailable, the slotted form renders as-is (native HTML5
 * behavior).
 *
 * AI-candidates are detected by the `ai-extract` attribute. Everything
 * else (file uploads, checkboxes, selects, dates, inputs without
 * `ai-extract`) is treated as **manual** — shown to the user to fill
 * by hand and mentioned in the dynamic prompt when still required.
 *
 * Semantic validation (`ai-validate`) and voice output (`voice-output`,
 * reads validation failures aloud) continue to work unchanged.
 * @customElement ai-form
 * @slot                   Default slot: the `<form>` the component wraps.
 * @fires ai-ready                 Inherited from AIElement.
 * @fires ai-unavailable           Inherited from AIElement.
 * @fires ai-field-extracted       AI wrote a value into a slotted input; `detail: {name, value}`.
 * @fires ai-conversation-update   Conversation state changed; `detail: {pendingAIFields, pendingManualFields, prompt}`.
 * @fires ai-no-match              An extraction round produced zero fields.
 * @fires ai-error                 An AI call failed (`detail.error`, `detail.stage`).
 * @fires ai-validation-start      Semantic validation started; `detail.fields` lists names.
 * @fires ai-validation-passed     All fields satisfied their rules; form submit continues.
 * @fires ai-validation-failed     At least one field failed; `detail.results` has ValidationResult[].
 * @fires voice-transcript         Inherited from VoiceMixin; includes `detail.transcript`.
 * @fires voice-start              Inherited from VoiceMixin.
 * @fires voice-end                Inherited from VoiceMixin.
 * @fires voice-error              Inherited from VoiceMixin.
 * @fires voice-unavailable        Inherited from VoiceMixin.
 */
export class AIForm extends VoiceMixin(AIElement) {
  static properties = {
    /** BCP-47 language tag used by AI + voice features. */
    language: { type: String, reflect: true },
    /** When present, the chat 🎤 button is enabled and uses SpeechRecognition to dictate into the chat textarea. */
    voiceInput: { type: Boolean, reflect: true, attribute: 'voice-input' },
    /** When present, validation failures are read aloud with SpeechSynthesis. */
    voiceOutput: { type: Boolean, reflect: true, attribute: 'voice-output' },
    _chatText: { type: String, state: true },
    _chatBusy: { type: Boolean, state: true },
    _chatPrompt: { type: String, state: true },
    _chatComplete: { type: Boolean, state: true },
    _validating: { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: block;
      font: inherit;
      color: inherit;
    }
    button {
      appearance: none;
      border: 1px solid
        var(--ai-form-button-border, color-mix(in srgb, currentColor 25%, transparent));
      background: var(--ai-form-button-bg, transparent);
      color: inherit;
      padding: 0.35rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font: inherit;
    }
    button[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button[data-action='chat-submit'] {
      background: var(--ai-form-submit-bg, color-mix(in srgb, currentColor 12%, transparent));
      font-weight: 600;
    }
    .ai-chat {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding: 0.75rem;
      border: 1px solid
        var(--ai-form-chat-border, color-mix(in srgb, currentColor 20%, transparent));
      border-radius: 6px;
      background: var(--ai-form-chat-bg, transparent);
    }
    .ai-chat-prompt {
      margin: 0;
      font-weight: 500;
      color: inherit;
    }
    .ai-chat-input {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }
    .ai-chat-input textarea {
      flex: 1;
      min-height: 4rem;
      resize: vertical;
      font: inherit;
      padding: 0.5rem;
      box-sizing: border-box;
      color: inherit;
      background: var(--ai-form-chat-textarea-bg, transparent);
      border: 1px solid
        var(--ai-form-chat-textarea-border, color-mix(in srgb, currentColor 25%, transparent));
      border-radius: 4px;
    }
    .ai-chat-mic {
      flex: 0 0 auto;
    }
    .ai-chat-mic[aria-pressed='true'] {
      background: var(--ai-form-chat-mic-active-bg, color-mix(in srgb, red 15%, transparent));
    }
    .ai-chat-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .ai-chat-submit {
      margin-top: 0.5rem;
      display: flex;
      justify-content: flex-end;
    }
    .ai-form-errors {
      margin-top: 0.5rem;
    }
    .ai-form-errors:empty {
      display: none;
    }
    .ai-status {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid var(--ai-form-status-border, rgba(0, 0, 0, 0.15));
      border-radius: 4px;
      background: var(--ai-form-status-bg, transparent);
      font-size: 0.9rem;
    }
    .ai-status[data-state='downloadable'] {
      border-color: var(--ai-form-status-warn, #c58a00);
    }
    .ai-status[data-state='downloading'] {
      border-color: var(--ai-form-status-info, #0a7aca);
    }
    .ai-status[data-state='unsupported'] {
      /* Inherit text color so we follow the host theme (light/dark).
         Hardcoding rgba(0,0,0,*) made the message invisible on dark bg.
         Fade border/text relative to currentColor instead. Overridable
         via CSS custom props. */
      color: var(--ai-form-status-muted-fg, color-mix(in srgb, currentColor 75%, transparent));
      border-color: var(--ai-form-status-muted, color-mix(in srgb, currentColor 25%, transparent));
    }
    .ai-status[data-state='unsupported'] a {
      color: inherit;
      text-decoration: underline;
    }
    .ai-status progress {
      flex: 1;
      min-width: 8rem;
    }
  `;

  constructor() {
    super();
    /** @type {string} */
    this.language = 'en-US';
    /** @type {boolean} */
    this.voiceInput = false;
    /** @type {boolean} */
    this.voiceOutput = false;
    /** @type {string} */
    this._chatText = '';
    /** @type {boolean} */
    this._chatBusy = false;
    /** @type {string} */
    this._chatPrompt = '';
    /** @type {boolean} */
    this._chatComplete = false;
    /** @type {boolean} */
    this._validating = false;
    /** @type {boolean} */
    this._bypassNextSubmit = false;
    // Arrow-bound handlers so we can add/remove the same reference.
    /** @type {(e: Event) => void} */
    this._onSubmit = (event) => {
      this._handleSubmit(event);
    };
    /** @type {(e: Event) => void} */
    this._onFormInput = (event) => {
      // Any input/change inside the slotted <form> can move us into/out
      // of "complete" state and update the dynamic prompt. Clear any
      // stale custom validity on the edited input (decision #2).
      const t = /** @type {HTMLElement | null} */ (event.target);
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        if (typeof t.setCustomValidity === 'function') t.setCustomValidity('');
      }
      this._updateChatState();
    };
  }

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    // Submit events bubble from the slotted <form> through the light DOM
    // up to the host, so a single host-level listener catches every submit.
    this.addEventListener('submit', this._onSubmit, true);
    // Track any manual edits inside the slotted form so our chat prompt
    // and submit-gate stay in sync.
    this.addEventListener('input', this._onFormInput, true);
    this.addEventListener('change', this._onFormInput, true);
  }

  /** @override */
  disconnectedCallback() {
    this.removeEventListener('submit', this._onSubmit, true);
    this.removeEventListener('input', this._onFormInput, true);
    this.removeEventListener('change', this._onFormInput, true);
    super.disconnectedCallback();
  }

  /** @override */
  firstUpdated() {
    // Initial pass once the slot is populated.
    this._updateChatState();
  }

  /** @override */
  updated(changed) {
    super.updated?.(changed);
    if (changed.has('_validating')) {
      if (this._validating) this.setAttribute('aria-busy', 'true');
      else this.removeAttribute('aria-busy');
    }
  }

  /** @override */
  renderAI() {
    return html`
      ${this._renderStatusBanner()} ${this._renderChatUI()}
      <slot></slot>
      ${this._chatComplete
        ? html`<div class="ai-chat-submit" part="submit-wrap">
            <button
              type="button"
              data-action="chat-submit"
              part="submit"
              @click=${this._submitForm}
            >
              ${this._submitLabel()}
            </button>
          </div>`
        : nothing}
      <div class="ai-form-errors" part="errors" aria-live="polite"></div>
    `;
  }

  /**
   * Render the conversational chat UI: instructional prompt, free-text
   * textarea (+ optional mic), and "Check" button. Everything is disabled
   * until `aiReady` (model actually downloaded).
   * @returns {unknown}
   */
  _renderChatUI() {
    const ready = this.aiReady === true;
    const voiceActive = this.voiceInput && this.speechInAvailable;
    const canCheck = ready && !this._chatBusy && this._chatText.trim().length > 0;
    return html`
      <div class="ai-chat" part="chat" role="group" aria-label=${this._chatPrompt || 'AI chat'}>
        ${this._chatPrompt
          ? html`<p class="ai-chat-prompt" part="chat-prompt" aria-live="polite">
              ${this._chatPrompt}
            </p>`
          : nothing}
        <div class="ai-chat-input">
          <textarea
            part="chat-textarea"
            .value=${this._chatText}
            @input=${(/** @type {Event} */ e) => {
              this._chatText = /** @type {HTMLTextAreaElement} */ (e.target).value;
            }}
            placeholder=${ready
              ? this._chatPlaceholder()
              : 'Activate AI to start (download the on-device model).'}
            ?disabled=${!ready || this._chatBusy || this.listening}
            aria-label=${this._chatPrompt || 'Describe your data'}
          ></textarea>
          ${this.voiceInput
            ? html`<button
                type="button"
                class="ai-chat-mic"
                data-action="chat-voice"
                part="mic"
                ?disabled=${!ready || !voiceActive || this._chatBusy}
                aria-pressed=${this.listening ? 'true' : 'false'}
                @click=${this._toggleVoiceInput}
                title=${voiceActive
                  ? this.listening
                    ? 'Stop listening'
                    : 'Dictate into the chat'
                  : 'SpeechRecognition not available'}
              >
                ${this.listening ? '⏹️' : '🎤'}
              </button>`
            : nothing}
        </div>
        <div class="ai-chat-actions">
          <button
            type="button"
            data-action="chat-check"
            part="check"
            ?disabled=${!canCheck}
            @click=${this._runExtractionFromChat}
          >
            ${this._chatBusy ? this._checkBusyLabel() : this._checkLabel()}
          </button>
        </div>
      </div>
    `;
  }

  /** @override */
  renderFallback() {
    // aiCapabilities is null while detection is still running; null means
    // we haven't decided yet — show only the slot in that case.
    const decided = this.aiCapabilities !== null;
    return html`
      ${decided
        ? html`<div class="ai-status" part="status" data-state="unsupported">
            <strong>Chrome Built-in AI not available.</strong> The form still works with native
            HTML5 validation.
            <a
              href="https://developer.chrome.com/docs/ai/get-started"
              target="_blank"
              rel="noopener noreferrer"
              >Requirements →</a
            >
          </div>`
        : nothing}
      <slot></slot>
    `;
  }

  /**
   * Render the capability banner above the toolbar. Shows:
   * - "downloadable": CTA to run `ensureAIReady()`.
   * - "downloading":  progress bar driven by `aiDownloadProgress`.
   * - "available":    nothing (silent).
   * @returns {unknown}
   */
  _renderStatusBanner() {
    const state = this.aiCapabilities?.prompt ?? 'unavailable';
    if (state === 'available') return nothing;
    if (state === 'downloading' || this.aiDownloading) {
      const pct = Math.round((this.aiDownloadProgress ?? 0) * 100);
      return html`
        <div class="ai-status" part="status" data-state="downloading" role="status">
          <span>⏬ Downloading Gemini Nano… ${pct}%</span>
          <progress max="1" value=${this.aiDownloadProgress}></progress>
        </div>
      `;
    }
    if (state === 'downloadable') {
      return html`
        <div class="ai-status" part="status" data-state="downloadable" role="status">
          <span>🤖 Chrome AI is ready to download (~2 GB, one-time).</span>
          <button type="button" data-action="enable-ai" @click=${this._onEnableAI}>
            Enable AI
          </button>
        </div>
      `;
    }
    // 'unavailable' but aiAvailable=true (some OTHER core API is usable) —
    // rare in practice; show a compact notice so the user knows Prompt is
    // off while the rest may still work.
    return html`
      <div class="ai-status" part="status" data-state="unsupported">
        <span
          >Prompt API not available; Paste &amp; fill and semantic validation are disabled.</span
        >
      </div>
    `;
  }

  /**
   * Click handler for the "Enable AI" button. User gesture satisfies
   * Chrome's activation requirement for create().
   */
  async _onEnableAI() {
    try {
      await this.ensureAIReady({ apis: ['prompt'] });
    } catch {
      /* ai-download-error already dispatched by AIElement */
    }
  }

  /**
   * Classify slotted form fields into two groups:
   * - AI-candidates: inputs/textareas with the `ai-extract` attribute. The
   *   Prompt API will extract values for these from the chat text.
   * - Manual fields: everything else with a `name` attribute (file inputs,
   *   checkboxes, radios, selects, dates, plain text without `ai-extract`).
   *   The user fills these by hand; the dynamic prompt reminds them when
   *   any are required and empty.
   * @returns {{aiCandidates: ExtractableField[], manualFields: ExtractableField[], form: HTMLFormElement | null}}
   */
  _classifyFields() {
    const slot = this.shadowRoot?.querySelector('slot');
    if (!slot) return { aiCandidates: [], manualFields: [], form: null };
    const assigned = /** @type {HTMLSlotElement} */ (slot).assignedElements({
      flatten: true,
    });
    /** @type {ExtractableField[]} */
    const aiCandidates = [];
    /** @type {ExtractableField[]} */
    const manualFields = [];
    /** @type {HTMLFormElement | null} */
    let form = null;
    for (const root of assigned) {
      if (!form && root instanceof HTMLFormElement) form = root;
      else if (!form) {
        const nested = root.querySelector('form');
        if (nested instanceof HTMLFormElement) form = nested;
      }
      const named = root.querySelectorAll('[name]');
      for (const c of named) {
        if (
          !(c instanceof HTMLInputElement) &&
          !(c instanceof HTMLTextAreaElement) &&
          !(c instanceof HTMLSelectElement)
        ) {
          continue;
        }
        const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ (c);
        if (!el.name) continue;
        if (el.hasAttribute('ai-extract')) {
          aiCandidates.push({
            name: el.name,
            description: el.getAttribute('ai-extract') ?? '',
            element: el,
          });
        } else {
          manualFields.push({
            name: el.name,
            description: this._fieldHumanLabel(el),
            element: el,
          });
        }
      }
    }
    return { aiCandidates, manualFields, form };
  }

  /**
   * Human-readable label for a field, used in the dynamic chat prompt.
   * Precedence: `ai-label` → associated `<label>` text → `aria-label` →
   * `placeholder` → `name`.
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
   * @returns {string}
   */
  _fieldHumanLabel(el) {
    const explicit = el.getAttribute('ai-label');
    if (explicit) return explicit;
    const id = el.id;
    if (id) {
      // CSS.escape is not guaranteed (jsdom, older envs). Fall back to a
      // raw id and swallow selector-parse errors.
      const escaped =
        typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function'
          ? globalThis.CSS.escape(id)
          : id;
      try {
        const lbl = el.ownerDocument?.querySelector(`label[for="${escaped}"]`);
        if (lbl && lbl.textContent) return lbl.textContent.trim();
      } catch {
        /* invalid selector — fall through to other label strategies */
      }
    }
    const closest = el.closest('label');
    if (closest) {
      const parts = Array.from(closest.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    return el.name;
  }

  /**
   * True when the field has a value (non-empty for text, checked for boxes,
   * has files for file inputs, has a selected non-empty option for select).
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
   * @returns {boolean}
   */
  _fieldHasValue(el) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      if (el.type === 'file') return el.files ? el.files.length > 0 : false;
    }
    return typeof el.value === 'string' && el.value !== '';
  }

  /**
   * Recompute the dynamic chat prompt and the `_chatComplete` gate based on
   * the current values of slotted form fields and their classification.
   * Emits `ai-conversation-update` whenever anything changes.
   */
  _updateChatState() {
    const { aiCandidates, manualFields, form } = this._classifyFields();

    const pendingAIRequired = aiCandidates.filter(
      (f) => f.element.hasAttribute('required') && !this._fieldHasValue(f.element),
    );
    const pendingAIOptional = aiCandidates.filter(
      (f) => !f.element.hasAttribute('required') && !this._fieldHasValue(f.element),
    );
    const pendingManualRequired = manualFields.filter(
      (f) => f.element.hasAttribute('required') && !this._fieldHasValue(f.element),
    );

    const prompt = this._buildConversationPrompt(
      pendingAIRequired,
      pendingAIOptional,
      pendingManualRequired,
    );
    const complete = form ? form.checkValidity() : false;

    const changed = prompt !== this._chatPrompt || complete !== this._chatComplete;
    this._chatPrompt = prompt;
    this._chatComplete = complete;

    if (changed) {
      this.dispatchEvent(
        new CustomEvent('ai-conversation-update', {
          bubbles: true,
          composed: true,
          detail: {
            pendingAIFields: pendingAIRequired.map((f) => f.name),
            pendingManualFields: pendingManualRequired.map((f) => f.name),
            prompt,
          },
        }),
      );
    }
  }

  /**
   * Build the instructional text shown above the chat textarea.
   * @param {ExtractableField[]} aiRequired
   * @param {ExtractableField[]} aiOptional
   * @param {ExtractableField[]} manualRequired
   * @returns {string}
   */
  _buildConversationPrompt(aiRequired, aiOptional, manualRequired) {
    const t = this._templates();
    const toLabels = (xs) => xs.map((f) => f.description || f.name);
    const joinList = (items) => {
      if (items.length === 0) return '';
      if (items.length === 1) return items[0];
      if (items.length === 2) return `${items[0]} ${t.and} ${items[1]}`;
      return `${items.slice(0, -1).join(', ')} ${t.and} ${items[items.length - 1]}`;
    };
    const aiReq = toLabels(aiRequired);
    const aiOpt = toLabels(aiOptional);
    const manReq = toLabels(manualRequired);

    let text = '';
    if (aiReq.length === 0 && aiOpt.length === 0) {
      text = t.readyAI;
    } else if (aiReq.length === 1 && aiOpt.length === 0) {
      text = t.askOne(aiReq[0]);
    } else if (aiReq.length > 1 && aiOpt.length === 0) {
      text = t.askMany(joinList(aiReq));
    } else if (aiReq.length === 0 && aiOpt.length > 0) {
      text = t.askOptional(joinList(aiOpt));
    } else {
      text = t.askMixed(joinList(aiReq), joinList(aiOpt));
    }
    if (manReq.length > 0) {
      text = `${text} ${t.remindManual(joinList(manReq))}`;
    }
    return text;
  }

  /**
   * i18n templates for the chat UI. Currently supports `es` and `en`;
   * unknown languages fall back to `en`.
   * @returns {{and: string, readyAI: string, askOne: (s: string) => string, askMany: (s: string) => string, askOptional: (s: string) => string, askMixed: (r: string, o: string) => string, remindManual: (s: string) => string, placeholder: string, check: string, checking: string, submit: string}}
   */
  _templates() {
    const lang = (this.language || 'en').slice(0, 2).toLowerCase();
    if (lang === 'es') {
      return {
        and: 'y',
        readyAI: 'Cuéntame lo que quieras; o pulsa Enviar cuando termines.',
        askOne: (s) => `¿Me dices ${s}?`,
        askMany: (s) => `Cuéntame ${s}.`,
        askOptional: (s) => `Opcionalmente, cuéntame ${s}.`,
        askMixed: (req, opt) => `Cuéntame ${req}, y opcionalmente ${opt}.`,
        remindManual: (s) => `Recuerda rellenar a mano: ${s}.`,
        placeholder: 'Escribe o dicta tu respuesta…',
        check: 'Comprobar',
        checking: 'Comprobando…',
        submit: 'Enviar',
      };
    }
    return {
      and: 'and',
      readyAI: 'Tell me anything else, or click Submit when ready.',
      askOne: (s) => `Please tell me your ${s}.`,
      askMany: (s) => `Tell me your ${s}.`,
      askOptional: (s) => `Optionally, tell me your ${s}.`,
      askMixed: (req, opt) => `Tell me your ${req}, and optionally your ${opt}.`,
      remindManual: (s) => `Don't forget to fill manually: ${s}.`,
      placeholder: 'Type or dictate your answer…',
      check: 'Check',
      checking: 'Checking…',
      submit: 'Submit',
    };
  }

  _chatPlaceholder() {
    return this._templates().placeholder;
  }
  _checkLabel() {
    return this._templates().check;
  }
  _checkBusyLabel() {
    return this._templates().checking;
  }
  _submitLabel() {
    return this._templates().submit;
  }

  /**
   * "Check" button handler. Sends the textarea content to the Prompt API,
   * parses a JSON payload and writes extracted values back into the
   * slotted inputs. Triggers input/change events so consumer bindings stay
   * in sync.
   */
  async _runExtractionFromChat() {
    const text = this._chatText.trim();
    if (!text) return;
    const { aiCandidates } = this._classifyFields();
    if (aiCandidates.length === 0) {
      this.dispatchEvent(
        new CustomEvent('ai-no-match', {
          bubbles: true,
          composed: true,
          detail: { reason: 'no-extractable-inputs' },
        }),
      );
      return;
    }
    this._chatBusy = true;
    try {
      const response = await promptApi(this._buildExtractionPrompt(text, aiCandidates));
      const parsed = this._parseJsonResponse(response);
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
      for (const field of aiCandidates) {
        const value = parsed[field.name];
        if (value == null || value === '') continue;
        const str = String(value);
        if (typeof field.element.setCustomValidity === 'function') {
          field.element.setCustomValidity('');
        }
        field.element.value = str;
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        this.dispatchEvent(
          new CustomEvent('ai-field-extracted', {
            bubbles: true,
            composed: true,
            detail: { name: field.name, value: str },
          }),
        );
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

      this._chatText = '';
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('ai-error', {
          bubbles: true,
          composed: true,
          detail: { error, stage: 'conversation-extract' },
        }),
      );
    } finally {
      this._chatBusy = false;
      this._updateChatState();
    }
  }

  /**
   * Submit the slotted form programmatically. Uses `requestSubmit()` so
   * native HTML5 validity + our `ai-validate` interception both fire.
   */
  _submitForm() {
    const { form } = this._classifyFields();
    if (!form) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
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
  _parseJsonResponse(response) {
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

  /**
   * Intercepts every submit that bubbles out of the slotted form. Acts as a
   * no-op when there are no `ai-validate` fields or the Prompt API is not
   * available (so native HTML5 validation keeps working).
   * @param {Event} event
   */
  _handleSubmit(event) {
    if (this._bypassNextSubmit) {
      this._bypassNextSubmit = false;
      return;
    }
    if (!(event.target instanceof HTMLFormElement)) return;
    if (!this.aiAvailable || this.aiCapabilities?.prompt === 'unavailable') {
      return;
    }
    const fields = this._findValidatableFields(event.target);
    if (fields.length === 0) return;

    event.preventDefault();
    this._runValidation(event.target, fields);
  }

  /**
   * Walk the given form for every input/textarea/select with `ai-validate`.
   * @param {HTMLFormElement} form
   * @returns {ValidatableField[]}
   */
  _findValidatableFields(form) {
    /** @type {ValidatableField[]} */
    const fields = [];
    for (const c of form.querySelectorAll('[ai-validate][name]')) {
      const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ (c);
      if (!el.name) continue;
      const rule = el.getAttribute('ai-validate') ?? '';
      if (!rule) continue;
      fields.push({ name: el.name, rule, element: el });
    }
    return fields;
  }

  /**
   * Validate every field in parallel and report results.
   * @param {HTMLFormElement} form
   * @param {ValidatableField[]} fields
   * @returns {Promise<void>}
   */
  async _runValidation(form, fields) {
    this._validating = true;
    // Clear previous custom validity before re-evaluating.
    for (const f of fields) f.element.setCustomValidity('');

    this.dispatchEvent(
      new CustomEvent('ai-validation-start', {
        bubbles: true,
        composed: true,
        detail: { fields: fields.map((f) => f.name) },
      }),
    );

    try {
      /** @type {ValidationResult[]} */
      const results = await Promise.all(fields.map((f) => this._validateField(f)));

      let anyInvalid = false;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result.valid) {
          fields[i].element.setCustomValidity(result.reason ?? 'Invalid');
          anyInvalid = true;
        }
      }

      if (anyInvalid) {
        form.reportValidity();
        this.dispatchEvent(
          new CustomEvent('ai-validation-failed', {
            bubbles: true,
            composed: true,
            detail: { results },
          }),
        );
        this._speakValidationErrors(results);
        return;
      }

      this.dispatchEvent(
        new CustomEvent('ai-validation-passed', {
          bubbles: true,
          composed: true,
          detail: { results },
        }),
      );
      // All clear: re-submit the form once without re-running validation.
      this._bypassNextSubmit = true;
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('ai-error', {
          bubbles: true,
          composed: true,
          detail: { error, stage: 'semantic-validation' },
        }),
      );
    } finally {
      this._validating = false;
    }
  }

  /**
   * Ask the Prompt API whether a single field satisfies its natural-language
   * rule. Empty values short-circuit to `valid: true` — use the standard
   * `required` attribute for presence checks.
   * @param {ValidatableField} field
   * @returns {Promise<ValidationResult>}
   */
  async _validateField(field) {
    const value = field.element.value ?? '';
    if (value.trim() === '') return { name: field.name, valid: true };

    const response = await promptApi(this._buildValidationPrompt(value, field.rule));
    const parsed = this._parseJsonResponse(response);
    if (!parsed) {
      return { name: field.name, valid: true }; // Give the user the benefit of the doubt.
    }
    const ok = parsed.ok === true || parsed.valid === true;
    if (ok) return { name: field.name, valid: true };
    const why =
      typeof parsed.why === 'string'
        ? parsed.why
        : typeof parsed.reason === 'string'
          ? parsed.reason
          : 'Does not satisfy the rule';
    return { name: field.name, valid: false, reason: why };
  }

  /**
   * Toggle a voice-input dictation session. In conversational mode the
   * transcript is written into the chat textarea (replacing any prior
   * content) so the user can review/edit before pressing "Check".
   * @returns {Promise<void>}
   */
  async _toggleVoiceInput() {
    if (this.listening) {
      this.stopSpeechInput();
      return;
    }
    try {
      const transcript = await this.startSpeechInput({ lang: this.language });
      if (transcript == null || transcript === '') return;
      this._chatText = transcript;
    } catch {
      // VoiceMixin already emitted voice-error; nothing more to do here.
    }
  }

  /**
   * When `voice-output` is set, read the failed validation reasons aloud.
   * @param {ValidationResult[]} results
   */
  _speakValidationErrors(results) {
    if (!this.voiceOutput || !this.speechOutAvailable) return;
    const reasons = results
      .filter((r) => !r.valid && typeof r.reason === 'string' && r.reason.length > 0)
      .map((r) => /** @type {string} */ (r.reason));
    if (reasons.length === 0) return;
    // Fire-and-forget; errors bubble out of VoiceMixin as voice-error.
    this.speak(reasons.join('. '), { lang: this.language }).catch(() => {});
  }

  /**
   * Build the per-field validation prompt.
   * @param {string} value
   * @param {string} rule
   * @returns {string}
   */
  _buildValidationPrompt(value, rule) {
    return [
      'You evaluate whether a user input satisfies a rule.',
      'Reply ONLY with minified JSON:',
      '- {"ok":true} when the value clearly satisfies the rule.',
      '- {"ok":false,"why":"<short reason in the user language>"} when it does not.',
      'Do not wrap the JSON in markdown fences. Do not add prose.',
      `Language hint: ${this.language}.`,
      '',
      `Rule: ${rule}`,
      '',
      'Value:',
      '"""',
      value,
      '"""',
    ].join('\n');
  }
}
