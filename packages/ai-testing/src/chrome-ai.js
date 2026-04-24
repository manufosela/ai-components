import { spy } from './_spy.js';

/**
 * @typedef {'available' | 'downloadable' | 'downloading' | 'unavailable' | 'readily' | 'after-download' | 'no'} RawAvailability
 */

/**
 * Options accepted by every per-API factory.
 * @typedef {object} ApiMockConfig
 * @property {RawAvailability}                 [availability]  What `availability()` resolves to. Default `'available'`.
 * @property {string | ((input: string) => string)} [response]  Single canned response.
 * @property {string[]}                        [responses]     Rotating list of canned responses. Takes precedence over `response`.
 * @property {boolean}                         [rejectCreate]  Make `create()` reject (simulates OS download failure).
 */

/**
 * @param {ApiMockConfig} config
 * @param {string}        sessionMethod
 * @returns {any}
 */
function buildApi(config, sessionMethod) {
  const { availability = 'available', response, responses, rejectCreate = false } = config;

  let callIndex = 0;
  /**
   * @param {string} input
   * @returns {string}
   */
  const pickResponse = (input) => {
    if (responses && responses.length > 0) {
      const out = responses[callIndex % responses.length];
      callIndex += 1;
      return out;
    }
    if (typeof response === 'function') return response(input);
    return response ?? 'mock response';
  };

  const availabilitySpy = spy(async () => availability);

  const createSpy = spy(async (_options) => {
    if (rejectCreate) throw new Error('@manufosela/ai-testing: create() rejected');
    const methodSpy = spy(async (input) => pickResponse(input));
    const destroySpy = spy();
    return {
      [sessionMethod]: methodSpy,
      destroy: destroySpy,
    };
  });

  return {
    availability: availabilitySpy,
    create: createSpy,
  };
}

/**
 * @param {ApiMockConfig} [config]
 * @returns {any}
 */
export function createLanguageModelMock(config = {}) {
  return buildApi(config, 'prompt');
}

/**
 * @param {ApiMockConfig} [config]
 * @returns {any}
 */
export function createWriterMock(config = {}) {
  return buildApi(config, 'write');
}

/**
 * @param {ApiMockConfig} [config]
 * @returns {any}
 */
export function createSummarizerMock(config = {}) {
  return buildApi(config, 'summarize');
}

/**
 * @param {ApiMockConfig} [config]
 * @returns {any}
 */
export function createTranslatorMock(config = {}) {
  return buildApi(config, 'translate');
}

/**
 * Configuration object for {@link setupChromeAIMock}.
 * Keys map to the corresponding Chrome AI API. Any omitted key leaves that
 * global untouched.
 * @typedef {object} ChromeAIMockConfig
 * @property {ApiMockConfig} [prompt]     Installed as `globalThis.LanguageModel`.
 * @property {ApiMockConfig} [writer]     Installed as `globalThis.Writer`.
 * @property {ApiMockConfig} [summarizer] Installed as `globalThis.Summarizer`.
 * @property {ApiMockConfig} [translator] Installed as `globalThis.Translator`.
 */

/**
 * Install fake Chrome AI APIs on `globalThis` and return the mocks + a
 * teardown function that restores whatever was there before.
 * @param {ChromeAIMockConfig} [config]
 * @returns {{ mocks: { LanguageModel?: any, Writer?: any, Summarizer?: any, Translator?: any }, teardown: () => void }}
 */
export function setupChromeAIMock(config = {}) {
  /** @type {Record<string, unknown>} */
  const saved = {};
  /** @type {Record<string, any>} */
  const mocks = {};
  const g = /** @type {Record<string, unknown>} */ (globalThis);

  /**
   * @param {string} globalName
   * @param {any} mock
   */
  const install = (globalName, mock) => {
    saved[globalName] = g[globalName];
    g[globalName] = mock;
    mocks[globalName] = mock;
  };

  if (config.prompt) install('LanguageModel', createLanguageModelMock(config.prompt));
  if (config.writer) install('Writer', createWriterMock(config.writer));
  if (config.summarizer) install('Summarizer', createSummarizerMock(config.summarizer));
  if (config.translator) install('Translator', createTranslatorMock(config.translator));

  const teardown = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  };

  return { mocks, teardown };
}
