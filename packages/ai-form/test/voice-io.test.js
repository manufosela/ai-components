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
    it('is not rendered when the voice-input attribute is absent, even with AI present', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('', '<form><input name="a" ai-extract="a" /></form>');
      await ready(el);

      expect(shadow(el, 'button[data-action="chat-voice"]')).toBeNull();
    });

    it('is rendered but disabled when voice-input is set but SpeechRecognition is missing', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock({ speechIn: false });
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="a" ai-extract="a" /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="chat-voice"]');
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when voice-input + SpeechRecognition + aiReady are all true', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="a" ai-extract="a" /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="chat-voice"]');
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('dictation into the chat textarea', () => {
    it('writes the transcript into the chat textarea and uses continuous + interim results', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="nombre" ai-extract="nombre" /></form>');
      await ready(el);

      shadow(el, 'button[data-action="chat-voice"]').click();
      await el.updateComplete;

      const inst = speech.RecognitionCtor.instances.at(-1);
      // Chat dictation must not stop at the first pause.
      expect(inst.continuous).toBe(true);
      expect(inst.interimResults).toBe(true);

      inst.fireResult([{ transcript: 'Me llamo Manu' }]);
      inst.fireEnd();

      await waitFor(el, 'voice-transcript');
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;

      const textarea = shadow(el, '[part="chat-textarea"]');
      expect(textarea.value).toBe('Me llamo Manu');
    });

    it('toggles: a second click stops the ongoing session', async () => {
      const { teardown } = setupChromeAIMock({ prompt: { availability: 'available' } });
      cleanups.push(teardown);
      const speech = setupWebSpeechMock();
      cleanups.push(speech.teardown);

      const el = mount('voice-input', '<form><input name="x" ai-extract="x" /></form>');
      await ready(el);

      const btn = shadow(el, 'button[data-action="chat-voice"]');
      btn.click();
      await el.updateComplete;

      expect(el.listening).toBe(true);
      const inst = speech.RecognitionCtor.instances.at(-1);
      const abortsBefore = inst.abort.calls.length;

      shadow(el, 'button[data-action="chat-voice"]').click();
      inst.fireEnd();
      await waitFor(el, 'voice-end');
      expect(inst.abort.calls.length).toBeGreaterThan(abortsBefore);
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
      expect(el.speechOutAvailable).toBe(false);
    });
  });
});
