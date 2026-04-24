import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html } from 'lit';
import { AIElement } from '../src/ai-element.js';

let tagCounter = 0;

/**
 * Define a unique custom element subclass of AIElement for each test so tests
 * don't collide on the customElements registry.
 * @param {object} [overrides]
 * @param {() => unknown} [overrides.renderAI]
 * @param {() => unknown} [overrides.renderFallback]
 * @returns {string} the registered tag name
 */
function defineAISubclass(overrides = {}) {
  const tag = `ai-element-test-${++tagCounter}`;
  class TestEl extends AIElement {
    renderAI() {
      return overrides.renderAI ? overrides.renderAI() : html`<span>ai</span>`;
    }
    renderFallback() {
      return overrides.renderFallback ? overrides.renderFallback() : html`<span>fallback</span>`;
    }
  }
  customElements.define(tag, TestEl);
  return tag;
}

/**
 * Mount a custom element into the document and return it.
 * @param {string} tag
 * @returns {HTMLElement}
 */
function mount(tag) {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

describe('AIElement', () => {
  /** @type {string[]} */
  const globalKeys = ['LanguageModel', 'Writer', 'Summarizer', 'Translator'];
  /** @type {Record<string, unknown>} */
  const saved = {};

  beforeEach(() => {
    for (const k of globalKeys) {
      saved[k] = /** @type {Record<string, unknown>} */ (globalThis)[k];
    }
  });

  afterEach(() => {
    for (const k of globalKeys) {
      if (saved[k] === undefined) {
        delete (/** @type {Record<string, unknown>} */ (globalThis)[k]);
      } else {
        /** @type {Record<string, unknown>} */ (globalThis)[k] = saved[k];
      }
    }
    document.body.innerHTML = '';
  });

  it('starts with aiAvailable=false and aiCapabilities=null before detection', () => {
    const tag = defineAISubclass();
    const el = /** @type {AIElement} */ (document.createElement(tag));
    expect(el.aiAvailable).toBe(false);
    expect(el.aiCapabilities).toBeNull();
  });

  it('fires ai-unavailable and stays in fallback when no AI APIs are present', async () => {
    const tag = defineAISubclass();
    const el = /** @type {AIElement} */ (mount(tag));

    /** @type {string | null} */
    let firedEvent = null;
    el.addEventListener('ai-ready', () => (firedEvent = 'ai-ready'));
    el.addEventListener('ai-unavailable', () => (firedEvent = 'ai-unavailable'));

    await el.aiDetectionComplete;
    await el.updateComplete;

    expect(firedEvent).toBe('ai-unavailable');
    expect(el.aiAvailable).toBe(false);
    expect(el.aiCapabilities).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('fallback');
  });

  it('fires ai-ready and renders the AI UI when an AI API is available', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      availability: async () => 'available',
    };

    const tag = defineAISubclass();
    const el = /** @type {AIElement} */ (mount(tag));

    /** @type {string | null} */
    let firedEvent = null;
    el.addEventListener('ai-ready', () => (firedEvent = 'ai-ready'));
    el.addEventListener('ai-unavailable', () => (firedEvent = 'ai-unavailable'));

    await el.aiDetectionComplete;
    await el.updateComplete;

    expect(firedEvent).toBe('ai-ready');
    expect(el.aiAvailable).toBe(true);
    expect(el.shadowRoot?.textContent).toContain('ai');
    expect(el.shadowRoot?.textContent).not.toContain('fallback');
  });

  it('treats "downloadable" state as available for rendering purposes', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).Summarizer = {
      availability: async () => 'downloadable',
    };

    const tag = defineAISubclass();
    const el = /** @type {AIElement} */ (mount(tag));

    await el.aiDetectionComplete;
    expect(el.aiAvailable).toBe(true);
    expect(el.aiCapabilities?.summarizer).toBe('downloadable');
  });

  it('includes the capabilities object in the event detail', async () => {
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      availability: async () => 'available',
    };

    const tag = defineAISubclass();
    const el = /** @type {AIElement} */ (mount(tag));

    const evt = await new Promise((resolve) => {
      el.addEventListener('ai-ready', resolve, { once: true });
    });
    expect(/** @type {CustomEvent} */ (evt).detail.capabilities.prompt).toBe('available');
  });

  it('bubbles and composes the lifecycle event so ancestors receive it', async () => {
    const tag = defineAISubclass();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const el = /** @type {AIElement} */ (document.createElement(tag));
    host.appendChild(el);

    const caught = await new Promise((resolve) => {
      host.addEventListener('ai-unavailable', resolve, { once: true });
    });
    expect(caught).toBeTruthy();
  });

  it('render() falls back to undefined subclasses safely (no unhandled error)', async () => {
    const tag = `ai-element-bare-${++tagCounter}`;
    class Bare extends AIElement {}
    customElements.define(tag, Bare);
    const el = /** @type {AIElement} */ (mount(tag));
    await el.aiDetectionComplete;
    await el.updateComplete;
    // No exception means success; shadowRoot should be empty.
    expect(el.shadowRoot?.textContent ?? '').toBe('');
  });

  describe('aiReady vs aiAvailable', () => {
    it('aiAvailable=true but aiReady=false when API is only "downloadable"', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'downloadable',
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;
      expect(el.aiAvailable).toBe(true);
      expect(el.aiReady).toBe(false);
    });

    it('aiReady=true only when at least one API is "available"', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;
      expect(el.aiReady).toBe(true);
    });
  });

  describe('ensureAIReady()', () => {
    it('short-circuits when the requested API is already "available"', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: () => {
          throw new Error('should not be called');
        },
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;
      const caps = await /** @type {any} */ (el).ensureAIReady();
      expect(caps.prompt).toBe('available');
      expect(/** @type {any} */ (el).aiDownloading).toBe(false);
    });

    it('triggers create({monitor}) when the API is "downloadable" and emits progress events', async () => {
      /** @type {((ev: any) => void)[]} */
      const progressListeners = [];
      const fakeMonitor = {
        /**
         * @param {string} type @param {(ev: any) => void} fn
         * @param fn
         */
        addEventListener(type, fn) {
          if (type === 'downloadprogress') progressListeners.push(fn);
        },
      };
      let availability = 'downloadable';
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => availability,
        /** @param {any} options */
        create: async (options) => {
          options?.monitor?.(fakeMonitor);
          for (const loaded of [0.25, 0.5, 1]) {
            for (const fn of progressListeners) fn({ loaded, total: 1 });
          }
          availability = 'available';
          return { destroy: () => {} };
        },
      };

      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;

      /** @type {number[]} */
      const seen = [];
      /** @type {string[]} */
      const events = [];
      el.addEventListener('ai-download-start', () => events.push('start'));
      el.addEventListener('ai-download-progress', (e) =>
        seen.push(/** @type {CustomEvent} */ (e).detail.loaded),
      );
      el.addEventListener('ai-download-complete', () => events.push('complete'));

      const caps = await /** @type {any} */ (el).ensureAIReady();
      expect(caps.prompt).toBe('available');
      expect(seen).toEqual([0.25, 0.5, 1]);
      expect(events).toEqual(['start', 'complete']);
      expect(/** @type {any} */ (el).aiReady).toBe(true);
      expect(/** @type {any} */ (el).aiDownloading).toBe(false);
    });

    it('throws when no requested API is downloadable and fires ai-download-error when create fails', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'unavailable',
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;
      await expect(/** @type {any} */ (el).ensureAIReady()).rejects.toThrow(
        /no Chrome AI API is downloadable/,
      );
    });

    it('fires ai-download-error and rethrows when create() fails mid-download', async () => {
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'downloadable',
        create: async () => {
          throw new Error('download failed');
        },
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;

      /** @type {any} */
      let errPayload = null;
      el.addEventListener('ai-download-error', (e) => {
        errPayload = /** @type {CustomEvent} */ (e).detail;
      });
      await expect(/** @type {any} */ (el).ensureAIReady()).rejects.toThrow(/download failed/);
      expect(errPayload.api).toBe('prompt');
      expect(errPayload.error).toBeInstanceOf(Error);
      expect(/** @type {any} */ (el).aiDownloading).toBe(false);
    });

    it('deduplicates concurrent calls (same in-flight promise)', async () => {
      let createCalls = 0;
      /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
        availability: async () => 'downloadable',
        create: async () => {
          createCalls += 1;
          /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
            availability: async () => 'available',
          };
          return { destroy: () => {} };
        },
      };
      const tag = defineAISubclass();
      const el = /** @type {AIElement} */ (mount(tag));
      await el.aiDetectionComplete;

      const p1 = /** @type {any} */ (el).ensureAIReady();
      const p2 = /** @type {any} */ (el).ensureAIReady();
      expect(p1).toBe(p2);
      await p1;
      expect(createCalls).toBe(1);
    });
  });
});
