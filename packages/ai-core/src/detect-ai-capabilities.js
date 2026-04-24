/**
 * Capability states reported for each AI API.
 * @typedef {'available' | 'downloadable' | 'unavailable'} AICapabilityState
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
 * Stub. Returns all APIs as unavailable.
 * Real implementation lands in the next commit of AIC-TSK-0003.
 * @returns {Promise<AICapabilities>}
 */
export async function detectAICapabilities() {
  return {
    prompt: 'unavailable',
    writer: 'unavailable',
    summarizer: 'unavailable',
    translator: 'unavailable',
    speechIn: false,
    speechOut: false,
  };
}
