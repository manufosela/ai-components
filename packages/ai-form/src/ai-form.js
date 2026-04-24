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
 * When Chrome AI is present, the component renders an AI toolbar above the
 * slotted form. When AI is unavailable, it renders the slotted form as-is.
 *
 * Implemented features:
 * - Capability detection + render switch (AIC-TSK-0007).
 * - Paste-assist: click 📋 Paste & fill → type/paste free text → Apply.
 *   The component asks Chrome's Prompt API to extract the fields declared
 *   via `ai-extract` on slotted inputs and fills them (AIC-TSK-0008).
 * - Semantic validation: inputs with `ai-validate="<rule>"` are validated
 *   on submit against the rule via the Prompt API. Failed rules are
 *   reported with `setCustomValidity` + `form.reportValidity` (AIC-TSK-0009).
 * - Voice I/O (opt-in): with the `voice-input` attribute, the 🎤 toolbar
 *   button listens with SpeechRecognition and writes the transcript into
 *   the currently focused `[ai-voice]` input (or the first one). With
 *   `voice-output`, validation failures are read aloud via
 *   SpeechSynthesis (AIC-TSK-0010).
 * @customElement ai-form
 * @slot                   Default slot: the `<form>` the component wraps.
 * @fires ai-ready                 Inherited from AIElement.
 * @fires ai-unavailable           Inherited from AIElement.
 * @fires ai-paste-assist-start    Paste-assist session started.
 * @fires ai-paste-assist-result   Paste-assist finished; `detail.fields` is an array of ExtractedField.
 * @fires ai-no-match              Paste-assist finished with no fields extracted.
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
    /** When present, the toolbar 🎤 button is enabled and uses SpeechRecognition. */
    voiceInput: { type: Boolean, reflect: true, attribute: 'voice-input' },
    /** When present, validation failures are read aloud with SpeechSynthesis. */
    voiceOutput: { type: Boolean, reflect: true, attribute: 'voice-output' },
    _pasteOpen: { type: Boolean, state: true },
    _pasteText: { type: String, state: true },
    _pasteBusy: { type: Boolean, state: true },
    _validating: { type: Boolean, state: true },
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
    /** @type {boolean} */
    this._pasteOpen = false;
    /** @type {string} */
    this._pasteText = '';
    /** @type {boolean} */
    this._pasteBusy = false;
    /** @type {boolean} */
    this._validating = false;
    /** @type {boolean} */
    this._bypassNextSubmit = false;
    // Arrow-bound handler so we can add/remove the same reference.
    /** @type {(e: Event) => void} */
    this._onSubmit = (event) => {
      this._handleSubmit(event);
    };
  }

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    // Submit events bubble from the slotted <form> through the light DOM
    // up to the host, so a single host-level listener catches every submit.
    this.addEventListener('submit', this._onSubmit, true);
  }

  /** @override */
  disconnectedCallback() {
    this.removeEventListener('submit', this._onSubmit, true);
    super.disconnectedCallback();
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
    const promptReady = this.aiCapabilities?.prompt === 'available';
    const voiceActive = this.voiceInput && this.speechInAvailable;
    return html`
      ${this._renderStatusBanner()}
      <div class="ai-toolbar" part="toolbar" role="toolbar">
        <button
          type="button"
          data-action="paste-assist"
          ?disabled=${!promptReady || this._pasteBusy}
          @click=${this._openPasteAssist}
          title=${promptReady
            ? 'Paste free text to auto-fill the form'
            : 'Enable AI first (download the model)'}
        >
          📋 Paste & fill
        </button>
        <button
          type="button"
          data-action="voice-input"
          ?disabled=${!voiceActive}
          aria-pressed=${this.listening ? 'true' : 'false'}
          @click=${this._toggleVoiceInput}
          title=${voiceActive
            ? this.listening
              ? 'Stop listening'
              : 'Dictate into the focused field'
            : !this.voiceInput
              ? 'Enable with the voice-input attribute'
              : 'SpeechRecognition not available'}
        >
          ${this.listening ? '⏹️ Stop' : '🎤 Voice input'}
        </button>
      </div>
      ${this._pasteOpen ? this._renderPasteUI() : nothing}
      <slot></slot>
      <div class="ai-form-errors" part="errors" aria-live="polite"></div>
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
   * Toggle a voice-input dictation session. Writes the transcript into the
   * resolved target input (currently focused `[ai-voice]` input, or the
   * first `[ai-voice]` input in the slotted form).
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
      const target = this._findVoiceTarget();
      if (!target) return;
      target.value = transcript;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      // VoiceMixin already emitted voice-error; nothing more to do here.
    }
  }

  /**
   * Find the element the next dictation should fill: currently focused
   * `[ai-voice][name]` input, else the first in the slotted form.
   * @returns {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null}
   */
  _findVoiceTarget() {
    const form = this.querySelector('form');
    if (!form) return null;
    const active = /** @type {any} */ (this.ownerDocument?.activeElement);
    if (
      active &&
      active.matches?.('[ai-voice][name]') &&
      form.contains(active) &&
      typeof active.value === 'string'
    ) {
      return active;
    }
    return /** @type {any} */ (form.querySelector('[ai-voice][name]'));
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
