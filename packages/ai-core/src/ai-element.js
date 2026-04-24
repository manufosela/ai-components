import { LitElement } from 'lit';
import { detectAICapabilities } from './detect-ai-capabilities.js';

/**
 * @typedef {import('./detect-ai-capabilities.js').AICapabilities} AICapabilities
 * @typedef {import('./detect-ai-capabilities.js').AICapabilityState} AICapabilityState
 */

/** @type {ReadonlyArray<'prompt' | 'writer' | 'summarizer' | 'translator'>} */
const CORE_APIS = ['prompt', 'writer', 'summarizer', 'translator'];

/**
 * Which core AI APIs the browser knows anything about (any state ≠ unavailable).
 * @param {AICapabilities} caps
 * @returns {boolean}
 */
function isAnyAIAvailable(caps) {
  return CORE_APIS.some((k) => caps[k] !== 'unavailable');
}

/**
 * Which core AI APIs are ready to use synchronously (state === 'available').
 * @param {AICapabilities} caps
 * @returns {boolean}
 */
function isAnyAIReady(caps) {
  return CORE_APIS.some((k) => caps[k] === 'available');
}

/**
 * Map a core API name to its global constructor-like object on `globalThis`.
 * @param {'prompt' | 'writer' | 'summarizer' | 'translator'} api
 * @returns {string}
 */
function globalNameFor(api) {
  if (api === 'prompt') return 'LanguageModel';
  if (api === 'writer') return 'Writer';
  if (api === 'summarizer') return 'Summarizer';
  return 'Translator';
}

/**
 * Base class for AI-powered web components.
 *
 * Detects Chrome Built-in AI capability on mount and exposes it as the
 * reactive properties `aiAvailable` (any API not 'unavailable') and
 * `aiReady` (at least one API 'available'). Subclasses implement
 * `renderAI()` / `renderFallback()`; the default `render()` picks between
 * them based on `aiAvailable` so the enriched UI can show a "needs
 * download" banner before the model is actually downloaded.
 * @fires ai-ready           Detection finished, at least one core AI API is usable.
 * @fires ai-unavailable     Detection finished, no core AI API is usable.
 * @fires ai-download-start  A model download was triggered via {@link AIElement#ensureAIReady}.
 * @fires ai-download-progress Download progress tick; `detail.loaded` is 0..1.
 * @fires ai-download-complete Model is now `'available'`; `detail.capabilities` is the refreshed set.
 * @fires ai-download-error  A download could not complete; `detail.error`.
 */
export class AIElement extends LitElement {
  static properties = {
    aiAvailable: { type: Boolean, attribute: false, state: true },
    aiReady: { type: Boolean, attribute: false, state: true },
    aiCapabilities: { type: Object, attribute: false, state: true },
    aiDownloading: { type: Boolean, attribute: false, state: true },
    aiDownloadProgress: { type: Number, attribute: false, state: true },
  };

  constructor() {
    super();
    /** @type {boolean} */
    this.aiAvailable = false;
    /** @type {boolean} */
    this.aiReady = false;
    /** @type {AICapabilities | null} */
    this.aiCapabilities = null;
    /** @type {boolean} */
    this.aiDownloading = false;
    /** @type {number} */
    this.aiDownloadProgress = 0;
    /** @type {Promise<AICapabilities> | null} */
    this._aiDetection = null;
    /** @type {Promise<AICapabilities> | null} */
    this._aiEnsureInFlight = null;
  }

  /**
   * Resolves with the detected capabilities after `connectedCallback` has run.
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
    this._applyCapabilities(caps);
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
   * @param {AICapabilities} caps
   */
  _applyCapabilities(caps) {
    this.aiCapabilities = caps;
    this.aiAvailable = isAnyAIAvailable(caps);
    this.aiReady = isAnyAIReady(caps);
  }

  /**
   * Bring at least one of the requested core AI APIs to the `'available'`
   * state. When an API is `'downloadable'` or `'downloading'`, triggers the
   * Chrome `create({ monitor })` flow and surfaces progress via
   * `ai-download-progress` events (detail: `{ api, loaded, total? }`).
   *
   * Must be called from a user-gesture handler (click, keypress, …) so
   * Chrome allows the download to start. Concurrent calls share the same
   * in-flight promise.
   * @param {object} [options]
   * @param {ReadonlyArray<'prompt' | 'writer' | 'summarizer' | 'translator'>} [options.apis] Which APIs to ensure. Default: ['prompt'].
   * @returns {Promise<AICapabilities>}
   */
  ensureAIReady(options = {}) {
    if (this._aiEnsureInFlight) return this._aiEnsureInFlight;
    this._aiEnsureInFlight = this._runEnsureAIReady(options).finally(() => {
      this._aiEnsureInFlight = null;
    });
    return this._aiEnsureInFlight;
  }

  /**
   * @param {{ apis?: ReadonlyArray<'prompt' | 'writer' | 'summarizer' | 'translator'> }} options
   * @returns {Promise<AICapabilities>}
   */
  async _runEnsureAIReady(options) {
    const apis = options.apis ?? ['prompt'];
    const caps = this.aiCapabilities ?? (await detectAICapabilities());

    // Short-circuit if at least one requested API is already 'available'.
    if (apis.some((a) => caps[a] === 'available')) {
      this._applyCapabilities(caps);
      return caps;
    }

    // Find the first API we can actually drive (downloadable or downloading).
    const candidate = apis.find((a) => caps[a] === 'downloadable' || caps[a] === 'downloading');
    if (!candidate) {
      this._applyCapabilities(caps);
      throw new Error('@manufosela/ai-core: no Chrome AI API is downloadable on this device');
    }

    const globalName = globalNameFor(candidate);
    const apiRef = /** @type {any} */ (globalThis)[globalName];
    if (!apiRef || typeof apiRef.create !== 'function') {
      throw new Error(`@manufosela/ai-core: Chrome ${globalName} API not available on globalThis`);
    }

    this.aiDownloading = true;
    this.aiDownloadProgress = 0;
    this.dispatchEvent(
      new CustomEvent('ai-download-start', {
        detail: { api: candidate },
        bubbles: true,
        composed: true,
      }),
    );

    try {
      const session = await apiRef.create({
        /** @param {EventTarget} m */
        monitor: (m) => {
          m.addEventListener('downloadprogress', (/** @type {any} */ e) => {
            const loaded = typeof e?.loaded === 'number' ? e.loaded : 0;
            const total = typeof e?.total === 'number' ? e.total : undefined;
            this.aiDownloadProgress = loaded;
            this.dispatchEvent(
              new CustomEvent('ai-download-progress', {
                detail: { api: candidate, loaded, total },
                bubbles: true,
                composed: true,
              }),
            );
          });
        },
      });
      // We only wanted the download; the session itself is disposable.
      try {
        session?.destroy?.();
      } catch {
        /* ignore */
      }

      const refreshed = await detectAICapabilities();
      this._applyCapabilities(refreshed);
      this.aiDownloadProgress = 1;
      this.dispatchEvent(
        new CustomEvent('ai-download-complete', {
          detail: { api: candidate, capabilities: refreshed },
          bubbles: true,
          composed: true,
        }),
      );
      return refreshed;
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('ai-download-error', {
          detail: { api: candidate, error },
          bubbles: true,
          composed: true,
        }),
      );
      throw error;
    } finally {
      this.aiDownloading = false;
    }
  }

  /**
   * Default `render()` delegates to `renderAI()` when the device knows about
   * at least one AI API (even if the model still needs downloading), so the
   * enriched UI can surface a "prepare AI" banner. Falls back to
   * `renderFallback()` when the device has no AI support at all.
   * @override
   * @returns {unknown}
   */
  render() {
    return this.aiAvailable ? this.renderAI() : this.renderFallback();
  }

  /**
   * @returns {unknown}
   */
  renderAI() {
    return undefined;
  }

  /**
   * @returns {unknown}
   */
  renderFallback() {
    return undefined;
  }
}
