import { describe, it, expect, afterEach, vi } from 'vitest';
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
 * @param {string} text
 * @returns {Promise<void>}
 */
async function send(el, text) {
  const ta = el.shadowRoot.querySelector('[part="chat-textarea"]');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await el.updateComplete;
  el.shadowRoot.querySelector('button[data-action="chat-send"]').click();
  // Wait for the async pipeline to settle (microtask yields + extraction).
  await new Promise((r) => setTimeout(r, 10));
  await el.updateComplete;
}

describe('<ai-form> hybrid pipeline (AIC-TSK-0019)', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  describe('heuristic pre-pass (no AI involvement)', () => {
    it('extracts a Spanish mobile from a noisy sentence WITHOUT calling the AI', async () => {
      const promptApiSpy = vi.fn(async () => '{}');
      /** @type {any} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: async () => ({ destroy: () => {}, prompt: promptApiSpy }),
      };
      cleanups.push(() => {
        delete (/** @type {any} */ (globalThis).LanguageModel);
      });

      const el = mount(
        '',
        `<form>
          <input name="tel" ai-extract="móvil" ai-format="mobileEs" required />
        </form>`,
      );
      await ready(el);

      await send(el, 'mi telefono es 639 01 89 87');

      // The mobile got written in canonical form.
      expect(el.querySelector('[name="tel"]').value).toBe('639018987');
      // The AI was NEVER invoked.
      expect(promptApiSpy).not.toHaveBeenCalled();
    });

    it('strips +34 country prefix when normalising', async () => {
      const promptApiSpy = vi.fn(async () => '{}');
      /** @type {any} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: async () => ({ destroy: () => {}, prompt: promptApiSpy }),
      };
      cleanups.push(() => {
        delete (/** @type {any} */ (globalThis).LanguageModel);
      });

      const el = mount(
        '',
        `<form>
          <input name="tel" ai-extract="móvil" ai-format="mobileEs" required />
        </form>`,
      );
      await ready(el);

      await send(el, '+34 639 01 89 87');

      expect(el.querySelector('[name="tel"]').value).toBe('639018987');
      expect(promptApiSpy).not.toHaveBeenCalled();
    });

    it('extracts an email and lowercases it WITHOUT the AI', async () => {
      const promptApiSpy = vi.fn(async () => '{}');
      /** @type {any} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: async () => ({ destroy: () => {}, prompt: promptApiSpy }),
      };
      cleanups.push(() => {
        delete (/** @type {any} */ (globalThis).LanguageModel);
      });

      const el = mount(
        '',
        `<form>
          <input name="email" ai-extract="email" ai-format="email" required />
        </form>`,
      );
      await ready(el);

      await send(el, 'mi correo es Manu@Example.IO');

      expect(el.querySelector('[name="email"]').value).toBe('manu@example.io');
      expect(promptApiSpy).not.toHaveBeenCalled();
    });
  });

  describe('NIF diagnostic pre-pass + confirmation state machine', () => {
    it('detects 8-digit NIF without letter, suggests the correct one and applies on "sí"', async () => {
      const promptApiSpy = vi.fn(async () => '{}');
      /** @type {any} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: async () => ({ destroy: () => {}, prompt: promptApiSpy }),
      };
      cleanups.push(() => {
        delete (/** @type {any} */ (globalThis).LanguageModel);
      });

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      // 1. User dictates DNI without letter.
      await send(el, 'mi DNI es 52117098 sin letra');

      // The pre-pass diagnostic fired, value not written, suggestion in
      // the assistant bubble. AI was NOT invoked.
      expect(el.querySelector('[name="dni"]').value).toBe('');
      expect(promptApiSpy).not.toHaveBeenCalled();
      const lastAssistant = Array.from(el.shadowRoot.querySelectorAll('.msg-assistant')).at(-1);
      expect(lastAssistant.textContent).toMatch(/52117098H/);

      // 2. User confirms.
      await send(el, 'sí');

      // Now the field IS written with the suggested value, AI still not invoked.
      expect(el.querySelector('[name="dni"]').value).toBe('52117098H');
      expect(promptApiSpy).not.toHaveBeenCalled();
    });

    it('drops the suggestion on "no" without writing', async () => {
      const promptApiSpy = vi.fn(async () => '{}');
      /** @type {any} */ (globalThis).LanguageModel = {
        availability: async () => 'available',
        create: async () => ({ destroy: () => {}, prompt: promptApiSpy }),
      };
      cleanups.push(() => {
        delete (/** @type {any} */ (globalThis).LanguageModel);
      });

      const el = mount(
        'language="es-ES"',
        `<form>
          <input name="dni" ai-extract="DNI" ai-format="nif" required />
        </form>`,
      );
      await ready(el);

      await send(el, '52117098');
      expect(el.querySelector('[name="dni"]').value).toBe('');

      await send(el, 'no');
      // Field is still empty; no AI call needed.
      expect(el.querySelector('[name="dni"]').value).toBe('');
      expect(promptApiSpy).not.toHaveBeenCalled();
    });
  });

  describe('AI fallback for natural-language messages', () => {
    it('still calls the AI when the pre-pass cannot satisfy a candidate', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ comentario: 'me gustó el producto' }),
        },
      });
      cleanups.push(teardown);

      const el = mount(
        '',
        `<form>
          <textarea name="comentario" ai-extract="comentario libre"></textarea>
        </form>`,
      );
      await ready(el);

      // Free-text comment can't be regex-matched; AI gets called.
      await send(el, 'me gustó mucho el producto, lo recomiendo');

      // The AI's extraction succeeded.
      expect(el.querySelector('[name="comentario"]').value).toBe('me gustó el producto');
    });
  });
});
