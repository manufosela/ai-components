import { describe, it, expect, afterEach } from 'vitest';
import {
  setupChromeAIMock,
  createLanguageModelMock,
  createWriterMock,
  createSummarizerMock,
  createTranslatorMock,
} from '../src/chrome-ai.js';

describe('createLanguageModelMock()', () => {
  it('availability() resolves with the configured value (default "available")', async () => {
    const mock = createLanguageModelMock();
    await expect(mock.availability()).resolves.toBe('available');

    const downloadable = createLanguageModelMock({ availability: 'downloadable' });
    await expect(downloadable.availability()).resolves.toBe('downloadable');
  });

  it('create() returns a session with a prompt() method that yields the canned response', async () => {
    const mock = createLanguageModelMock({ response: 'hi there' });
    const session = await mock.create({});
    const out = await session.prompt('anything');
    expect(out).toBe('hi there');
    expect(session.prompt.calls).toEqual([['anything']]);
  });

  it('response can be a function of the input', async () => {
    const mock = createLanguageModelMock({ response: (input) => `echo: ${input}` });
    const session = await mock.create({});
    await expect(session.prompt('hola')).resolves.toBe('echo: hola');
  });

  it('rotates through responses[] when provided', async () => {
    const mock = createLanguageModelMock({ responses: ['a', 'b', 'c'] });
    const session = await mock.create({});
    await expect(session.prompt('x')).resolves.toBe('a');
    await expect(session.prompt('x')).resolves.toBe('b');
    await expect(session.prompt('x')).resolves.toBe('c');
    await expect(session.prompt('x')).resolves.toBe('a'); // wraps
  });

  it('records create() options in .calls', async () => {
    const mock = createLanguageModelMock();
    await mock.create({ systemPrompt: 'Be nice' });
    expect(mock.create.calls).toEqual([[{ systemPrompt: 'Be nice' }]]);
  });

  it('rejectCreate makes create() throw', async () => {
    const mock = createLanguageModelMock({ rejectCreate: true });
    await expect(mock.create()).rejects.toThrow(/create\(\) rejected/);
  });

  it('session.destroy() is a spy', async () => {
    const mock = createLanguageModelMock();
    const session = await mock.create();
    session.destroy();
    expect(session.destroy.calls.length).toBe(1);
  });
});

describe('createWriterMock / createSummarizerMock / createTranslatorMock', () => {
  it('writer mock has a write() method', async () => {
    const mock = createWriterMock({ response: 'generated' });
    const session = await mock.create();
    await expect(session.write('brief')).resolves.toBe('generated');
  });

  it('summarizer mock has a summarize() method', async () => {
    const mock = createSummarizerMock({ response: 'short' });
    const session = await mock.create();
    await expect(session.summarize('long text')).resolves.toBe('short');
  });

  it('translator mock has a translate() method', async () => {
    const mock = createTranslatorMock({ response: 'hello' });
    const session = await mock.create();
    await expect(session.translate('hola')).resolves.toBe('hello');
  });
});

describe('setupChromeAIMock()', () => {
  const apis = ['LanguageModel', 'Writer', 'Summarizer', 'Translator'];
  /** @type {Record<string, any>} */
  const preserved = {};

  afterEach(() => {
    for (const k of apis) {
      if (preserved[k] !== undefined) /** @type {any} */ (globalThis)[k] = preserved[k];
      else delete (/** @type {any} */ (globalThis)[k]);
      delete preserved[k];
    }
  });

  it('installs only the APIs you ask for; omitted keys leave globals untouched', () => {
    /** @type {any} */ (globalThis).Translator = { sentinel: true };
    preserved.Translator = undefined; // signal it should be deleted, not preserved

    const { teardown } = setupChromeAIMock({
      prompt: { response: 'p' },
    });

    expect(/** @type {any} */ (globalThis).LanguageModel).toBeDefined();
    expect(/** @type {any} */ (globalThis).Writer).toBeUndefined();
    expect(/** @type {any} */ (globalThis).Summarizer).toBeUndefined();
    // Untouched: stays as the pre-existing sentinel.
    expect(/** @type {any} */ (globalThis).Translator.sentinel).toBe(true);

    teardown();

    expect(/** @type {any} */ (globalThis).LanguageModel).toBeUndefined();
    expect(/** @type {any} */ (globalThis).Translator.sentinel).toBe(true);
    delete (/** @type {any} */ (globalThis).Translator);
  });

  it('returns mocks keyed by their global name', () => {
    const { mocks, teardown } = setupChromeAIMock({
      prompt: { response: 'p' },
      writer: { response: 'w' },
    });
    expect(mocks.LanguageModel).toBe(/** @type {any} */ (globalThis).LanguageModel);
    expect(mocks.Writer).toBe(/** @type {any} */ (globalThis).Writer);
    teardown();
  });

  it('teardown restores the previous value if the global existed before', () => {
    /** @type {any} */ (globalThis).LanguageModel = { sentinel: true };

    const { teardown } = setupChromeAIMock({ prompt: {} });
    expect(/** @type {any} */ (globalThis).LanguageModel.sentinel).toBeUndefined();

    teardown();
    expect(/** @type {any} */ (globalThis).LanguageModel.sentinel).toBe(true);

    delete (/** @type {any} */ (globalThis).LanguageModel);
  });

  it('integration: a component that calls globalThis.LanguageModel sees the mock', async () => {
    const { teardown } = setupChromeAIMock({
      prompt: { response: 'from the mock' },
    });
    const session = await /** @type {any} */ (globalThis).LanguageModel.create({});
    const out = await session.prompt('test');
    expect(out).toBe('from the mock');
    teardown();
  });
});
