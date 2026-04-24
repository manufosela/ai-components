import { LitElement } from 'lit';
import { detectAICapabilities } from './detect-ai-capabilities.js';

/**
 * @typedef {import('./detect-ai-capabilities.js').AICapabilities} AICapabilities
 */

/**
 * Whether any *core* AI API (prompt/writer/summarizer/translator) is usable.
 * "downloadable" counts as usable because the session can trigger the download.
 * @param {AICapabilities} caps
 * @returns {boolean}
 */
function isAnyAIAvailable(caps) {
  return (
    caps.prompt !== 'unavailable' ||
    caps.writer !== 'unavailable' ||
    caps.summarizer !== 'unavailable' ||
    caps.translator !== 'unavailable'
  );
}

/**
 * Base class for AI-powered web components.
 *
 * Detects Chrome Built-in AI capability once on mount and exposes it as the
 * reactive properties `aiAvailable` and `aiCapabilities`. The default
 * `render()` switches between `renderAI()` and `renderFallback()`; subclasses
 * implement either or both.
 * @fires ai-ready       Detection finished and at least one core AI API is usable.
 * @fires ai-unavailable Detection finished and no core AI API is usable.
 */
export class AIElement extends LitElement {
  static properties = {
    aiAvailable: { type: Boolean, attribute: false, state: true },
    aiCapabilities: { type: Object, attribute: false, state: true },
  };

  constructor() {
    super();
    /** @type {boolean} */
    this.aiAvailable = false;
    /** @type {AICapabilities | null} */
    this.aiCapabilities = null;
    /** @type {Promise<AICapabilities> | null} */
    this._aiDetection = null;
  }

  /**
   * Resolves with the detected capabilities after `connectedCallback` has run.
   * Useful for tests and for consumers that want to gate behavior on the first
   * detection (instead of listening to the `ai-ready` / `ai-unavailable` event).
   * @returns {Promise<AICapabilities | null>}
   */
  get aiDetectionComplete() {
    return this._aiDetection ?? Promise.resolve(null);
  }

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    this._aiDetection = this._runAIDetection();
  }

  /**
   * @returns {Promise<AICapabilities>}
   */
  async _runAIDetection() {
    const caps = await detectAICapabilities();
    this.aiCapabilities = caps;
    this.aiAvailable = isAnyAIAvailable(caps);
    this.dispatchEvent(
      new CustomEvent(this.aiAvailable ? 'ai-ready' : 'ai-unavailable', {
        detail: { capabilities: caps },
        bubbles: true,
        composed: true,
      }),
    );
    return caps;
  }

  /**
   * Default `render()` delegates to `renderAI()` or `renderFallback()` based
   * on `aiAvailable`. Subclasses normally don't override this.
   * @override
   * @returns {unknown}
   */
  render() {
    return this.aiAvailable ? this.renderAI() : this.renderFallback();
  }

  /**
   * Subclasses render the AI-enriched UI here.
   * @returns {unknown}
   */
  renderAI() {
    return undefined;
  }

  /**
   * Subclasses render the plain HTML fallback UI here.
   * @returns {unknown}
   */
  renderFallback() {
    return undefined;
  }
}
