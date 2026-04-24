import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * @param {string} innerHTML
 * @returns {any}
 */
function mount(innerHTML) {
  const host = document.createElement('div');
  host.innerHTML = `<ai-form language="es-ES">${innerHTML}</ai-form>`;
  document.body.appendChild(host);
  return host.querySelector('ai-form');
}

/**
 * Submit the slotted form synchronously via an explicit submit event so we
 * can inspect `defaultPrevented` cleanly (jsdom's form.submit doesn't).
 * @param {any} el
 * @returns {Event}
 */
function submitForm(el) {
  const form = el.querySelector('form');
  const event = new Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

/**
 * @param {any} el
 * @returns {Promise<void>}
 */
async function ready(el) {
  await el.aiDetectionComplete;
  await el.updateComplete;
}

/**
 * @param {any} el
 * @param {string} eventName
 * @returns {Promise<CustomEvent>}
 */
function waitForEvent(el, eventName) {
  return /** @type {Promise<CustomEvent>} */ (
    new Promise((resolve) => {
      el.addEventListener(eventName, resolve, { once: true });
    })
  );
}

describe('<ai-form> semantic validation', () => {
  /** @type {(() => void) | null} */
  let teardown = null;

  afterEach(() => {
    teardown?.();
    teardown = null;
    document.body.innerHTML = '';
  });

  it('does nothing when the form has no ai-validate inputs (native submit proceeds)', async () => {
    ({ teardown } = setupChromeAIMock({ prompt: { availability: 'available' } }));
    const el = mount('<form><input name="x" /></form>');
    await ready(el);

    const event = submitForm(el);
    // No preventDefault call was made; we're asserting the component didn't touch it.
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not intercept when AI is not available (native HTML5 submit proceeds)', async () => {
    const el = mount(
      '<form><input name="mobile" ai-validate="spanish mobile number" value="123" /></form>',
    );
    await ready(el);

    const event = submitForm(el);
    // aiAvailable=false, so our handler returns without preventing.
    expect(event.defaultPrevented).toBe(false);
  });

  it('blocks the submit and marks the input invalid when AI says the rule fails', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({ ok: false, why: 'Phone must be 9 digits' }),
      },
    }));

    const el = mount(
      '<form><input name="mobile" ai-validate="spanish mobile number" value="abc" /></form>',
    );
    await ready(el);

    const event = submitForm(el);
    expect(event.defaultPrevented).toBe(true);

    const detail = (await waitForEvent(el, 'ai-validation-failed')).detail;
    expect(detail.results).toEqual([
      { name: 'mobile', valid: false, reason: 'Phone must be 9 digits' },
    ]);

    const input = el.querySelector('[name="mobile"]');
    expect(input.validationMessage).toBe('Phone must be 9 digits');
    expect(input.validity.customError).toBe(true);
  });

  it('emits ai-validation-passed and re-submits once when every rule is satisfied', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({ ok: true }),
      },
    }));

    const el = mount(
      '<form><input name="email" ai-validate="professional email" value="jane@example.com" /></form>',
    );
    await ready(el);

    // Catch the second (native) submit to confirm the bypass flag works.
    /** @type {Event[]} */
    const observed = [];
    el.querySelector('form').addEventListener('submit', (e) => observed.push(e));

    const first = submitForm(el);
    expect(first.defaultPrevented).toBe(true);

    await waitForEvent(el, 'ai-validation-passed');

    // The component re-dispatched submit with the bypass flag; that event should
    // go through without being intercepted (defaultPrevented=false on second).
    await new Promise((r) => setTimeout(r, 0));
    expect(observed.length).toBeGreaterThanOrEqual(2);
    const second = observed[observed.length - 1];
    expect(second.defaultPrevented).toBe(false);
  });

  it('validates multiple fields in parallel and reports them all', async () => {
    let callCount = 0;
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: (input) => {
          callCount += 1;
          // Tone check fails, mobile check passes.
          if (input.includes('professional tone')) {
            return JSON.stringify({ ok: false, why: 'Tone too casual' });
          }
          return JSON.stringify({ ok: true });
        },
      },
    }));

    const el = mount(`
      <form>
        <textarea name="desc" ai-validate="professional tone, max 200 words">lol whatever</textarea>
        <input name="mobile" ai-validate="spanish mobile number" value="666123456" />
      </form>
    `);
    await ready(el);

    submitForm(el);
    const detail = (await waitForEvent(el, 'ai-validation-failed')).detail;
    const byName = Object.fromEntries(detail.results.map((r) => [r.name, r]));
    expect(byName.desc.valid).toBe(false);
    expect(byName.desc.reason).toBe('Tone too casual');
    expect(byName.mobile.valid).toBe(true);
    expect(callCount).toBe(2);
  });

  it('short-circuits empty values (required is a native concern)', async () => {
    let called = false;
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: () => {
          called = true;
          return JSON.stringify({ ok: false, why: 'never mind' });
        },
      },
    }));

    const el = mount('<form><input name="name" ai-validate="full legal name" value="" /></form>');
    await ready(el);
    submitForm(el);

    await waitForEvent(el, 'ai-validation-passed');
    expect(called).toBe(false);
  });

  it('gives the user the benefit of the doubt when the AI reply is unparseable', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: 'who knows',
      },
    }));

    const el = mount('<form><input name="x" ai-validate="anything" value="something" /></form>');
    await ready(el);
    submitForm(el);

    await waitForEvent(el, 'ai-validation-passed');
  });

  it('emits ai-error when the Prompt API throws and does not leave aria-busy on the host', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: { availability: 'available', rejectCreate: true },
    }));

    const el = mount('<form><input name="x" ai-validate="anything" value="val" /></form>');
    await ready(el);
    submitForm(el);

    const detail = (await waitForEvent(el, 'ai-error')).detail;
    expect(detail.stage).toBe('semantic-validation');
    expect(detail.error).toBeInstanceOf(Error);
    // Allow the finally block to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(el.hasAttribute('aria-busy')).toBe(false);
  });

  it('emits ai-validation-start with the field names before calling the AI', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({ ok: true }),
      },
    }));

    const el = mount(`
      <form>
        <input name="a" ai-validate="rule" value="x" />
        <input name="b" ai-validate="rule" value="y" />
      </form>
    `);
    await ready(el);

    const start = waitForEvent(el, 'ai-validation-start');
    submitForm(el);
    const detail = (await start).detail;
    expect(detail.fields).toEqual(['a', 'b']);
  });

  it('sets aria-busy on the host during validation and clears it when done', async () => {
    ({ teardown } = setupChromeAIMock({
      prompt: {
        availability: 'available',
        response: JSON.stringify({ ok: true }),
      },
    }));

    const el = mount('<form><input name="x" ai-validate="rule" value="val" /></form>');
    await ready(el);
    submitForm(el);

    // Synchronously after submit, validation is in flight.
    await el.updateComplete;
    expect(el.getAttribute('aria-busy')).toBe('true');

    await waitForEvent(el, 'ai-validation-passed');
    await el.updateComplete;
    expect(el.hasAttribute('aria-busy')).toBe(false);
  });
});
