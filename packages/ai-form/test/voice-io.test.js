import { describe, it, expect, afterEach } from 'vitest';
import { setupChromeAIMock, setupWebSpeechMock } from '@manufosela/ai-testing';
import '../src/index.js';

/**
 * Mount an <ai-form> into the document.
 * @param {string} [attrs]
 * @param {string} [innerHTML]
 * @returns {any}
 */
function mount(attrs = '', innerHTML = '<form><input name="x" /></form>') {
  const host = document.createElement('div');
  host.innerHTML = `<ai-form language="es-ES" ${attrs}>${innerHTML}</ai-form>`;
  document.body.appendChild(host);
  return host.querySelector('ai-form');
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
 * @param {string} sel
 * @returns {any}
 */
function shadow(el, sel) {
  return el.shadowRoot.querySelector(sel);
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

describe('<ai-form> voice I/O', () => {
  /** @type {Array<() => void>} */
  const cleanups = [];

  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = '';
  });

  describe('mic button gating', () => {
    it('is disabled when the voice-input attribute is absent, even with AI present', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('', '<form><input name="a" ai-voice /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="voice-input"]');
      expect(btn.disabled).toBe(true);
    });

    it('is disabled when voice-input is set but SpeechRecognition is missing', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock({ speechIn: false });
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="a" ai-voice /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="voice-input"]');
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when voice-input + SpeechRecognition are both available', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="a" ai-voice /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="voice-input"]');
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('dictation', () => {
    it('fills the currently focused [ai-voice] input with the transcript', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount(
        'voice-input',
        '<form><input name="nombre" ai-voice /><input name="ciudad" ai-voice /></form>',
      );
      await ready(el);

      const ciudad = /** @type {HTMLInputElement} */ (el.querySelector('[name="ciudad"]'));
      ciudad.focus();

      /** @type {string[]} */
      const events = [];
      ciudad.addEventListener('input', () => events.push('input'));
      ciudad.addEventListener('change', () => events.push('change'));

      shadow(el, 'button[data-action="voice-input"]').click();
      await el.updateComplete;

      // Drive the fake SpeechRecognition through the last created instance.
      const inst = speech.RecognitionCtor.instances.at(-1);
      inst.fireResult([{ transcript: 'Madrid' }]);
      inst.fireEnd();

      await waitFor(el, 'voice-transcript');
      // Wait one tick so the writeback in _toggleVoiceInput lands.
      await new Promise((r) => setTimeout(r, 0));

      expect(ciudad.value).toBe('Madrid');
      expect(events).toEqual(['input', 'change']);
    });

    it('falls back to the first [ai-voice] input when nothing is focused', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount(
        'voice-input',
        '<form><input name="first" ai-voice /><input name="second" ai-voice /></form>',
      );
      await ready(el);

      // Make sure nothing is focused.
      /** @type {HTMLElement} */ (document.activeElement)?.blur?.();

      shadow(el, 'button[data-action="voice-input"]').click();
      await el.updateComplete;

      const inst = speech.RecognitionCtor.instances.at(-1);
      inst.fireResult([{ transcript: 'hola' }]);
      inst.fireEnd();

      await waitFor(el, 'voice-transcript');
      // Wait one tick so the writeback in _toggleVoiceInput lands.
      await new Promise((r) => setTimeout(r, 0));
      expect(el.querySelector('[name="first"]').value).toBe('hola');
      expect(el.querySelector('[name="second"]').value).toBe('');
    });

    it('ignores focused inputs without ai-voice', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount(
        'voice-input',
        '<form><input name="plain" /><input name="voice-only" ai-voice /></form>',
      );
      await ready(el);
      /** @type {HTMLInputElement} */ (el.querySelector('[name="plain"]')).focus();

      shadow(el, 'button[data-action="voice-input"]').click();
      await el.updateComplete;

      const inst = speech.RecognitionCtor.instances.at(-1);
      inst.fireResult([{ transcript: 'ignored' }]);
      inst.fireEnd();

      await waitFor(el, 'voice-transcript');
      // Wait one tick so the writeback in _toggleVoiceInput lands.
      await new Promise((r) => setTimeout(r, 0));
      expect(el.querySelector('[name="plain"]').value).toBe('');
      expect(el.querySelector('[name="voice-only"]').value).toBe('ignored');
    });

    it('toggles: a second click stops the ongoing session', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="x" ai-voice /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="voice-input"]');
      btn.click();
      await el.updateComplete;

      expect(el.listening).toBe(true);
      const inst = speech.RecognitionCtor.instances.at(-1);
      const abortsBefore = inst.abort.calls.length;

      // Second click stops.
      shadow(el, 'button[data-action="voice-input"]').click();
      // abort() is invoked via AbortController in VoiceMixin.
      inst.fireEnd();
      await waitFor(el, 'voice-end');
      expect(inst.abort.calls.length).toBeGreaterThan(abortsBefore);
    });

    it('does nothing if the form has no [ai-voice] input and nothing is focused', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="plain" /></form>');
      await ready(el);

      shadow(el, 'button[data-action="voice-input"]').click();
      await el.updateComplete;

      const inst = speech.RecognitionCtor.instances.at(-1);
      inst.fireResult([{ transcript: 'never lands' }]);
      inst.fireEnd();

      await waitFor(el, 'voice-transcript');
      // Wait one tick so the writeback in _toggleVoiceInput lands.
      await new Promise((r) => setTimeout(r, 0));
      expect(el.querySelector('[name="plain"]').value).toBe('');
    });
  });

  describe('voice-output on validation errors', () => {
    it('speaks concatenated reasons when voice-output is set and validation fails', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: (input) =>
            input.includes('long')
              ? JSON.stringify({ ok: false, why: 'Too long' })
              : JSON.stringify({ ok: false, why: 'Wrong format' }),
        },
      });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount(
        'voice-output',
        `<form>
          <input name="a" ai-validate="not too long" value="x" />
          <input name="b" ai-validate="a specific format" value="y" />
        </form>`,
      );
      await ready(el);

      const form = el.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await waitFor(el, 'ai-validation-failed');
      // Let the speak call register.
      await new Promise((r) => setTimeout(r, 0));

      expect(speech.synth.speak.calls.length).toBe(1);
      const utt = speech.UtteranceCtor.instances.at(-1);
      expect(utt.text).toMatch(/Too long/);
      expect(utt.text).toMatch(/Wrong format/);
      expect(utt.lang).toBe('es-ES');
    });

    it('does not speak when voice-output is absent', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ ok: false, why: 'Nope' }),
        },
      });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('', '<form><input name="a" ai-validate="rule" value="x" /></form>');
      await ready(el);

      el.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );

      await waitFor(el, 'ai-validation-failed');
      await new Promise((r) => setTimeout(r, 0));
      expect(speech.synth.speak.calls.length).toBe(0);
    });

    it('does not speak when SpeechSynthesis is unavailable, even with voice-output', async () => {
      const { teardown } = setupChromeAIMock({
        prompt: {
          availability: 'available',
          response: JSON.stringify({ ok: false, why: 'Nope' }),
        },
      });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock({ speechOut: false });
      cleanups.push(speech.teardown);

      const el = mount(
        'voice-output',
        '<form><input name="a" ai-validate="rule" value="x" /></form>',
      );
      await ready(el);

      el.querySelector('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await waitFor(el, 'ai-validation-failed');
      // synth.speak doesn't exist; no crash is the assertion.
      expect(el.speechOutAvailable).toBe(false);
    });
  });
});
