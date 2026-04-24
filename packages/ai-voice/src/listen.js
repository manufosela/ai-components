/**
 * Options for {@link listen}.
 * @typedef {object} ListenOptions
 * @property {string}  [lang]           BCP-47 tag (e.g. "es-ES"). Defaults to "en-US".
 * @property {boolean} [continuous]     Keep listening until stopped. Default false.
 * @property {boolean} [interimResults] Emit interim (non-final) results through onInterim.
 * @property {(partial: string, finalSoFar: string) => void} [onInterim] Invoked with the CURRENT interim segment and the accumulated final transcript so far. For a typical live-update UI, render `finalSoFar + partial`.
 * @property {AbortSignal} [signal]     Aborts the recognition; resolves with whatever was captured so far.
 */

/**
 * True if SpeechRecognition (standard or webkit prefix) is available on `globalThis`.
 * @returns {boolean}
 */
export function isListenAvailable() {
  const g = /** @type {Record<string, unknown>} */ (globalThis);
  return (
    typeof g.SpeechRecognition !== 'undefined' || typeof g.webkitSpeechRecognition !== 'undefined'
  );
}

/**
 * Resolve the SpeechRecognition constructor on the current globalThis,
 * preferring the standard name and falling back to the webkit-prefixed one.
 * Returns `null` when neither is present.
 * @returns {(new () => SpeechRecognition) | null}
 */
function getSpeechRecognitionCtor() {
  const g = /** @type {Record<string, unknown>} */ (globalThis);
  return /** @type {any} */ (g.SpeechRecognition || g.webkitSpeechRecognition || null);
}

/**
 * Promisified wrapper around Web SpeechRecognition. Resolves with the final
 * transcript when recognition ends (either naturally or via `signal.abort()`)
 * and rejects on a recognition error.
 *
 * Accumulates only final results. Interim results are delivered via
 * `options.onInterim` if provided.
 * @param {ListenOptions} [options]
 * @returns {Promise<string>}
 */
export function listen(options = {}) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return Promise.reject(new Error('@manufosela/ai-voice: SpeechRecognition not available'));
  }

  const { lang = 'en-US', continuous = false, interimResults = false, onInterim, signal } = options;

  /** @type {SpeechRecognition} */
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;

  return new Promise((resolve, reject) => {
    let finalTranscript = '';
    /** @type {(() => void) | null} */
    let abortHandler = null;

    const cleanup = () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    };

    recognition.onresult = (/** @type {SpeechRecognitionEvent} */ event) => {
      /** @type {string} */
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interimResults && onInterim && interim) {
        try {
          onInterim(interim, finalTranscript);
        } catch {
          /* consumer callback errors must not break recognition */
        }
      }
    };

    recognition.onerror = (/** @type {SpeechRecognitionErrorEvent} */ event) => {
      cleanup();
      reject(new Error(`@manufosela/ai-voice: SpeechRecognition error — ${event.error}`));
    };

    recognition.onend = () => {
      cleanup();
      resolve(finalTranscript);
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        resolve('');
        return;
      }
      abortHandler = () => {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      recognition.start();
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
