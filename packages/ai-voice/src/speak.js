/**
 * Options for {@link speak}.
 * @typedef {object} SpeakOptions
 * @property {string}           [lang]   BCP-47 tag (e.g. "es-ES").
 * @property {SpeechSynthesisVoice} [voice] Specific voice.
 * @property {number}           [rate]   0.1 – 10.
 * @property {number}           [pitch]  0 – 2.
 * @property {number}           [volume] 0 – 1.
 * @property {AbortSignal}      [signal] Cancels synthesis; resolves silently on abort.
 */

/**
 * True if SpeechSynthesis + SpeechSynthesisUtterance are available.
 * @returns {boolean}
 */
export function isSpeakAvailable() {
  const g = /** @type {Record<string, unknown>} */ (globalThis);
  return (
    typeof g.speechSynthesis !== 'undefined' && typeof g.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Promisified wrapper around Web SpeechSynthesis. Resolves when the utterance
 * finishes speaking or when `signal.abort()` is raised; rejects on a synthesis
 * error.
 * @param {string} text
 * @param {SpeakOptions} [options]
 * @returns {Promise<void>}
 */
export function speak(text, options = {}) {
  if (!isSpeakAvailable()) {
    return Promise.reject(new Error('@manufosela/ai-voice: SpeechSynthesis not available'));
  }

  const g = /** @type {Record<string, any>} */ (globalThis);
  const utterance = new g.SpeechSynthesisUtterance(text);
  if (options.lang !== undefined) utterance.lang = options.lang;
  if (options.voice !== undefined) utterance.voice = options.voice;
  if (options.rate !== undefined) utterance.rate = options.rate;
  if (options.pitch !== undefined) utterance.pitch = options.pitch;
  if (options.volume !== undefined) utterance.volume = options.volume;

  return new Promise((resolve, reject) => {
    /** @type {(() => void) | null} */
    let abortHandler = null;

    const cleanup = () => {
      utterance.onend = null;
      utterance.onerror = null;
      if (options.signal && abortHandler) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    };

    utterance.onend = () => {
      cleanup();
      resolve();
    };

    utterance.onerror = (/** @type {SpeechSynthesisErrorEvent} */ event) => {
      cleanup();
      reject(
        new Error(`@manufosela/ai-voice: SpeechSynthesis error — ${event.error || 'unknown'}`),
      );
    };

    if (options.signal) {
      if (options.signal.aborted) {
        cleanup();
        resolve();
        return;
      }
      abortHandler = () => {
        try {
          g.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
        cleanup();
        resolve();
      };
      options.signal.addEventListener('abort', abortHandler, { once: true });
    }

    g.speechSynthesis.speak(utterance);
  });
}
