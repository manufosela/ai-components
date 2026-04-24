import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * @param {string} [attrs]
 * @param {string} [innerHTML]
 * @returns {any}
 */
function mount(attrs = '', innerHTML = '<form><input name="x" /></form>') {
  const host = document.createElement('div');
  host.innerHTML = `<ai-form ${attrs}>${innerHTML}</ai-form>`;
  document.body.appendChild(host);
  return host.querySelector('ai-form');
}

/** @param {any} el @returns {Promise<void>} */
async function ready(el) {
  await el.aiDetectionComplete;
  await el.updateComplete;
}

describe('<ai-form> AI lifecycle UX', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  it('shows a "not supported" banner in the fallback path once detection resolves', async () => {
    const el = mount();
    await ready(el);
    const status = el.shadowRoot.querySelector('.ai-status[data-state="unsupported"]');
    expect(status).not.toBeNull();
    expect(status.textContent).toMatch(/not available/i);
    expect(el.shadowRoot.querySelector('.ai-chat')).toBeNull();
  });

  it('renders the "download" banner when Prompt is downloadable, disables chat Check button', async () => {
    const { teardown } = setupChromeAIMock({
      prompt: { availability: 'downloadable' },
    });
    cleanups.push(teardown);

    const el = mount();
    await ready(el);

    const banner = el.shadowRoot.querySelector('.ai-status[data-state="downloadable"]');
    expect(banner).not.toBeNull();

    const enable = el.shadowRoot.querySelector('button[data-action="enable-ai"]');
    expect(enable).not.toBeNull();

    // Chat UI is rendered but textarea and Check are disabled until the model is downloaded.
    const textarea = el.shadowRoot.querySelector('[part="chat-textarea"]');
    expect(textarea).not.toBeNull();
    expect(textarea.disabled).toBe(true);
    const check = el.shadowRoot.querySelector('button[data-action="chat-check"]');
    expect(check.disabled).toBe(true);
  });

  it('clicking Enable AI calls ensureAIReady and updates the UI to "available"', async () => {
    // Custom fake that transitions from downloadable → available after create().
    let availability = 'downloadable';
    /** @type {Record<string, unknown>} */ (globalThis).LanguageModel = {
      availability: async () => availability,
      /** @param {any} options */
      create: async (options) => {
        const fakeMonitor = {
          /**
           * @param {string} type @param {(ev: any) => void} fn
           * @param fn
           */
          addEventListener(type, fn) {
            if (type === 'downloadprogress') {
              for (const loaded of [0.3, 0.7, 1]) fn({ loaded, total: 1 });
            }
          },
        };
        options?.monitor?.(fakeMonitor);
        availability = 'available';
        return { destroy: () => {} };
      },
    };
    cleanups.push(() => {
      delete (/** @type {any} */ (globalThis).LanguageModel);
    });

    const el = mount();
    await ready(el);

    // Track progress events.
    /** @type {number[]} */
    const progress = [];
    el.addEventListener('ai-download-progress', (e) =>
      progress.push(/** @type {CustomEvent} */ (e).detail.loaded),
    );

    const completeP = new Promise((resolve) =>
      el.addEventListener('ai-download-complete', resolve, { once: true }),
    );

    el.shadowRoot.querySelector('button[data-action="enable-ai"]').click();
    await completeP;
    await el.updateComplete;

    expect(progress).toEqual([0.3, 0.7, 1]);
    expect(el.aiReady).toBe(true);
    expect(el.shadowRoot.querySelector('.ai-status[data-state="downloadable"]')).toBeNull();
    // Once the model is available, the chat textarea becomes enabled.
    const textarea = el.shadowRoot.querySelector('[part="chat-textarea"]');
    expect(textarea.disabled).toBe(false);
  });

  it('renders the "downloading" banner with a progress bar when state is "downloading"', async () => {
    const { teardown } = setupChromeAIMock({
      prompt: { availability: 'downloading' },
    });
    cleanups.push(teardown);

    const el = mount();
    await ready(el);

    const banner = el.shadowRoot.querySelector('.ai-status[data-state="downloading"]');
    expect(banner).not.toBeNull();
    expect(banner.querySelector('progress')).not.toBeNull();
    expect(banner.textContent).toMatch(/Downloading/);
  });

  it('hides the banner when Prompt is "available"', async () => {
    const { teardown } = setupChromeAIMock({
      prompt: { availability: 'available' },
    });
    cleanups.push(teardown);

    const el = mount();
    await ready(el);
    expect(el.shadowRoot.querySelector('.ai-status')).toBeNull();
    expect(el.shadowRoot.querySelector('.ai-chat')).not.toBeNull();
  });
});
