import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * Mount an `<ai-form>` with a slotted `<form>` in the document.
 * @param {string} [attrs]
 * @param {string} [innerHTML]
 * @returns {any}
 */
function mount(attrs = '', innerHTML = '<form><input name="x" ai-extract="x" /></form>') {
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

/**
 * @param {any} el
 * @param {string} name
 * @returns {Promise<CustomEvent>}
 */
function waitFor(el, name) {
  return /** @type {Promise<CustomEvent>} */ (
    new Promise((resolve) => el.addEventListener(name, resolve, { once: true }))
  );
}

/**
 * @param {any} el
 * @param {string} text
 * @returns {Promise<void>}
 */
async function sendChatMessage(el, text) {
  const textarea = el.shadowRoot.querySelector('[part="chat-textarea"]');
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await el.updateComplete;
  el.shadowRoot.querySelector('button[data-action="chat-send"]').click();
}

describe('<ai-form> conversational mode', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  describe('initial assistant message', () => {
    it('lists all required AI-candidates in the first assistant bubble (English default)', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="nombre" ai-extract="name" required />
          <input name="tel" ai-extract="phone" required />
          <textarea name="about" ai-extract="comment"></textarea>
        </form>`,
      );
      await ready(el);

      const bubbles = el.shadowRoot.querySelectorAll('.msg-assistant');
      expect(bubbles.length).toBe(1);
      const text = bubbles[0].textContent.trim();
      expect(text).toMatch(/name/);
      expect(text).toMatch(/phone/);
      expect(text).toMatch(/optionally/i);
      expect(text).toMatch(/comment/);
    });

    it('localizes the first message when language is Spanish', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="tel" ai-extract="teléfono" required />
        </form>`,
      );
      await ready(el);

      const text = el.shadowRoot.querySelector('.msg-assistant').textContent.trim();
      expect(text).toMatch(/¿me dices/i);
      expect(text).toMatch(/teléfono/);
    });

    it('includes a reminder for required MANUAL (non-ai) fields when they are empty', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="tel" ai-extract="teléfono" required />
          <label for="cv">Adjuntar CV</label>
          <input id="cv" name="cv" type="file" required />
          <label for="tos">Acepto los términos</label>
          <input id="tos" name="tos" type="checkbox" required />
        </form>`,
      );
      await ready(el);

      const text = el.shadowRoot.querySelector('.msg-assistant').textContent.trim();
      expect(text).toMatch(/teléfono/);
      expect(text).toMatch(/Adjuntar CV/);
      expect(text).toMatch(/Acepto los términos/);
    });

    it('emits ai-conversation-update with pending AI and manual field names', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="tel" ai-extract="phone" required />
          <input name="cv" type="file" required />
        </form>`,
      );
      const evtP = waitFor(el, 'ai-conversation-update');
      await ready(el);
      const evt = await evtP;
      expect(evt.detail.pendingAIFields).toContain('tel');
      expect(evt.detail.pendingManualFields).toContain('cv');
      expect(typeof evt.detail.prompt).toBe('string');
    });
  });

  describe('extraction flow', () => {
    it('user message appears in the chat and matching AI-candidates are filled', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ nombre: 'Manu', tel: '+34 600 000 000' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="nombre" ai-extract="nombre completo" required />
          <input name="tel" ai-extract="móvil" required />
        </form>`,
      );
      await ready(el);

      await sendChatMessage(el, 'Hola soy Manu y mi número es +34 600 000 000');
      await waitFor(el, 'ai-field-extracted');
      await el.updateComplete;

      // User bubble is present in the log.
      const userBubbles = el.shadowRoot.querySelectorAll('.msg-user');
      expect(userBubbles.length).toBe(1);
      expect(userBubbles[0].textContent).toMatch(/Manu/);

      // Slotted inputs are filled live.
      expect(el.querySelector('[name="nombre"]').value).toBe('Manu');
      expect(el.querySelector('[name="tel"]').value).toBe('+34 600 000 000');
    });

    it('shows the Submit button only when the slotted form is fully valid', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ tel: '600' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="tel" ai-extract="phone" required />
          <input name="tos" type="checkbox" required />
        </form>`,
      );
      await ready(el);
      expect(el.shadowRoot.querySelector('button[data-action="chat-submit"]')).toBeNull();

      // Fill the AI field via extraction → still missing the manual tos → no Submit yet.
      await sendChatMessage(el, '600');
      await waitFor(el, 'ai-field-extracted');
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('button[data-action="chat-submit"]')).toBeNull();

      // Tick the TOS checkbox — now all required fields are satisfied.
      const tos = /** @type {HTMLInputElement} */ (el.querySelector('[name="tos"]'));
      tos.checked = true;
      tos.dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;

      expect(el.shadowRoot.querySelector('button[data-action="chat-submit"]')).not.toBeNull();
    });

    it('emits ai-no-match + assistant message when the form has no ai-extract inputs', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount('', '<form><input name="plain" /></form>');
      await ready(el);

      const noMatchP = waitFor(el, 'ai-no-match');
      await sendChatMessage(el, 'hola');
      const evt = await noMatchP;
      expect(evt.detail.reason).toBe('no-extractable-inputs');

      await el.updateComplete;
      const bubbles = el.shadowRoot.querySelectorAll('.msg-assistant');
      // The seed message + the no-match assistant reply.
      expect(bubbles.length).toBeGreaterThanOrEqual(2);
    });

    it('clears stale setCustomValidity when the user edits an input', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);

      const el = mount('', '<form><input name="x" ai-extract="x" required /></form>');
      await ready(el);

      const input = /** @type {HTMLInputElement} */ (el.querySelector('[name="x"]'));
      input.setCustomValidity('Dummy failure');
      expect(input.validationMessage).toBe('Dummy failure');

      input.value = 'new value';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await el.updateComplete;

      expect(input.validationMessage).toBe('');
    });
  });

  describe('chat UI gating by availability state', () => {
    it('disables textarea and Send while state is downloadable', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'downloadable' } });
      cleanups.push(teardown);

      const el = mount('', '<form><input name="x" ai-extract="x" /></form>');
      await ready(el);

      expect(el.shadowRoot.querySelector('[part="chat-textarea"]').disabled).toBe(true);
      expect(el.shadowRoot.querySelector('button[data-action="chat-send"]').disabled).toBe(true);
      expect(el.shadowRoot.querySelector('.ai-status[data-state="downloadable"]')).not.toBeNull();
    });

    it('renders the classic form when AI is unavailable (fallback path)', async () => {
      const el = mount('', '<form><input name="x" ai-extract="x" required /></form>');
      await ready(el);

      expect(el.aiAvailable).toBe(false);
      expect(el.shadowRoot.querySelector('.ai-chat')).toBeNull();
      expect(el.querySelector('[name="x"]')).not.toBeNull();
    });
  });
});
