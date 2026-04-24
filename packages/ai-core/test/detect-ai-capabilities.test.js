import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectAICapabilities } from '../src/detect-ai-capabilities.js';

/**
 * Restore any globals we tampered with between tests.
 * @param {string[]} keys
 */
function withCleanGlobals(keys) {
  /** @type {Record<string, unknown>} */
  const saved = {};
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = /** @type {Record<string, unknown>} */ (globalThis)[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) {
        delete (/** @type {Record<string, unknown>} */ (globalThis)[k]);
      } else {
        /** @type {Record<string, unknown>} */ (globalThis)[k] = saved[k];
      }
    }
  });
}

describe('detectAICapabilities()', () => {
  withCleanGlobals([
    'LanguageModel',
    'Writer',
    'Summarizer',
    'Translator',
    'SpeechRecognition',
    'webkitSpeechRecognition',
    'speechSynthesis',
  ]);

  it('reports all APIs as unavailable in a bare jsdom environment', async () => {
    // jsdom does not implement Chrome AI APIs or Web Speech APIs.
    // Strip anything a previous test left behind just in case.
    delete (/** @type {Record<string, unknown>} */ (globalThis).LanguageModel);
    delete (/** @type {Record<string, unknown>} */ (globalThis).Writer);
    delete (/** @type {Record<string, unknown>} */ (globalThis).Summarizer);
    delete (/** @type {Record<string, unknown>} */ (globalThis).Translator);
    delete (/** @type {Record<string, unknown>} */ (globalThis).SpeechRecognition);
    delete (/** @type {Record<string, unknown>} */ (globalThis).webkitSpeechRecognition);
    delete (/** @type {Record<string, unknown>} */ (globalThis).speechSynthesis);

    const caps = await detectAICapabilities();

    expect(caps).toEqual({
      prompt: 'unavailable',
      writer: 'unavailable',
      summarizer: 'unavailable',
      translator: 'unavailable',
      speechIn: false,
      speechOut: false,
    });
  });

  it('reports an AI API as available when availability() resolves "available"', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      availability: async () => 'available',
    };

    const caps = await detectAICapabilities();
    expect(caps.prompt).toBe('available');
  });

  it('normalizes legacy "readily" to "available"', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).Writer = {
      availability: async () => 'readily',
    };

    const caps = await detectAICapabilities();
    expect(caps.writer).toBe('available');
  });

  it('normalizes "downloadable", "downloading" and legacy "after-download" to "downloadable"', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).Summarizer = {
      availability: async () => 'downloadable',
    };
    /** @type {Record<string, unknown>} */ (globalThis).Translator = {
      availability: async () => 'after-download',
    };

    const caps = await detectAICapabilities();
    expect(caps.summarizer).toBe('downloadable');
    expect(caps.translator).toBe('downloadable');
  });

  it('falls back to "unavailable" when availability() throws', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      availability: async () => {
        throw new Error('boom');
      },
    };

    const caps = await detectAICapabilities();
    expect(caps.prompt).toBe('unavailable');
  });

  it('detects SpeechRecognition (standard)', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).SpeechRecognition = function () {};

    const caps = await detectAICapabilities();
    expect(caps.speechIn).toBe(true);
  });

  it('detects webkitSpeechRecognition (vendor prefix)', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).webkitSpeechRecognition = function () {};

    const caps = await detectAICapabilities();
    expect(caps.speechIn).toBe(true);
  });

  it('detects speechSynthesis', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).speechSynthesis = {
      speak() {},
    };

    const caps = await detectAICapabilities();
    expect(caps.speechOut).toBe(true);
  });

  it('never throws, even if a global is a weird value', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = null;
    /** @type {Record<string, unknown>} */ (globalThis).Writer = 42;
    /** @type {Record<string, unknown>} */ (globalThis).Summarizer = 'no';
    /** @type {Record<string, unknown>} */ (globalThis).Translator = {
      availability: 'not a function',
    };

    const caps = await detectAICapabilities();
    expect(caps.prompt).toBe('unavailable');
    expect(caps.writer).toBe('unavailable');
    expect(caps.summarizer).toBe('unavailable');
    expect(caps.translator).toBe('unavailable');
  });
});
