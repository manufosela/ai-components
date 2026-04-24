import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * Mount an <ai-form> with an inner <form> into the document and return it.
 * @param {string} [attrs] Raw attribute markup (e.g. 'language="es-ES"').
 * @param {string} [innerHTML] Inner markup of the <ai-form>.
 * @returns {any}
 */
function mountAIForm(attrs = '', innerHTML = '<form><input name="x" /></form>') {
  const host = document.createElement('div');
  host.innerHTML = `<ai-form ${attrs}>${innerHTML}</ai-form>`;
  document.body.appendChild(host);
  return host.querySelector('ai-form');
}

describe('<ai-form> (skeleton)', () => {
  /** @type {(() => void) | null} */
  let teardownMock = null;

  afterEach(() => {
    if (teardownMock) {
      teardownMock();
      teardownMock = null;
    }
    document.body.innerHTML = '';
  });

  it('is registered under the tag "ai-form"', () => {
    expect(customElements.get('ai-form')).toBeDefined();
  });

  it('inherits AIElement reactive state', async () => {
    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;
    expect(el.aiAvailable).toBe(false);
    expect(el.aiCapabilities).not.toBeNull();
  });

  it('reflects the language attribute (default en-US)', async () => {
    const el = mountAIForm();
    await el.updateComplete;
    expect(el.language).toBe('en-US');
  });

  it('takes language from the attribute and reflects it back', async () => {
    const el = mountAIForm('language="es-ES"');
    await el.updateComplete;
    expect(el.language).toBe('es-ES');
    expect(el.getAttribute('language')).toBe('es-ES');
  });

  it('renders the fallback slot only (no toolbar) when AI is unavailable', async () => {
    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ai-toolbar')).toBeNull();
    const slot = el.shadowRoot.querySelector('slot');
    expect(slot).not.toBeNull();
    const assigned = /** @type {HTMLSlotElement} */ (slot).assignedElements();
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned[0].tagName.toLowerCase()).toBe('form');
  });

  it('renders the AI toolbar and error container when AI is available', async () => {
    ({ teardown: teardownMock } = setupChromeAIMock({
      prompt: { availability: 'available', response: 'mock' },
    }));

    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;

    const toolbar = el.shadowRoot.querySelector('.ai-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar.getAttribute('role')).toBe('toolbar');

    const buttons = toolbar.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    // Skeleton: placeholders are disabled.
    for (const b of buttons) expect(b.disabled).toBe(true);

    const errors = el.shadowRoot.querySelector('.ai-form-errors');
    expect(errors).not.toBeNull();
    expect(errors.getAttribute('aria-live')).toBe('polite');

    // The slotted form still renders.
    const slot = el.shadowRoot.querySelector('slot');
    const assigned = /** @type {HTMLSlotElement} */ (slot).assignedElements();
    expect(assigned[0].tagName.toLowerCase()).toBe('form');
  });

  it('fires ai-unavailable when AI is not present', async () => {
    const el = mountAIForm();

    const evt = /** @type {CustomEvent} */ (
      await new Promise((resolve) => {
        el.addEventListener('ai-unavailable', resolve, { once: true });
      })
    );
    expect(evt.detail.capabilities).toBeDefined();
    expect(evt.detail.capabilities.prompt).toBe('unavailable');
  });

  it('fires ai-ready when at least one AI API is installed', async () => {
    ({ teardown: teardownMock } = setupChromeAIMock({
      prompt: { availability: 'available' },
    }));

    const el = mountAIForm();
    const evt = /** @type {CustomEvent} */ (
      await new Promise((resolve) => {
        el.addEventListener('ai-ready', resolve, { once: true });
      })
    );
    expect(evt.detail.capabilities.prompt).toBe('available');
  });

  it('exposes shadow parts "toolbar" and "errors" for consumer theming', async () => {
    ({ teardown: teardownMock } = setupChromeAIMock({
      prompt: { availability: 'available' },
    }));

    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;

    const toolbar = el.shadowRoot.querySelector('[part="toolbar"]');
    const errors = el.shadowRoot.querySelector('[part="errors"]');
    expect(toolbar).not.toBeNull();
    expect(errors).not.toBeNull();
  });
});
