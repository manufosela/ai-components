import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prompt, summarize, write, translate } from '../src/helpers.js';

/**
 * Install a fake Chrome AI API on globalThis for the duration of a single test.
 * @param {string} apiName - LanguageModel | Summarizer | Writer | Translator
 * @param {string} sessionMethod - prompt | summarize | write | translate
 * @param {unknown} result - What the session method resolves with.
 * @returns {{ createSpy: ReturnType<typeof vi.fn>, methodSpy: ReturnType<typeof vi.fn>, destroySpy: ReturnType<typeof vi.fn> }}
 */
function installFakeApi(apiName, sessionMethod, result) {
  const destroySpy = vi.fn();
  const methodSpy = vi.fn(async () => result);
  const session = { destroy: destroySpy, [sessionMethod]: methodSpy };
  const createSpy = vi.fn(async () => session);
  /** @type {Record<string, unknown>} */ (globalThis)[apiName] = { create: createSpy };
  return { createSpy, methodSpy, destroySpy };
}

describe('ai-core helpers', () => {
  /** @type {string[]} */
  const apis = ['LanguageModel', 'Summarizer', 'Writer', 'Translator'];
  /** @type {Record<string, unknown>} */
  const saved = {};

  beforeEach(() => {
    for (const k of apis) {
      saved[k] = /** @type {Record<string, unknown>} */ (globalThis)[k];
      delete (/** @type {Record<string, unknown>} */ (globalThis)[k]);
    }
  });

  afterEach(() => {
    for (const k of apis) {
      if (saved[k] === undefined) {
        delete (/** @type {Record<string, unknown>} */ (globalThis)[k]);
      } else {
        /** @type {Record<string, unknown>} */ (globalThis)[k] = saved[k];
      }
    }
  });

  describe('prompt()', () => {
    it('throws a standardized error when LanguageModel global is missing', async () => {
      await expect(prompt('hi')).rejects.toThrow(/Chrome LanguageModel API not available/);
    });

    it('throws when LanguageModel exists but has no create() factory', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {};
      await expect(prompt('hi')).rejects.toThrow(/Chrome LanguageModel API not available/);
    });

    it('accepts class/constructor-shaped LanguageModel (typeof === "function") — regression for AIC-BUG-0002', async () => {
      // Chrome exposes LanguageModel as a CLASS, not a plain object; `requireApi`
      // used to bail with `typeof !== 'object'` and every call failed with
      // "Chrome LanguageModel API not available" even when the API was usable.
      const promptSpy = vi.fn(async () => 'mocked');
      const destroySpy = vi.fn();
      class FakeLanguageModel {
        static async create() {
          return { prompt: promptSpy, destroy: destroySpy };
        }
      }
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = FakeLanguageModel;

      await expect(prompt('hi')).resolves.toBe('mocked');
      expect(promptSpy).toHaveBeenCalledWith('hi');
      expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('creates a session with the given options, calls prompt(input) and destroys the session', async () => {
      const { createSpy, methodSpy, destroySpy } = installFakeApi(
        'LanguageModel',
        'prompt',
        'Hi there',
      );

      const opts = { systemPrompt: 'Be helpful' };
      const out = await prompt('Hello', opts);

      expect(out).toBe('Hi there');
      expect(createSpy).toHaveBeenCalledWith(opts);
      expect(methodSpy).toHaveBeenCalledWith('Hello');
      expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('still destroys the session if the method throws', async () => {
      const destroySpy = vi.fn();
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        create: async () => ({
          destroy: destroySpy,
          prompt: async () => {
            throw new Error('model boom');
          },
        }),
      };

      await expect(prompt('oops')).rejects.toThrow(/model boom/);
      expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('does not fail if the session has no destroy method', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        create: async () => ({ prompt: async () => 'ok' }),
      };
      await expect(prompt('x')).resolves.toBe('ok');
    });
  });

  describe('summarize()', () => {
    it('throws when Summarizer is missing', async () => {
      await expect(summarize('text')).rejects.toThrow(/Chrome Summarizer API not available/);
    });

    it('calls Summarizer.create + session.summarize and destroys', async () => {
      const { createSpy, methodSpy, destroySpy } = installFakeApi(
        'Summarizer',
        'summarize',
        'short',
      );
      const out = await summarize('long text', { type: 'tldr' });
      expect(out).toBe('short');
      expect(createSpy).toHaveBeenCalledWith({ type: 'tldr' });
      expect(methodSpy).toHaveBeenCalledWith('long text');
      expect(destroySpy).toHaveBeenCalledOnce();
    });
  });

  describe('write()', () => {
    it('throws when Writer is missing', async () => {
      await expect(write('brief')).rejects.toThrow(/Chrome Writer API not available/);
    });

    it('calls Writer.create + session.write and destroys', async () => {
      const { createSpy, methodSpy, destroySpy } = installFakeApi(
        'Writer',
        'write',
        'generated text',
      );
      const out = await write('brief', { tone: 'formal' });
      expect(out).toBe('generated text');
      expect(createSpy).toHaveBeenCalledWith({ tone: 'formal' });
      expect(methodSpy).toHaveBeenCalledWith('brief');
      expect(destroySpy).toHaveBeenCalledOnce();
    });
  });

  describe('translate()', () => {
    it('throws when Translator is missing', async () => {
      await expect(translate('hola')).rejects.toThrow(/Chrome Translator API not available/);
    });

    it('calls Translator.create + session.translate and destroys', async () => {
      const { createSpy, methodSpy, destroySpy } = installFakeApi(
        'Translator',
        'translate',
        'hello',
      );
      const out = await translate('hola', { sourceLanguage: 'es', targetLanguage: 'en' });
      expect(out).toBe('hello');
      expect(createSpy).toHaveBeenCalledWith({ sourceLanguage: 'es', targetLanguage: 'en' });
      expect(methodSpy).toHaveBeenCalledWith('hola');
      expect(destroySpy).toHaveBeenCalledOnce();
    });
  });

  it('does not leak errors from destroy() out of the helper', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      create: async () => ({
        destroy: () => {
          throw new Error('destroy boom');
        },
        prompt: async () => 'ok',
      }),
    };

    await expect(prompt('x')).resolves.toBe('ok');
  });
});
