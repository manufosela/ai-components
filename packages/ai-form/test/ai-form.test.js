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

  it('renders the fallback slot only (no chat UI) when AI is unavailable', async () => {
    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ai-chat')).toBeNull();
    const slot = el.shadowRoot.querySelector('slot');
    expect(slot).not.toBeNull();
    const assigned = /** @type {HTMLSlotElement} */ (slot).assignedElements();
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned[0].tagName.toLowerCase()).toBe('form');
  });

  it('renders the AI chat UI (messages + input bar) when AI is available', async () => {
    ({ teardown: teardownMock } = setupChromeAIMock({
      prompt: { availability: 'available', response: 'mock' },
    }));

    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;

    const chat = el.shadowRoot.querySelector('.ai-chat');
    expect(chat).not.toBeNull();
    expect(chat.getAttribute('role')).toBe('group');

    // Message log is an aria-live region that starts with the initial
    // assistant message.
    const log = chat.querySelector('.ai-chat-log');
    expect(log).not.toBeNull();
    expect(log.getAttribute('role')).toBe('log');
    const bubbles = log.querySelectorAll('.msg-assistant');
    expect(bubbles.length).toBeGreaterThan(0);

    // Input bar with textarea + send button.
    const textarea = chat.querySelector('textarea');
    expect(textarea).not.toBeNull();
    const send = chat.querySelector('button[data-action="chat-send"]');
    expect(send).not.toBeNull();

    // Mic button is NOT rendered when the voice-input attribute is absent.
    const mic = chat.querySelector('button[data-action="chat-voice"]');
    expect(mic).toBeNull();

    const errors = el.shadowRoot.querySelector('.ai-form-errors');
    expect(errors).not.toBeNull();

    // The slotted form still renders, inside the secondary form section.
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

  it('exposes shadow parts "chat", "chat-log", "chat-textarea", "send", "form-section", "errors" for consumer theming', async () => {
    ({ teardown: teardownMock } = setupChromeAIMock({
      prompt: { availability: 'available' },
    }));

    const el = mountAIForm();
    await el.aiDetectionComplete;
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('[part="chat"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[part="chat-log"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[part="chat-textarea"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[part="send"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[part="form-section"]')).not.toBeNull();
    expect(el.shadowRoot.querySelector('[part="errors"]')).not.toBeNull();
  });
});
