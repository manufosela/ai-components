/**
 * Thin wrappers around Chrome Built-in AI APIs.
 *
 * Each helper creates a short-lived session, performs one operation, and
 * destroys the session. On missing APIs they throw with a predictable
 * message so callers can surface a friendly UI.
 */

/**
 * Run work inside a freshly created AI session, guaranteeing the session is
 * destroyed (best-effort) regardless of whether the work succeeded or threw.
 * @template TSession, TResult
 * @param {() => Promise<TSession>} create
 * @param {(session: TSession) => Promise<TResult>} fn
 * @returns {Promise<TResult>}
 */
async function withSession(create, fn) {
  const session = await create();
  try {
    return await fn(session);
  } finally {
    if (
      session &&
      typeof (/** @type {{destroy?: () => void}} */ (session).destroy) === 'function'
    ) {
      try {
        /** @type {{destroy: () => void}} */ (session).destroy();
      } catch {
        /* swallow: destruction errors must not mask the real result/error */
      }
    }
  }
}

/**
 * Lookup a global AI API and return its `create` factory, or throw a
 * standardized error if the API is not usable. Accepts both plain-object
 * namespaces and class/constructor shapes — Chrome exposes `LanguageModel`,
 * `Writer`, `Summarizer` and `Translator` as classes (`typeof === 'function'`).
 * @param {string} apiName
 * @returns {{ create: (opts?: unknown) => Promise<unknown> }}
 */
function requireApi(apiName) {
  const api = /** @type {Record<string, unknown>} */ (globalThis)[apiName];
  if (api === null || api === undefined) {
    throw new Error(`@manufosela/ai-core: Chrome ${apiName} API not available`);
  }
  const t = typeof api;
  if (t !== 'object' && t !== 'function') {
    throw new Error(`@manufosela/ai-core: Chrome ${apiName} API not available`);
  }
  if (typeof (/** @type {{create?: unknown}} */ (api).create) !== 'function') {
    throw new Error(`@manufosela/ai-core: Chrome ${apiName} API not available`);
  }
  return /** @type {{ create: (opts?: unknown) => Promise<unknown> }} */ (api);
}

/**
 * Run a single prompt against Chrome's Prompt API / LanguageModel.
 * @param {string} input
 * @param {Record<string, unknown>} [options] - Passed verbatim to `LanguageModel.create(options)`.
 * @returns {Promise<string>}
 */
export async function prompt(input, options = {}) {
  const LanguageModel = requireApi('LanguageModel');
  return /** @type {Promise<string>} */ (
    withSession(
      () => LanguageModel.create(options),
      (session) =>
        /** @type {Promise<string>} */ (
          /** @type {{prompt: (i: string) => Promise<string>}} */ (session).prompt(input)
        ),
    )
  );
}

/**
 * Summarize text with Chrome's Summarizer API.
 * @param {string} input
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<string>}
 */
export async function summarize(input, options = {}) {
  const Summarizer = requireApi('Summarizer');
  return /** @type {Promise<string>} */ (
    withSession(
      () => Summarizer.create(options),
      (session) =>
        /** @type {Promise<string>} */ (
          /** @type {{summarize: (i: string) => Promise<string>}} */ (session).summarize(input)
        ),
    )
  );
}

/**
 * Generate text with Chrome's Writer API.
 * @param {string} input
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<string>}
 */
export async function write(input, options = {}) {
  const Writer = requireApi('Writer');
  return /** @type {Promise<string>} */ (
    withSession(
      () => Writer.create(options),
      (session) =>
        /** @type {Promise<string>} */ (
          /** @type {{write: (i: string) => Promise<string>}} */ (session).write(input)
        ),
    )
  );
}

/**
 * Translate text with Chrome's Translator API.
 * @param {string} input
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<string>}
 */
export async function translate(input, options = {}) {
  const Translator = requireApi('Translator');
  return /** @type {Promise<string>} */ (
    withSession(
      () => Translator.create(options),
      (session) =>
        /** @type {Promise<string>} */ (
          /** @type {{translate: (i: string) => Promise<string>}} */ (session).translate(input)
        ),
    )
  );
}
