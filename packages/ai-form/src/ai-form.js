import { html, css, nothing } from 'lit';
import { AIElement, prompt as promptApi } from '@manufosela/ai-core';
import { VoiceMixin } from '@manufosela/ai-voice';
import { validate as resolveValidator } from '@manufosela/form-validators';

/**
 * Names we have warned about as unknown — keeps console.warn from spamming
 * on every extraction round.
 * @type {Set<string>}
 */
const _warnedUnknownFormats = new Set();

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
 * @fires ai-extraction-rejected   One or more extracted values failed their `ai-format` deterministic validator and were dropped; `detail: {fields: [{name, format, value}]}`.
 * @fires ai-conversation-help     The model classified the user's message as a question / clarification rather than data; `detail: {intent, answer}` where `intent` ∈ `'help' | 'clarify' | 'correct'`.
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
    /** When present, the chat mic is enabled and uses SpeechRecognition. */
    voiceInput: { type: Boolean, reflect: true, attribute: 'voice-input' },
    /** When present, validation failures are read aloud with SpeechSynthesis. */
    voiceOutput: { type: Boolean, reflect: true, attribute: 'voice-output' },
    /** Number of previous chat messages to include as context in the extraction prompt (default 6). */
    historyTurns: { type: Number, reflect: true, attribute: 'history-turns' },
    _chatInput: { type: String, state: true },
    _chatBusy: { type: Boolean, state: true },
    _messages: { type: Array, state: true },
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
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    button[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    /* ---- chat shell ---- */
    .ai-chat {
      display: flex;
      flex-direction: column;
      height: var(--ai-form-chat-height, 420px);
      border: 1px solid
        var(--ai-form-chat-border, color-mix(in srgb, currentColor 15%, transparent));
      border-radius: 12px;
      background: var(--ai-form-chat-bg, transparent);
      overflow: hidden;
    }
    .ai-chat-log {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      scroll-behavior: smooth;
    }
    .msg {
      max-width: 85%;
      padding: 0.6rem 0.85rem;
      border-radius: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .msg-assistant {
      align-self: flex-start;
      background: var(--ai-form-msg-assistant-bg, color-mix(in srgb, currentColor 8%, transparent));
      border-bottom-left-radius: 4px;
    }
    .msg-user {
      align-self: flex-end;
      background: var(--ai-form-msg-user-bg, color-mix(in srgb, currentColor 18%, transparent));
      border-bottom-right-radius: 4px;
    }
    .msg-thinking {
      opacity: 0.7;
      font-style: italic;
    }
    .ai-chat-inputbar {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.5rem;
      border-top: 1px solid
        var(--ai-form-chat-border, color-mix(in srgb, currentColor 15%, transparent));
      background: var(--ai-form-chat-inputbar-bg, transparent);
    }
    .ai-chat-inputbar textarea {
      flex: 1;
      min-height: 2.4rem;
      max-height: 8rem;
      resize: none;
      font: inherit;
      padding: 0.5rem 0.75rem;
      box-sizing: border-box;
      color: inherit;
      background: var(--ai-form-chat-textarea-bg, transparent);
      border: 1px solid
        var(--ai-form-chat-textarea-border, color-mix(in srgb, currentColor 20%, transparent));
      border-radius: 20px;
      overflow-y: auto;
    }
    .ai-chat-mic,
    .ai-chat-send {
      flex: 0 0 auto;
      width: 2.4rem;
      height: 2.4rem;
      padding: 0;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
    }
    .ai-chat-mic[aria-pressed='true'] {
      background: var(--ai-form-chat-mic-active-bg, color-mix(in srgb, red 18%, transparent));
    }
    .ai-chat-send {
      background: var(--ai-form-chat-send-bg, color-mix(in srgb, currentColor 15%, transparent));
    }
    /* ---- form section (secondary) ---- */
    .ai-form-section {
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      border: 1px dashed
        var(--ai-form-summary-border, color-mix(in srgb, currentColor 15%, transparent));
      border-radius: 8px;
      font-size: 0.92em;
      opacity: 0.95;
    }
    .ai-form-section ::slotted(form) {
      display: grid;
      gap: 0.4rem;
    }
    .ai-form-submit-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }
    button[data-action='chat-submit'] {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: var(--ai-form-submit-bg, color-mix(in srgb, currentColor 18%, transparent));
      font-weight: 600;
    }
    .ai-form-errors {
      margin-top: 0.5rem;
    }
    .ai-form-errors:empty {
      display: none;
    }
    /* ---- banners (Enable AI / downloading / unsupported) ---- */
    .ai-status {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid
        var(--ai-form-status-border, color-mix(in srgb, currentColor 20%, transparent));
      border-radius: 6px;
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
    /** @type {number} */
    this.historyTurns = 6;
    /** @type {string} */
    this._chatInput = '';
    /** @type {boolean} */
    this._chatBusy = false;
    /** @type {Array<{role: 'assistant' | 'user', text: string}>} */
    this._messages = [];
    /** @type {boolean} */
    this._chatComplete = false;
    /** @type {boolean} */
    this._validating = false;
    /** @type {boolean} */
    this._bypassNextSubmit = false;
    /** @type {string} */
    this._lastAssistantPrompt = '';
    /** @type {boolean} */
    this._primed = false;
    /** @type {(e: Event) => void} */
    this._onSubmit = (event) => {
      this._handleSubmit(event);
    };
    /** @type {boolean} */
    this._suppressChatStateUpdates = false;
    /** @type {(e: Event) => void} */
    this._onFormInput = (event) => {
      const t = /** @type {HTMLElement | null} */ (event.target);
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        if (typeof t.setCustomValidity === 'function') t.setCustomValidity('');
      }
      // During extraction we rewrite slotted inputs and dispatch input/change
      // events; letting those push their own assistant messages produces
      // duplicates. The single source of truth for the assistant reply is
      // _updateChatState({afterUserTurn: true}) at the end of the extraction.
      if (this._suppressChatStateUpdates) return;
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
    // Seed the chat once AI capability detection finishes and the chat UI
    // actually mounts. `firstUpdated` runs on the first render (with
    // aiAvailable=false), so we re-check here every time aiAvailable
    // flips to true.
    if (changed.has('aiAvailable') && this.aiAvailable && !this._primed) {
      this._updateChatState();
    }
  }

  /** @override */
  renderAI() {
    return html`
      ${this._renderStatusBanner()} ${this._renderChatUI()}
      <div class="ai-form-section" part="form-section">
        <slot></slot>
        ${this._chatComplete
          ? html`<div class="ai-form-submit-row" part="submit-wrap">
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
      </div>
      <div class="ai-form-errors" part="errors" aria-live="polite"></div>
    `;
  }

  /**
   * Render the chat shell: scrollable message log + input bar (textarea,
   * mic, send). Disabled until `aiReady` (model actually downloaded).
   * @returns {unknown}
   */
  _renderChatUI() {
    const ready = this.aiReady === true;
    const voiceActive = this.voiceInput && this.speechInAvailable;
    const canSend = ready && !this._chatBusy && this._chatInput.trim().length > 0;
    return html`
      <div class="ai-chat" part="chat" role="group" aria-label="Chat with AI assistant">
        <div
          class="ai-chat-log"
          part="chat-log"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          ${this._messages.map(
            (m) =>
              html`<div class=${'msg msg-' + m.role} part=${'msg msg-' + m.role}>${m.text}</div>`,
          )}
          ${this._chatBusy
            ? html`<div class="msg msg-assistant msg-thinking" part="msg msg-thinking">
                ${this._thinkingLabel()}
              </div>`
            : nothing}
        </div>
        <form class="ai-chat-inputbar" part="inputbar" @submit=${this._onChatInputSubmit}>
          <textarea
            part="chat-textarea"
            .value=${this._chatInput}
            @input=${(/** @type {Event} */ e) => {
              this._chatInput = /** @type {HTMLTextAreaElement} */ (e.target).value;
            }}
            @keydown=${this._onChatKeydown}
            placeholder=${ready ? this._chatPlaceholder() : this._disabledPlaceholder()}
            ?disabled=${!ready || this.listening}
            rows="1"
          ></textarea>
          ${this.voiceInput
            ? html`<button
                type="button"
                class="ai-chat-mic"
                data-action="chat-voice"
                part="mic"
                ?disabled=${!ready || !voiceActive || this._chatBusy}
                aria-pressed=${this.listening ? 'true' : 'false'}
                aria-label=${this.listening ? 'Stop listening' : 'Dictate message'}
                @click=${this._toggleVoiceInput}
              >
                ${this.listening ? '⏹' : '🎤'}
              </button>`
            : nothing}
          <button
            type="submit"
            class="ai-chat-send"
            data-action="chat-send"
            part="send"
            ?disabled=${!canSend}
            aria-label=${this._sendLabel()}
            title=${this._sendLabel()}
          >
            ➤
          </button>
        </form>
      </div>
    `;
  }

  /** @param {Event} e */
  _onChatInputSubmit(e) {
    e.preventDefault();
    this._runExtractionFromChat();
  }

  /** @param {KeyboardEvent} e */
  _onChatKeydown(e) {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!this._chatBusy && this._chatInput.trim().length > 0 && this.aiReady === true) {
        this._runExtractionFromChat();
      }
    }
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
      // Use the label's full text, but strip form controls first so we
      // don't leak any input value/text. Works for:
      //   <label><span>Name</span><input></label>
      //   <label>Name <input></label>
      //   <label><input><span>Accept TOS</span></label>
      const cloned = /** @type {HTMLLabelElement} */ (closest.cloneNode(true));
      for (const formEl of cloned.querySelectorAll('input, textarea, select, button')) {
        formEl.remove();
      }
      const text = (cloned.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) return text;
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
   * Recompute the dynamic prompt and the `_chatComplete` gate based on the
   * current values of slotted form fields and their classification. Appends
   * (or replaces) an assistant message when the pending set changes so the
   * conversation stays in sync. Emits `ai-conversation-update` on changes.
   * @param {{afterUserTurn?: boolean, skipAssistantPush?: boolean}} [options]
   */
  _updateChatState(options) {
    const afterUserTurn = options?.afterUserTurn === true;
    const skipAssistantPush = options?.skipAssistantPush === true;
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

    const promptChanged = prompt !== this._lastAssistantPrompt;
    const completeChanged = complete !== this._chatComplete;
    this._chatComplete = complete;

    // Seed the first assistant message on the very first pass once AI is
    // available, and on every user-turn response. Dedup guard: if the
    // last assistant bubble already carries the same text, say nothing.
    if (
      this.aiAvailable &&
      !skipAssistantPush &&
      (!this._primed || afterUserTurn || promptChanged)
    ) {
      const lastMsg = this._messages[this._messages.length - 1];
      const duplicate = lastMsg && lastMsg.role === 'assistant' && lastMsg.text === prompt;
      if (!this._primed) {
        this._messages = [{ role: 'assistant', text: prompt }];
        this._primed = true;
      } else if (duplicate) {
        /* skip — same text as last assistant bubble */
      } else if (afterUserTurn) {
        // Post-user-turn response: push a fresh assistant message.
        this._messages = [...this._messages, { role: 'assistant', text: prompt }];
      } else if (promptChanged) {
        // Background recompute (user edited a field by hand): update the
        // last assistant bubble if it's still the stale prompt, otherwise
        // append a new one so the chat keeps history.
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.text === this._lastAssistantPrompt) {
          this._messages = [...this._messages.slice(0, -1), { role: 'assistant', text: prompt }];
        } else {
          this._messages = [...this._messages, { role: 'assistant', text: prompt }];
        }
      }
      this._lastAssistantPrompt = prompt;
    }

    if (promptChanged || completeChanged) {
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
   * @returns {{and: string, readyAI: string, askOne: (s: string) => string, askMany: (s: string) => string, askOptional: (s: string) => string, askMixed: (r: string, o: string) => string, remindManual: (s: string) => string, placeholder: string, disabledPlaceholder: string, send: string, thinking: string, submit: string, noMatch: string, noExtractableInputs: string, error: string}}
   */
  _templates() {
    const lang = (this.language || 'en').slice(0, 2).toLowerCase();
    if (lang === 'es') {
      return {
        and: 'y',
        readyAI: 'Tengo todo lo que necesito. Puedes enviar el formulario.',
        askOne: (s) => `Hola 👋 Para ayudarte a rellenar el formulario, ¿me dices ${s}?`,
        askMany: (s) => `Hola 👋 Cuéntame ${s} y lo rellenaré por ti.`,
        askOptional: (s) => `Opcionalmente, cuéntame ${s}.`,
        askMixed: (req, opt) => `Hola 👋 Cuéntame ${req}, y opcionalmente ${opt}.`,
        remindManual: (s) => `Además, recuerda rellenar a mano: ${s}.`,
        placeholder: 'Escribe tu mensaje…',
        disabledPlaceholder: 'Activa la IA para empezar a chatear.',
        send: 'Enviar',
        thinking: 'Pensando…',
        submit: 'Enviar formulario',
        noMatch: 'No he podido extraer nada de eso. ¿Puedes repetirlo con más detalle?',
        noExtractableInputs:
          'Este formulario no tiene campos marcados con ai-extract, así que no puedo rellenarlo por ti.',
        error: 'Ha fallado la llamada a la IA. Vuelve a intentarlo.',
        formatErrors: {
          'nif-missing-letter': (_n, _v, ctx) =>
            `Te falta la letra de control. Tu DNI sería ${ctx?.suggestion ?? ''}. ¿Me lo confirmas?`,
          'nif-wrong-letter': (_n, _v, ctx) =>
            `La letra del DNI no coincide. Para esos dígitos sería ${ctx?.suggestion ?? ''}. ¿Es ese tu DNI?`,
          'nif-bad-format': () =>
            'No parece un DNI/NIF válido (deberían ser 8 dígitos + letra). ¿Me lo repites?',
          'nie-missing-letter': (_n, _v, ctx) =>
            `Te falta la letra de control del NIE. Sería ${ctx?.suggestion ?? ''}. ¿Me lo confirmas?`,
          'nie-wrong-letter': (_n, _v, ctx) =>
            `La letra del NIE no coincide. Sería ${ctx?.suggestion ?? ''}. ¿Es ese tu NIE?`,
          'nie-bad-format': () =>
            'No parece un NIE válido (X/Y/Z + 7 dígitos + letra, o T + 8 caracteres). ¿Me lo repites?',
          nif: () =>
            'El DNI/NIF que me has dado no parece correcto (la letra no encaja). ¿Me lo repites?',
          nie: () => 'El NIE que me has dado no parece correcto. ¿Me lo repites?',
          cif: () => 'El CIF que me has dado no parece correcto. ¿Me lo repites?',
          email: () =>
            'El correo electrónico que me has dado no es válido. ¿Me lo repites despacito, letra a letra?',
          mobileEs: () =>
            'El móvil que me has dado no parece un número español válido (deberían ser 9 dígitos empezando por 6 o 7). ¿Me lo repites?',
          movil: () =>
            'El móvil que me has dado no parece un número español válido (9 dígitos empezando por 6 o 7). ¿Me lo repites?',
          mobile: () =>
            'El móvil que me has dado no parece un número español válido. ¿Me lo repites?',
          telephoneEs: () => 'El teléfono que me has dado no parece válido. ¿Me lo repites?',
          telephone: () => 'El teléfono que me has dado no parece válido. ¿Me lo repites?',
          tel: () => 'El teléfono que me has dado no parece válido. ¿Me lo repites?',
          landlineEs: () => 'El número fijo que me has dado no parece válido. ¿Me lo repites?',
          postalCodeEs: () =>
            'El código postal que me has dado no parece válido (deben ser 5 dígitos). ¿Me lo repites?',
          cp: () =>
            'El código postal que me has dado no parece válido (5 dígitos). ¿Me lo repites?',
          url: () =>
            'La URL que me has dado no parece válida. ¿Puedes repetirla incluyendo https://?',
          date: () =>
            'La fecha que me has dado no parece válida. ¿Me la repites en formato dd/mm/aaaa?',
          fecha: () =>
            'La fecha que me has dado no parece válida. ¿Me la repites en formato dd/mm/aaaa?',
          iccid: () => 'El ICCID que me has dado no parece válido. ¿Me lo repites?',
          creditCard: () => 'El número de tarjeta no es válido. ¿Me lo repites?',
          creditcard: () => 'El número de tarjeta no es válido. ¿Me lo repites?',
          tarjetacredito: () => 'El número de tarjeta no es válido. ¿Me lo repites?',
          bankAccountEs: () => 'El número de cuenta no parece válido. ¿Me lo repites?',
          cuentabancaria: () => 'El número de cuenta no parece válido. ¿Me lo repites?',
          accountnumber: () => 'El número de cuenta no parece válido. ¿Me lo repites?',
          integer: () => 'El valor que me has dado no parece un número entero. ¿Me lo repites?',
          int: () => 'El valor que me has dado no parece un número entero. ¿Me lo repites?',
          float: () => 'El valor que me has dado no parece un número. ¿Me lo repites?',
          number: () => 'El valor que me has dado no parece un número. ¿Me lo repites?',
          alpha: () => 'El valor solo debería contener letras. ¿Me lo repites?',
          _default: (name) => `El valor de ${name} no es válido. ¿Me lo repites?`,
        },
      };
    }
    return {
      and: 'and',
      readyAI: "I've got everything I need. You can submit the form.",
      askOne: (s) => `Hi 👋 To help you fill out the form, what's your ${s}?`,
      askMany: (s) => `Hi 👋 Tell me your ${s} and I'll fill it in for you.`,
      askOptional: (s) => `Optionally, tell me your ${s}.`,
      askMixed: (req, opt) => `Hi 👋 Tell me your ${req}, and optionally your ${opt}.`,
      remindManual: (s) => `Also, don't forget to fill in manually: ${s}.`,
      placeholder: 'Type a message…',
      disabledPlaceholder: 'Enable AI to start chatting.',
      send: 'Send',
      thinking: 'Thinking…',
      submit: 'Submit form',
      noMatch: "I couldn't extract anything from that. Can you rephrase with more detail?",
      noExtractableInputs:
        "This form has no fields marked with ai-extract, so I can't fill it in for you.",
      error: 'The AI call failed. Please try again.',
      formatErrors: {
        'nif-missing-letter': (_n, _v, ctx) =>
          `The control letter is missing. Your DNI would be ${ctx?.suggestion ?? ''}. Is that right?`,
        'nif-wrong-letter': (_n, _v, ctx) =>
          `The DNI control letter doesn't match. For those digits it should be ${ctx?.suggestion ?? ''}. Is that your DNI?`,
        'nif-bad-format': () =>
          "That doesn't look like a valid DNI/NIF (should be 8 digits + letter). Can you repeat it?",
        'nie-missing-letter': (_n, _v, ctx) =>
          `The NIE control letter is missing. It would be ${ctx?.suggestion ?? ''}. Is that right?`,
        'nie-wrong-letter': (_n, _v, ctx) =>
          `The NIE control letter doesn't match. It should be ${ctx?.suggestion ?? ''}. Is that your NIE?`,
        'nie-bad-format': () =>
          "That doesn't look like a valid NIE (X/Y/Z + 7 digits + letter, or T + 8 chars). Can you repeat it?",
        nif: () =>
          "The DNI/NIF you gave me doesn't look right (the control letter doesn't check out). Can you repeat it?",
        nie: () => "The NIE you gave me doesn't look right. Can you repeat it?",
        cif: () => "The CIF you gave me doesn't look right. Can you repeat it?",
        email: () =>
          "That email address isn't valid. Can you spell it out for me, letter by letter?",
        mobileEs: () =>
          "That mobile number isn't a valid Spanish mobile (should be 9 digits starting with 6 or 7). Can you repeat it?",
        movil: () => "That mobile number isn't a valid Spanish mobile. Can you repeat it?",
        mobile: () => "That mobile number isn't a valid Spanish mobile. Can you repeat it?",
        telephoneEs: () => "That phone number isn't valid. Can you repeat it?",
        telephone: () => "That phone number isn't valid. Can you repeat it?",
        tel: () => "That phone number isn't valid. Can you repeat it?",
        landlineEs: () => "That landline number isn't valid. Can you repeat it?",
        postalCodeEs: () => "That postal code isn't valid (should be 5 digits). Can you repeat it?",
        cp: () => "That postal code isn't valid (5 digits). Can you repeat it?",
        url: () => "That URL doesn't look valid. Can you repeat it including https://?",
        date: () => "That date isn't valid. Can you repeat it as dd/mm/yyyy?",
        fecha: () => "That date isn't valid. Can you repeat it as dd/mm/yyyy?",
        iccid: () => "That ICCID isn't valid. Can you repeat it?",
        creditCard: () => "That card number isn't valid. Can you repeat it?",
        creditcard: () => "That card number isn't valid. Can you repeat it?",
        tarjetacredito: () => "That card number isn't valid. Can you repeat it?",
        bankAccountEs: () => "That account number isn't valid. Can you repeat it?",
        cuentabancaria: () => "That account number isn't valid. Can you repeat it?",
        accountnumber: () => "That account number isn't valid. Can you repeat it?",
        integer: () => "That doesn't look like an integer. Can you repeat it?",
        int: () => "That doesn't look like an integer. Can you repeat it?",
        float: () => "That doesn't look like a number. Can you repeat it?",
        number: () => "That doesn't look like a number. Can you repeat it?",
        alpha: () => 'The value should only contain letters. Can you repeat it?',
        _default: (name) => `The value for ${name} isn't valid. Can you repeat it?`,
      },
    };
  }

  _chatPlaceholder() {
    return this._templates().placeholder;
  }
  _disabledPlaceholder() {
    return this._templates().disabledPlaceholder;
  }
  _sendLabel() {
    return this._templates().send;
  }
  _thinkingLabel() {
    return this._templates().thinking;
  }
  _submitLabel() {
    return this._templates().submit;
  }

  /**
   * Resolve the deterministic format validator for a slotted input. Reads
   * `ai-format` first, falls back to `data-tovalidate` (drop-in compat with
   * `automatic_form_validation`). Returns `{name, fn}` or `null` if the
   * input has no `ai-format`/`data-tovalidate` attribute or the validator
   * name is unknown to `@manufosela/form-validators`. Unknown names emit
   * a single console.warn per name (per session).
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
   * @returns {{ name: string, fn: (value: unknown, ...rest: unknown[]) => boolean } | null}
   */
  /**
   * Build the user-facing message for a failed format validation. Tries
   * the diagnostic key first (e.g. `nif-missing-letter` with computed
   * suggestion) and falls back to the per-validator generic, then to the
   * `_default` template.
   * @param {ReturnType<AIForm['_templates']>} t Templates for the current language.
   * @param {string} format Validator name (e.g. `nif`, `mobileEs`).
   * @param {string} fieldName The slotted input's `name`.
   * @param {string} value The value that failed.
   * @returns {string}
   */
  _formatErrorMessage(t, format, fieldName, value) {
    const diag = this._diagnoseFormatFailure(format, value);
    if (diag && t.formatErrors[diag.key]) {
      return t.formatErrors[diag.key](fieldName, value, diag);
    }
    const fn = t.formatErrors[format] || t.formatErrors._default;
    return fn(fieldName, value, diag || undefined);
  }

  /**
   * Diagnose why a value failed its format validator and produce a key +
   * context object that the i18n templates can render. Returns `null` when
   * we have nothing diagnostic to add (consumer falls back to the generic
   * `formatErrors[name]` message).
   * @param {string} format
   * @param {string} value
   * @returns {{ key: string, suggestion?: string } | null}
   */
  _diagnoseFormatFailure(format, value) {
    const TABLE = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const dniLetterFor = (n) => TABLE.charAt(n % 23);
    const v = (value ?? '').toUpperCase();

    if (format === 'nif') {
      if (/^\d{8}$/.test(v)) {
        return { key: 'nif-missing-letter', suggestion: v + dniLetterFor(parseInt(v, 10)) };
      }
      if (/^\d{8}[A-Z]$/.test(v)) {
        const correct = dniLetterFor(parseInt(v.substring(0, 8), 10));
        return { key: 'nif-wrong-letter', suggestion: v.substring(0, 8) + correct };
      }
      return { key: 'nif-bad-format' };
    }

    if (format === 'nie') {
      // XYZ form: replace prefix with digit, compute letter
      if (/^[XYZ]\d{7}$/.test(v)) {
        const swapped = v.replace(/^X/, '0').replace(/^Y/, '1').replace(/^Z/, '2');
        const correct = dniLetterFor(parseInt(swapped, 10));
        return { key: 'nie-missing-letter', suggestion: v + correct };
      }
      if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
        const swapped = v.replace(/^X/, '0').replace(/^Y/, '1').replace(/^Z/, '2');
        const correct = dniLetterFor(parseInt(swapped.substring(0, 8), 10));
        return { key: 'nie-wrong-letter', suggestion: v.substring(0, 8) + correct };
      }
      return { key: 'nie-bad-format' };
    }

    return null;
  }

  _resolveFormatValidator(el) {
    const raw = el.getAttribute('ai-format') || el.getAttribute('data-tovalidate');
    if (!raw) return null;
    const fn = resolveValidator(raw);
    if (!fn) {
      if (!_warnedUnknownFormats.has(raw)) {
        _warnedUnknownFormats.add(raw);
        console.warn(
          `[ai-form] unknown ai-format / data-tovalidate value: "${raw}". ` +
            'See @manufosela/form-validators for the list of supported names.',
        );
      }
      return null;
    }
    return { name: raw, fn };
  }

  /**
   * Send handler. Pushes the user's message into the chat, runs extraction
   * against the Prompt API and writes extracted values back into the
   * slotted inputs, then asks the state machine to append the assistant's
   * follow-up message.
   */
  async _runExtractionFromChat() {
    const text = this._chatInput.trim();
    if (!text) return;
    // Push the user's message immediately so the chat feels responsive.
    this._messages = [...this._messages, { role: 'user', text }];
    this._chatInput = '';
    /**
     * If we push a contextual assistant message ourselves (rejection,
     * no-match, error), suppress the generic afterUserTurn refresh so the
     * user doesn't see two near-identical bubbles.
     */
    let suppressAfterUserTurnPush = false;

    const { aiCandidates } = this._classifyFields();
    if (aiCandidates.length === 0) {
      this.dispatchEvent(
        new CustomEvent('ai-no-match', {
          bubbles: true,
          composed: true,
          detail: { reason: 'no-extractable-inputs' },
        }),
      );
      this._messages = [
        ...this._messages,
        { role: 'assistant', text: this._templates().noExtractableInputs },
      ];
      return;
    }
    this._chatBusy = true;
    this._suppressChatStateUpdates = true;
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
        this._messages = [
          ...this._messages,
          { role: 'assistant', text: this._templates().noMatch },
        ];
        suppressAfterUserTurnPush = true;
        return;
      }

      // Intent branch: when the model classifies the user's message as
      // help/clarify/correct (rather than data), it returns __intent +
      // __answer. We surface the answer as a chat bubble and skip the
      // extraction loop entirely so we don't write garbage from a
      // question.
      const intent = typeof parsed.__intent === 'string' ? parsed.__intent.toLowerCase() : null;
      const intentAnswer = typeof parsed.__answer === 'string' ? parsed.__answer : '';
      if (intent && intent !== 'extract' && intentAnswer) {
        this.dispatchEvent(
          new CustomEvent('ai-conversation-help', {
            bubbles: true,
            composed: true,
            detail: { intent, answer: intentAnswer },
          }),
        );
        this._messages = [...this._messages, { role: 'assistant', text: intentAnswer }];
        suppressAfterUserTurnPush = true;
        return;
      }

      /** @type {ExtractedField[]} */
      const extracted = [];
      /** @type {Array<{ name: string, format: string, value: string }>} */
      const rejected = [];
      for (const field of aiCandidates) {
        const value = parsed[field.name];
        if (value == null || value === '') continue;
        const str = String(value);
        // Deterministic format check before writing the value.
        const validator = this._resolveFormatValidator(field.element);
        if (validator && !validator.fn(str)) {
          rejected.push({ name: field.name, format: validator.name, value: str });
          continue;
        }
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

      if (rejected.length > 0) {
        this.dispatchEvent(
          new CustomEvent('ai-extraction-rejected', {
            bubbles: true,
            composed: true,
            detail: { fields: rejected },
          }),
        );
        const t = this._templates();
        const lines = rejected.map((r) => this._formatErrorMessage(t, r.format, r.name, r.value));
        this._messages = [...this._messages, { role: 'assistant', text: lines.join(' ') }];
        suppressAfterUserTurnPush = true;
      } else if (extracted.length === 0) {
        this.dispatchEvent(
          new CustomEvent('ai-no-match', {
            bubbles: true,
            composed: true,
            detail: { reason: 'no-fields-matched', response, parsed },
          }),
        );
        this._messages = [
          ...this._messages,
          { role: 'assistant', text: this._templates().noMatch },
        ];
        suppressAfterUserTurnPush = true;
      }
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('ai-error', {
          bubbles: true,
          composed: true,
          detail: { error, stage: 'conversation-extract' },
        }),
      );
      this._messages = [...this._messages, { role: 'assistant', text: this._templates().error }];
      suppressAfterUserTurnPush = true;
    } finally {
      this._chatBusy = false;
      this._suppressChatStateUpdates = false;
      // Let the state machine push the follow-up assistant message based
      // on what's still pending (single source of truth for the prompt),
      // unless we already pushed a contextual message (rejection / no-match
      // / error) — in that case the contextual message IS the response.
      this._updateChatState({
        afterUserTurn: true,
        skipAssistantPush: suppressAfterUserTurnPush,
      });
      // Scroll the message log after the next paint.
      this._scrollLogToBottom();
    }
  }

  /**
   * Scroll the chat log to the bottom so the newest message is in view.
   */
  _scrollLogToBottom() {
    requestAnimationFrame(() => {
      const log = this.shadowRoot?.querySelector('.ai-chat-log');
      if (log) log.scrollTop = log.scrollHeight;
    });
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
   * Build the extraction prompt sent to the Chrome Prompt API. Each field
   * is annotated with its description (`ai-extract`), input type
   * (email/tel/url/number/text), an `ai-validate` rule when present, and a
   * `pattern` regex if any. The model is instructed to normalize values
   * (fix dictation artifacts using surrounding context) and to OMIT any
   * field whose extracted value would not satisfy its constraints — so an
   * unintelligible reply produces an empty field instead of garbage.
   * @param {string} text
   * @param {ExtractableField[]} fields
   * @returns {string}
   */
  _buildExtractionPrompt(text, fields) {
    const list = fields
      .map((f) => {
        const constraints = this._fieldConstraints(f.element);
        const constraintStr = constraints.length ? ` [${constraints.join('; ')}]` : '';
        return `- ${f.name} (${f.description})${constraintStr}`;
      })
      .join('\n');
    const history = this._buildHistorySection();
    return [
      'You assist a user filling out a form via a chat. The user message may be:',
      '  (a) data to extract into form fields',
      '  (b) a question, doubt or meta-comment ("I don\'t remember", "can you calculate it?", "what should I put in X?")',
      '  (c) a correction of something previously said',
      '',
      'Choose ONE intent and return ONLY a minified JSON object accordingly:',
      '  - intent "extract": include each extracted field as a string-valued key. Do NOT include __intent.',
      '  - intent "help" / "clarify" / "correct": include `__intent: "<one-of-those>"` and `__answer: "<short reply in the user language>"`. Do NOT include any field keys.',
      '',
      'For extraction:',
      '- Normalize values (no extra spaces, fix obvious dictation errors using context, conventional form).',
      '- Constraints in [brackets] MUST be satisfied. If you cannot satisfy them, OMIT that field. Empty is better than wrong.',
      '- Use OTHER fields and the recent conversation as context (e.g. a known full name can fix a misheard email).',
      '',
      'For help/clarify/correct:',
      '- Be concise (max 2 sentences). Answer the question or acknowledge the correction.',
      '- For computational questions you can answer (e.g. compute a NIF control letter), do it.',
      '',
      'Do not wrap the JSON in markdown fences. Do not add commentary outside the JSON.',
      `Language hint: ${this.language}.`,
      '',
      'Fields:',
      list,
      ...(history ? ['', 'Recent conversation:', history] : []),
      '',
      'User message:',
      '"""',
      text,
      '"""',
    ].join('\n');
  }

  /**
   * Build the "Recent conversation" section: the last `historyTurns`
   * messages from `_messages`, formatted as `assistant: ...` /
   * `user: ...`. Returns an empty string when there's no history yet (the
   * very first user turn) or when `historyTurns` is 0.
   * @returns {string}
   */
  _buildHistorySection() {
    const turns = Math.max(0, Number(this.historyTurns) || 0);
    if (turns === 0) return '';
    // The current user message has already been pushed to _messages by
    // _runExtractionFromChat; exclude it from history.
    const log = this._messages.slice(0, -1).slice(-turns);
    if (log.length === 0) return '';
    return log.map((m) => `${m.role}: ${m.text}`).join('\n');
  }

  /**
   * Compose the natural-language constraints to send to the model for a
   * given input. Combines the input's `type` (email/tel/url/number),
   * `ai-validate` rule, and `pattern` regex if any.
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
   * @returns {string[]}
   */
  _fieldConstraints(el) {
    /** @type {string[]} */
    const parts = [];
    const type = el instanceof HTMLInputElement ? (el.type || '').toLowerCase() : '';
    if (type === 'email') {
      parts.push('must be a valid email in format name@domain.tld');
      parts.push('strip spaces, lowercase, fix obvious dictation errors using context');
      parts.push("if the text doesn't contain something interpretable as an email, OMIT");
    } else if (type === 'tel') {
      parts.push('must be a valid phone number');
      parts.push('keep digits with optional spaces, dashes or a leading +');
      parts.push('if not a phone number, OMIT');
    } else if (type === 'url') {
      parts.push('must be a valid URL with scheme');
      parts.push('add https:// if missing, lowercase the domain');
      parts.push('if not a URL, OMIT');
    } else if (type === 'number') {
      parts.push('must be a numeric value');
      parts.push('if not numeric, OMIT');
    }
    const validate = el.getAttribute('ai-validate');
    if (validate) parts.push(`must satisfy: ${validate}`);
    const pattern = el instanceof HTMLInputElement ? el.getAttribute('pattern') : null;
    if (pattern) parts.push(`must match the regex /${pattern}/`);
    return parts;
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
   * Intercepts every submit that bubbles out of the slotted form. Two
   * gates run in order:
   * 1. Deterministic format validation (`ai-format` / `data-tovalidate`)
   *    via `@manufosela/form-validators`. If any field fails, we set
   *    customValidity, call reportValidity and abort.
   * 2. Semantic AI validation (`ai-validate`) via the Prompt API.
   *
   * Either gate can be empty and the other still runs.
   * @param {Event} event
   */
  _handleSubmit(event) {
    if (this._bypassNextSubmit) {
      this._bypassNextSubmit = false;
      return;
    }
    if (!(event.target instanceof HTMLFormElement)) return;

    // Gate 1: deterministic format validators run regardless of AI availability.
    if (!this._runFormatGate(event)) return;

    if (!this.aiAvailable || this.aiCapabilities?.prompt === 'unavailable') {
      return;
    }
    const fields = this._findValidatableFields(event.target);
    if (fields.length === 0) return;

    event.preventDefault();
    this._runValidation(event.target, fields);
  }

  /**
   * Run deterministic `ai-format` validators across the slotted form.
   * Returns `true` when every field with a recognised format passes (or
   * has no value) so the submit may continue, `false` when at least one
   * fails — in which case we set customValidity + reportValidity and
   * cancel the submit.
   * @param {Event} event
   * @returns {boolean}
   */
  _runFormatGate(event) {
    const form = /** @type {HTMLFormElement} */ (event.target);
    /** @type {Array<{ name: string, format: string, value: string }>} */
    const failures = [];
    for (const c of form.querySelectorAll('[name]')) {
      if (
        !(c instanceof HTMLInputElement) &&
        !(c instanceof HTMLTextAreaElement) &&
        !(c instanceof HTMLSelectElement)
      ) {
        continue;
      }
      const validator = this._resolveFormatValidator(c);
      if (!validator) continue;
      const value = typeof c.value === 'string' ? c.value : '';
      if (value === '') continue; // presence is the `required` attribute's job
      if (validator.fn(value)) {
        if (typeof c.setCustomValidity === 'function') c.setCustomValidity('');
      } else {
        const t = this._templates();
        const msg = this._formatErrorMessage(t, validator.name, c.name, value);
        if (typeof c.setCustomValidity === 'function') c.setCustomValidity(msg);
        failures.push({ name: c.name, format: validator.name, value });
      }
    }
    if (failures.length === 0) return true;
    event.preventDefault();
    form.reportValidity();
    this.dispatchEvent(
      new CustomEvent('ai-extraction-rejected', {
        bubbles: true,
        composed: true,
        detail: { fields: failures, stage: 'submit' },
      }),
    );
    return false;
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
   * transcript is written into the chat textarea live (continuous +
   * interim results) so the user can dictate a full message and see it
   * appear as they speak. Click the mic again (or the send button) to stop.
   * @returns {Promise<void>}
   */
  async _toggleVoiceInput() {
    if (this.listening) {
      this.stopSpeechInput();
      return;
    }
    // Remember what was already in the textarea so interim + final
    // results are appended to it rather than replacing it.
    const prefix = this._chatInput ? this._chatInput.replace(/\s+$/, '') + ' ' : '';
    try {
      const transcript = await this.startSpeechInput({
        lang: this.language,
        continuous: true,
        interimResults: true,
        onInterim: (partial, finalSoFar) => {
          // Live update: show final-so-far + what's being heard right now.
          this._chatInput = prefix + finalSoFar + partial;
        },
      });
      if (transcript == null) return;
      // On end, commit the final transcript (or whatever was captured).
      this._chatInput = (prefix + transcript).trim();
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
