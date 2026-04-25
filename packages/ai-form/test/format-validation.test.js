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
 * @param {any} el @param {string} name @returns {Promise<CustomEvent>}
 * @param name
 */
function waitFor(el, name) {
  return /** @type {Promise<CustomEvent>} */ (
    new Promise((resolve) => el.addEventListener(name, resolve, { once: true }))
  );
}

/**
 * @param {any} el @param {string} text @returns {Promise<void>}
 * @param text
 */
async function send(el, text) {
  const ta = el.shadowRoot.querySelector('[part="chat-textarea"]');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await el.updateComplete;
  el.shadowRoot.querySelector('button[data-action="chat-send"]').click();
}

describe('<ai-form> ai-format deterministic validation', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  describe('post-extraction validation', () => {
    it('drops the value and emits ai-extraction-rejected when ai-format predicate fails', async () => {
      // The mocked AI returns "12345678A" for the DNI — that letter doesn't
      // match the official table (correct one is Z), so the deterministic
      // validator should reject it.
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ dni: '12345678A' }),
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
      await send(el, 'mi DNI es 12345678 letra A');
      const evt = await rejectedP;

      // Pre-pass matches the 8 digits and runs the diagnostic — value
      // is the digit-only form, suggestion (computed letter) goes into
      // the assistant bubble below.
      expect(evt.detail.fields).toEqual([{ name: 'dni', format: 'nif', value: '12345678' }]);
      // The value MUST NOT be written into the input.
      expect(el.querySelector('[name="dni"]').value).toBe('');

      // The assistant pushed a localized error bubble.
      await el.updateComplete;
      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      expect(lastAssistant.textContent).toMatch(/letra no encaja|letra/);
    });

    it('writes the value normally when the predicate passes', async () => {
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

    it('also accepts data-tovalidate as an alias for ai-format (drop-in compat with automatic_form_validation)', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ tel: '700000000' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="tel" ai-extract="móvil" data-tovalidate="movil" required />
        </form>`,
      );
      await ready(el);

      await send(el, 'mi móvil es 700 00 00 00');
      await waitFor(el, 'ai-field-extracted');
      await el.updateComplete;

      expect(el.querySelector('[name="tel"]').value).toBe('700000000');
    });

    it('rejects an invalid mobile number via the data-tovalidate alias', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ tel: '912345678' }), // landline starting with 9
        },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="tel" ai-extract="móvil" data-tovalidate="mobileEs" required />
        </form>`,
      );
      await ready(el);

      const rejectedP = waitFor(el, 'ai-extraction-rejected');
      await send(el, '912 34 56 78');
      const evt = await rejectedP;

      expect(evt.detail.fields[0].format).toBe('mobileEs');
      expect(el.querySelector('[name="tel"]').value).toBe('');
    });

    it('ignores unknown ai-format names (no crash) and writes the value normally', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ x: 'whatever' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="x" ai-extract="anything" ai-format="thisDoesNotExist" />
        </form>`,
      );
      await ready(el);

      await send(el, 'whatever');
      await waitFor(el, 'ai-field-extracted');
      await el.updateComplete;

      expect(el.querySelector('[name="x"]').value).toBe('whatever');
    });
  });

  describe('submit-time format gate', () => {
    it('blocks submit and sets customValidity when an ai-format value is invalid (final safety net for manual edits)', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: { availability: 'available' },
      });
      cleanups.push(teardown);

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" value="12345678A" />
        </form>`,
      );
      await ready(el);

      const form = el.querySelector('form');
      const dni = el.querySelector('[name="dni"]');

      const rejectedP = waitFor(el, 'ai-extraction-rejected');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const evt = await rejectedP;
      expect(evt.detail.stage).toBe('submit');
      expect(evt.detail.fields[0].format).toBe('nif');
      expect(dni.validationMessage).toMatch(/letra/);
    });

    it('lets submit proceed when every ai-format value is valid', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: { availability: 'available' },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" value="12345678Z" />
        </form>`,
      );
      await ready(el);

      const form = el.querySelector('form');
      // No ai-validate fields → format gate passes → semantic gate is empty
      // → handler returns without preventing default. We just assert no
      // ai-extraction-rejected event fires.
      let rejected = false;
      el.addEventListener('ai-extraction-rejected', () => {
        rejected = true;
      });

      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(rejected).toBe(false);
      expect(el.querySelector('[name="dni"]').validationMessage).toBe('');
    });
  });
});
