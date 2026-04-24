import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * Mount an <ai-form> with the given inner markup and return it.
 * @param {string} [innerHTML]
 * @returns {any}
 */
function mountAIForm(innerHTML = defaultFormMarkup()) {
  const host = document.createElement('div');
  host.innerHTML = `<ai-form language="es-ES">${innerHTML}</ai-form>`;
  document.body.appendChild(host);
  return host.querySelector('ai-form');
}

function defaultFormMarkup() {
  return `
    <form>
      <input name="nombre" ai-extract="nombre completo" />
      <input name="telefono" ai-extract="número de móvil" />
      <input name="email" ai-extract="dirección de email" />
      <input name="notes" />
    </form>
  `;
}

/**
 * Wait for the element to finish its AI detection + first render.
 * @param {any} el
 * @returns {Promise<void>}
 */
async function ready(el) {
  await el.aiDetectionComplete;
  await el.updateComplete;
}

/**
 * Shortcut for shadowRoot.querySelector.
 * @param {any} el
 * @param {string} selector
 * @returns {any}
 */
function shadowQuery(el, selector) {
  return el.shadowRoot.querySelector(selector);
}

/**
 * Return the slotted <form> of the ai-form.
 * @param {any} el
 * @returns {any}
 */
function slottedForm(el) {
  return el.querySelector('form');
}

describe('<ai-form> paste-assist (fill-from-text)', () => {
  /** @type {(() => void) | null} */
  let teardown = null;

  beforeEach(() => {
    ({ teardown } = setupChromeAIMock({
      prompt: { availability: 'available' },
    }));
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    document.body.innerHTML = '';
  });

  it('enables the Paste & fill button when the Prompt API is available', async () => {
    const el = mountAIForm();
    await ready(el);
    const btn = shadowQuery(el, 'button[data-action="paste-assist"]');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  it('opens the paste textarea when the button is clicked, and emits ai-paste-assist-start', async () => {
    const el = mountAIForm();
    await ready(el);

    /** @type {Promise<Event>} */
    const startP = new Promise((resolve) =>
      el.addEventListener('ai-paste-assist-start', resolve, { once: true }),
    );

    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    expect(shadowQuery(el, 'textarea')).not.toBeNull();
    expect(shadowQuery(el, 'button[data-action="paste-apply"]')).not.toBeNull();
    await startP;
  });

  it('Cancel closes the textarea without filling anything', async () => {
    const el = mountAIForm();
    await ready(el);

    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    // Type something, then cancel.
    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'Soy Juan Pérez';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    shadowQuery(el, 'button[data-action="paste-cancel"]').click();
    await el.updateComplete;

    expect(shadowQuery(el, 'textarea')).toBeNull();
    expect(slottedForm(el).querySelector('[name="nombre"]').value).toBe('');
  });

  it('Apply is disabled until the user types something', async () => {
    const el = mountAIForm();
    await ready(el);

    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const apply = shadowQuery(el, 'button[data-action="paste-apply"]');
    expect(apply.disabled).toBe(true);

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'hola';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(shadowQuery(el, 'button[data-action="paste-apply"]').disabled).toBe(false);
  });

  it('fills matching inputs from a clean JSON response and emits ai-paste-assist-result', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({
          nombre: 'Juan Pérez',
          telefono: '666123456',
          email: 'juan@example.com',
        }),
      },
    }));

    const el = mountAIForm();
    await ready(el);

    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'Soy Juan Pérez, mi móvil es 666123456 y mi email juan@example.com';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    /** @type {Promise<CustomEvent>} */
    const resultP = new Promise((resolve) =>
      el.addEventListener('ai-paste-assist-result', resolve, { once: true }),
    );

    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    const event = /** @type {CustomEvent} */ (await resultP);
    await el.updateComplete;

    const form = slottedForm(el);
    expect(form.querySelector('[name="nombre"]').value).toBe('Juan Pérez');
    expect(form.querySelector('[name="telefono"]').value).toBe('666123456');
    expect(form.querySelector('[name="email"]').value).toBe('juan@example.com');
    // Input without ai-extract is untouched.
    expect(form.querySelector('[name="notes"]').value).toBe('');

    expect(event.detail.fields).toEqual([
      { name: 'nombre', value: 'Juan Pérez' },
      { name: 'telefono', value: '666123456' },
      { name: 'email', value: 'juan@example.com' },
    ]);

    // The panel auto-closes on success.
    expect(shadowQuery(el, 'textarea')).toBeNull();
  });

  it('accepts JSON wrapped in markdown fences', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: '```json\n{"nombre":"Ana"}\n```',
      },
    }));

    const el = mountAIForm();
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'me llamo Ana';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) =>
      el.addEventListener('ai-paste-assist-result', resolve, { once: true }),
    );
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    await p;

    expect(slottedForm(el).querySelector('[name="nombre"]').value).toBe('Ana');
  });

  it('accepts JSON embedded in surrounding prose', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: 'Sure, here you go: {"telefono":"123"} hope that helps.',
      },
    }));

    const el = mountAIForm();
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'mi tfno es 123';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) =>
      el.addEventListener('ai-paste-assist-result', resolve, { once: true }),
    );
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    await p;

    expect(slottedForm(el).querySelector('[name="telefono"]').value).toBe('123');
  });

  it('emits ai-no-match when the response is valid JSON but empty', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: { availability: 'available', response: '{}' },
    }));

    const el = mountAIForm();
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'texto sin datos interesantes';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) => el.addEventListener('ai-no-match', resolve, { once: true }));
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    const event = /** @type {CustomEvent} */ (await p);
    expect(event.detail.reason).toBe('empty-extraction');
  });

  it('emits ai-no-match when the response is unparseable garbage', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: { availability: 'available', response: 'no idea what you want' },
    }));

    const el = mountAIForm();
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'x';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) => el.addEventListener('ai-no-match', resolve, { once: true }));
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    await p;
  });

  it('emits ai-no-match when the form has no ai-extract inputs', async () => {
    const el = mountAIForm('<form><input name="plain" /></form>');
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'anything';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) => el.addEventListener('ai-no-match', resolve, { once: true }));
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    const event = /** @type {CustomEvent} */ (await p);
    expect(event.detail.reason).toBe('no-extractable-inputs');
  });

  it('emits ai-error when the Prompt API throws', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: { availability: 'available', rejectCreate: true },
    }));

    const el = mountAIForm();
    await ready(el);
    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;

    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'hola';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) => el.addEventListener('ai-error', resolve, { once: true }));
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    const event = /** @type {CustomEvent} */ (await p);
    expect(event.detail.stage).toBe('paste-assist');
    expect(event.detail.error).toBeInstanceOf(Error);
  });

  it('triggers input + change events on filled inputs (so external validators re-run)', async () => {
    teardown?.();
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({ nombre: 'Luna' }),
      },
    }));

    const el = mountAIForm();
    await ready(el);

    const nombreInput = slottedForm(el).querySelector('[name="nombre"]');
    /** @type {string[]} */
    const seen = [];
    nombreInput.addEventListener('input', () => seen.push('input'));
    nombreInput.addEventListener('change', () => seen.push('change'));

    shadowQuery(el, 'button[data-action="paste-assist"]').click();
    await el.updateComplete;
    const textarea = shadowQuery(el, 'textarea');
    textarea.value = 'Luna';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    const p = new Promise((resolve) =>
      el.addEventListener('ai-paste-assist-result', resolve, { once: true }),
    );
    shadowQuery(el, 'button[data-action="paste-apply"]').click();
    await p;

    expect(seen).toEqual(['input', 'change']);
  });
});
