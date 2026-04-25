import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * @param {string} [attrs]
 * @param {string} [innerHTML]
 * @returns {any}
 */
function mount(attrs = '', innerHTML = '') {
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
async function send(el, text) {
  const ta = el.shadowRoot.querySelector('[part="chat-textarea"]');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await el.updateComplete;
  el.shadowRoot.querySelector('button[data-action="chat-send"]').click();
}

describe('<ai-form> AIC-TSK-0018: diagnostic + intent + history', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  describe('diagnostic NIF / NIE messages', () => {
    it('rejects a NIF without control letter and SUGGESTS the computed letter', async () => {
      // 52117098 → control letter is 'H' (52117098 % 23 = 18 → TRWAGMYFPDXBNJZSQVHLCKE[18] = 'H')
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ dni: '52117098' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      const rejectedP = waitFor(el, 'ai-extraction-rejected');
      await send(el, 'mi DNI es 52117098 sin letra');
      await rejectedP;
      await el.updateComplete;

      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      expect(lastAssistant.textContent).toMatch(/falta la letra/);
      expect(lastAssistant.textContent).toMatch(/52117098H/);
      expect(el.querySelector('[name="dni"]').value).toBe('');
    });

    it('rejects a NIF with the wrong letter and SUGGESTS the correct one', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ dni: '52117098A' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      await send(el, '52117098A');
      await waitFor(el, 'ai-extraction-rejected');
      await el.updateComplete;

      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      expect(lastAssistant.textContent).toMatch(/no coincide/);
      expect(lastAssistant.textContent).toMatch(/52117098H/);
    });

    it('falls back to a generic message for non-DNI/NIE format failures', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ tel: '912345678' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="tel" ai-extract="móvil" ai-format="mobileEs" required />
        </form>`,
      );
      await ready(el);

      await send(el, '912 34 56 78');
      await waitFor(el, 'ai-extraction-rejected');
      await el.updateComplete;

      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      // No diagnostic for mobileEs; generic message kicks in.
      expect(lastAssistant.textContent).toMatch(/móvil/i);
    });
  });

  describe('intent detection', () => {
    it('renders __answer as a chat bubble and skips extraction when __intent is "help"', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({
            __intent: 'help',
            __answer: 'Claro, dime los 8 dígitos del DNI y te calculo la letra.',
          }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      const helpP = waitFor(el, 'ai-conversation-help');
      await send(el, '¿me puedes calcular la letra del DNI?');
      const evt = await helpP;
      await el.updateComplete;

      expect(evt.detail.intent).toBe('help');
      expect(evt.detail.answer).toMatch(/8 dígitos/);

      // The answer is shown as the last assistant bubble.
      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      expect(lastAssistant.textContent).toMatch(/8 dígitos/);

      // The form was not touched.
      expect(el.querySelector('[name="dni"]').value).toBe('');
    });

    it('extraction proceeds normally when no __intent is present', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ dni: '12345678Z' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      await send(el, '12345678Z');
      await waitFor(el, 'ai-field-extracted');
      await el.updateComplete;

      expect(el.querySelector('[name="dni"]').value).toBe('12345678Z');
    });
  });

  describe('multi-turn conversation history', () => {
    it('passes the last historyTurns messages to the extraction prompt', async () => {
      /** @type {string[]} */
      const promptsSeen = [];
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: (input) => {
            promptsSeen.push(input);
            return JSON.stringify({});
          },
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES" history-turns="4"',
        `<form>
          <input name="dni" ai-extract="DNI" required />
        </form>`,
      );
      await ready(el);

      // Inject some prior turns directly into the message log.
      el._messages = [
        { role: 'assistant', text: 'Hola, ¿cuál es tu DNI?' },
        { role: 'user', text: '52117098' },
        { role: 'assistant', text: 'Te falta la letra. ¿Cuál es?' },
      ];

      await send(el, 'la letra es L');
      await new Promise((r) => setTimeout(r, 0));

      expect(promptsSeen.length).toBe(1);
      const built = promptsSeen[0];
      // History section appears with the prior turns.
      expect(built).toMatch(/Recent conversation:/);
      expect(built).toMatch(/assistant: Hola, ¿cuál es tu DNI\?/);
      expect(built).toMatch(/user: 52117098/);
      // Current user message is in the User message section, not in the
      // history block (so it isn't repeated).
      expect(built.match(/user: la letra es L/g) ?? []).toHaveLength(0);
      // The "Behaviour" intent block is in the prompt header.
      expect(built).toMatch(/intent "extract"/);
      expect(built).toMatch(/intent "help"/);
    });

    it('omits the history section when historyTurns=0', async () => {
      /** @type {string[]} */
      const promptsSeen = [];
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: (input) => {
            promptsSeen.push(input);
            return JSON.stringify({});
          },
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'history-turns="0"',
        `<form>
          <input name="x" ai-extract="anything" />
        </form>`,
      );
      await ready(el);

      el._messages = [
        { role: 'assistant', text: 'first' },
        { role: 'user', text: 'second' },
      ];

      await send(el, 'third');
      await new Promise((r) => setTimeout(r, 0));

      expect(promptsSeen.length).toBe(1);
      expect(promptsSeen[0]).not.toMatch(/Recent conversation:/);
    });
  });
});
