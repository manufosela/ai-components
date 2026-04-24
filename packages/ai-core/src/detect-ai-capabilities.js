/**
 * Capability states reported for each AI API. Mirrors Chrome's availability()
 * shape exactly (see https://developer.chrome.com/docs/ai/get-started).
 * @typedef {'available' | 'downloadable' | 'downloading' | 'unavailable'} AICapabilityState
 */

/**
 * Shape of the object returned by {@link detectAICapabilities}.
 * @typedef {object} AICapabilities
 * @property {AICapabilityState} prompt      Chrome Prompt API / LanguageModel.
 * @property {AICapabilityState} writer      Chrome Writer API.
 * @property {AICapabilityState} summarizer  Chrome Summarizer API.
 * @property {AICapabilityState} translator  Chrome Translator API.
 * @property {boolean}           speechIn    Web SpeechRecognition available.
 * @property {boolean}           speechOut   Web SpeechSynthesis available.
 */

/**
 * Normalize a Chrome AI availability() response. Accepts both the current
 * shape ('available' | 'downloadable' | 'downloading' | 'unavailable') and
 * the legacy one ('readily' | 'after-download' | 'no'), preserving the
 * distinction between 'downloadable' and 'downloading'.
 * @param {unknown} raw
 * @returns {AICapabilityState}
 */
function normalizeState(raw) {
  if (raw === 'available' || raw === 'readily') return 'available';
  if (raw === 'downloading') return 'downloading';
  if (raw === 'downloadable' || raw === 'after-download') return 'downloadable';
  return 'unavailable';
}

/**
 * Probe a Chrome AI API for its availability. Accepts either a plain object
 * (legacy namespace shape) or a class/constructor (current Chrome shape:
 * `LanguageModel`, `Writer`, `Summarizer`, `Translator` are classes with a
 * static `availability()` method → `typeof === 'function'`).
 * @param {unknown} api - A candidate global like LanguageModel, Writer, Summarizer, Translator.
 * @returns {Promise<AICapabilityState>}
 */
async function probe(api) {
  if (api === null || api === undefined) return 'unavailable';
  const t = typeof api;
  if (t !== 'object' && t !== 'function') return 'unavailable';
  // @ts-ignore - dynamic probe
  if (typeof api.availability !== 'function') return 'unavailable';
  try {
    // @ts-ignore - dynamic probe
    const raw = await api.availability();
    return normalizeState(raw);
  } catch {
    return 'unavailable';
  }
}

/**
 * Detect which Chrome Built-in AI APIs and Web Speech APIs are present on the
 * current `globalThis`. Never throws; unknown or failing APIs report as
 * `unavailable` / `false`.
 * @returns {Promise<AICapabilities>}
 */
export async function detectAICapabilities() {
  const g = /** @type {Record<string, unknown>} */ (globalThis);
  const [prompt, writer, summarizer, translator] = await Promise.all([
    probe(g.LanguageModel),
    probe(g.Writer),
    probe(g.Summarizer),
    probe(g.Translator),
  ]);
  return {
    prompt,
    writer,
    summarizer,
    translator,
    speechIn:
      typeof g.SpeechRecognition !== 'undefined' ||
      typeof g.webkitSpeechRecognition !== 'undefined',
    speechOut: typeof g.speechSynthesis !== 'undefined',
  };
}
