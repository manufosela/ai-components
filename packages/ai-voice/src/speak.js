// Stub — implementation lands in the next commit of AIC-TSK-0005.

/**
 * @returns {boolean}
 */
export function isSpeakAvailable() {
  return false;
}

/**
 * @param {string} _text
 * @param {object} [_options]
 * @returns {Promise<void>}
 */
export async function speak(_text, _options) {
  throw new Error('@manufosela/ai-voice: speak() not implemented yet');
}
