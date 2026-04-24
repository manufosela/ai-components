import { listen, isListenAvailable } from './listen.js';
import { speak as speakUtterance, isSpeakAvailable } from './speak.js';

/**
 * @typedef {import('./listen.js').ListenOptions} ListenOptions
 * @typedef {import('./speak.js').SpeakOptions}   SpeakOptions
 */

/**
 * Factory mixin that adds voice I/O to any LitElement-based class.
 *
 * The resulting class declares four reactive (`state: true`) properties:
 *
 * - `listening`              — true while a speech-input session is active.
 * - `speaking`               — true while a speech-output session is active.
 * - `speechInAvailable`      — SpeechRecognition available in this browser.
 * - `speechOutAvailable`     — SpeechSynthesis  available in this browser.
 *
 * And three methods:
 *
 * - `startSpeechInput(options)` — promisified SpeechRecognition. Emits
 *   `voice-transcript` on success, `voice-error` on failure, `voice-end`
 *   at the end, and `voice-unavailable` if the API is missing.
 * - `stopSpeechInput()`         — aborts the current recognition, if any.
 * - `speak(text, options)`      — promisified SpeechSynthesis. Emits
 *   `voice-start` / `voice-end`, `voice-error` on failure, or
 *   `voice-unavailable` if the API is missing.
 *
 * All events bubble and cross the shadow boundary.
 * @template {new (...args: any[]) => any} TBase
 * @param {TBase} Base
 * @returns {TBase}
 */
export function VoiceMixin(Base) {
  class VoiceElement extends Base {
    static properties = {
      .../** @type {any} */ ((Base).properties ?? {}),
      listening: { type: Boolean, attribute: false, state: true },
      speaking: { type: Boolean, attribute: false, state: true },
      speechInAvailable: { type: Boolean, attribute: false, state: true },
      speechOutAvailable: { type: Boolean, attribute: false, state: true },
    };

    constructor(...args) {
      super(...args);
      this.listening = false;
      this.speaking = false;
      this.speechInAvailable = isListenAvailable();
      this.speechOutAvailable = isSpeakAvailable();
      /** @type {AbortController | null} */
      this._listenAbort = null;
      /** @type {AbortController | null} */
      this._speakAbort = null;
    }

    /** @override */
    connectedCallback() {
      super.connectedCallback?.();
      // Re-probe on mount in case the environment changed between construction
      // and insertion (common in tests and SSR flows).
      this.speechInAvailable = isListenAvailable();
      this.speechOutAvailable = isSpeakAvailable();
    }

    /** @override */
    disconnectedCallback() {
      this._listenAbort?.abort();
      this._speakAbort?.abort();
      super.disconnectedCallback?.();
    }

    /**
     * @param {CustomEventInit} [init]
     * @returns {CustomEventInit}
     */
    _bubbleInit(init = {}) {
      return { bubbles: true, composed: true, ...init };
    }

    /**
     * Start a speech-input session. If SpeechRecognition is not available,
     * emits `voice-unavailable` and resolves with `undefined` instead of
     * throwing, so UI callers can stay optimistic.
     * @param {ListenOptions} [options]
     * @returns {Promise<string | undefined>}
     */
    async startSpeechInput(options = {}) {
      if (!this.speechInAvailable) {
        this.dispatchEvent(
          new CustomEvent('voice-unavailable', this._bubbleInit({ detail: { api: 'speech-in' } })),
        );
        return undefined;
      }

      this._listenAbort = new AbortController();
      this.listening = true;
      try {
        const transcript = await listen({
          ...options,
          signal: this._listenAbort.signal,
        });
        this.dispatchEvent(
          new CustomEvent('voice-transcript', this._bubbleInit({ detail: { transcript } })),
        );
        this.dispatchEvent(new CustomEvent('voice-end', this._bubbleInit()));
        return transcript;
      } catch (error) {
        this.dispatchEvent(
          new CustomEvent('voice-error', this._bubbleInit({ detail: { error, api: 'speech-in' } })),
        );
        throw error;
      } finally {
        this.listening = false;
        this._listenAbort = null;
      }
    }

    /**
     * Abort an active speech-input session. No-op if none is active.
     */
    stopSpeechInput() {
      this._listenAbort?.abort();
    }

    /**
     * Speak the given text. If SpeechSynthesis is not available, emits
     * `voice-unavailable` and resolves silently.
     * @param {string} text
     * @param {SpeakOptions} [options]
     * @returns {Promise<void>}
     */
    async speak(text, options = {}) {
      if (!this.speechOutAvailable) {
        this.dispatchEvent(
          new CustomEvent('voice-unavailable', this._bubbleInit({ detail: { api: 'speech-out' } })),
        );
        return;
      }

      this._speakAbort = new AbortController();
      this.speaking = true;
      this.dispatchEvent(new CustomEvent('voice-start', this._bubbleInit()));
      try {
        await speakUtterance(text, { ...options, signal: this._speakAbort.signal });
        this.dispatchEvent(new CustomEvent('voice-end', this._bubbleInit()));
      } catch (error) {
        this.dispatchEvent(
          new CustomEvent(
            'voice-error',
            this._bubbleInit({ detail: { error, api: 'speech-out' } }),
          ),
        );
        throw error;
      } finally {
        this.speaking = false;
        this._speakAbort = null;
      }
    }
  }
  return /** @type {TBase} */ (/** @type {unknown} */ (VoiceElement));
}
