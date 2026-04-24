import { describe, it, expect, afterEach, vi } from 'vitest';
import { LitElement } from 'lit';
import { VoiceMixin } from '../src/voice-mixin.js';

let tagCounter = 0;

/**
 * Define a unique custom element that mixes VoiceMixin into LitElement,
 * register it, mount an instance, and return it.
 * @returns {HTMLElement}
 */
function mountVoiceElement() {
  const tag = `voice-el-test-${++tagCounter}`;
  class El extends VoiceMixin(LitElement) {
    render() {
      return null;
    }
  }
  customElements.define(tag, El);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

/**
 * Make a fake SpeechRecognition constructor that tests can drive.
 * @returns {any}
 */
function makeFakeRecognitionCtor() {
  class FakeRecognition {
    constructor() {
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.abortCalls = 0;
      FakeRecognition.lastInstance = this;
    }
    start() {}
    abort() {
      this.abortCalls += 1;
    }
    stop() {}
  }
  FakeRecognition.lastInstance = null;
  return FakeRecognition;
}

/**
 * @param {Array<{ transcript: string, isFinal?: boolean }>} items
 * @returns {{ results: any, resultIndex: number }}
 */
function resultEvent(items) {
  const results = items.map(({ transcript, isFinal }) => ({
    0: { transcript },
    isFinal: isFinal !== false,
  }));
  results.length = items.length;
  return { results, resultIndex: 0 };
}

/**
 * @returns {any}
 */
function installFakeSynthesis() {
  /** @type {any} */
  let lastUtterance = null;
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.onend = null;
      this.onerror = null;
      this.lang = '';
      lastUtterance = this;
    }
  }
  const synth = { speak: vi.fn(), cancel: vi.fn() };
  /** @type {any} */ (globalThis).speechSynthesis = synth;
  /** @type {any} */ (globalThis).SpeechSynthesisUtterance = FakeUtterance;
  return { getLastUtterance: () => lastUtterance, synth };
}

describe('VoiceMixin', () => {
  afterEach(() => {
    delete (/** @type {any} */ (globalThis).SpeechRecognition);
    delete (/** @type {any} */ (globalThis).webkitSpeechRecognition);
    delete (/** @type {any} */ (globalThis).speechSynthesis);
    delete (/** @type {any} */ (globalThis).SpeechSynthesisUtterance);
    document.body.innerHTML = '';
  });

  describe('capability reactive properties', () => {
    it('starts with listening=false / speaking=false', () => {
      const el = mountVoiceElement();
      expect(/** @type {any} */ (el).listening).toBe(false);
      expect(/** @type {any} */ (el).speaking).toBe(false);
    });

    it('reflects Web Speech availability after connectedCallback', () => {
      /** @type {any} */ (globalThis).SpeechRecognition = function () {};
      installFakeSynthesis();

      const el = mountVoiceElement();
      expect(/** @type {any} */ (el).speechInAvailable).toBe(true);
      expect(/** @type {any} */ (el).speechOutAvailable).toBe(true);
    });
  });

  describe('startSpeechInput()', () => {
    it('emits voice-unavailable and resolves undefined when API is missing', async () => {
      const el = mountVoiceElement();
      const evt = new Promise((resolve) =>
        el.addEventListener('voice-unavailable', resolve, { once: true }),
      );
      const result = await /** @type {any} */ (el).startSpeechInput();
      expect(result).toBeUndefined();
      const e = /** @type {CustomEvent} */ (await evt);
      expect(e.detail.api).toBe('speech-in');
    });

    it('sets listening=true while active, emits voice-transcript + voice-end on success', async () => {
      const Ctor = makeFakeRecognitionCtor();
      /** @type {any} */ (globalThis).SpeechRecognition = Ctor;

      const el = mountVoiceElement();

      /** @type {string[]} */
      const events = [];
      el.addEventListener('voice-transcript', (e) =>
        events.push(`transcript:${/** @type {CustomEvent} */ (e).detail.transcript}`),
      );
      el.addEventListener('voice-end', () => events.push('end'));

      const p = /** @type {any} */ (el).startSpeechInput({ lang: 'es-ES' });
      expect(/** @type {any} */ (el).listening).toBe(true);

      const inst = Ctor.lastInstance;
      inst.onresult?.(resultEvent([{ transcript: 'hola' }]));
      inst.onend?.();

      const out = await p;
      expect(out).toBe('hola');
      expect(/** @type {any} */ (el).listening).toBe(false);
      expect(events).toEqual(['transcript:hola', 'end']);
    });

    it('emits voice-error and rethrows when recognition fails', async () => {
      const Ctor = makeFakeRecognitionCtor();
      /** @type {any} */ (globalThis).SpeechRecognition = Ctor;
      const el = mountVoiceElement();

      /** @type {any} */
      let caught = null;
      el.addEventListener('voice-error', (e) => {
        caught = /** @type {CustomEvent} */ (e).detail;
      });

      const p = /** @type {any} */ (el).startSpeechInput();
      Ctor.lastInstance.onerror?.({ error: 'no-speech' });

      await expect(p).rejects.toThrow(/no-speech/);
      expect(caught.api).toBe('speech-in');
      expect(caught.error).toBeInstanceOf(Error);
      expect(/** @type {any} */ (el).listening).toBe(false);
    });
  });

  describe('stopSpeechInput()', () => {
    it('aborts an active recognition', async () => {
      const Ctor = makeFakeRecognitionCtor();
      /** @type {any} */ (globalThis).SpeechRecognition = Ctor;
      const el = mountVoiceElement();

      const p = /** @type {any} */ (el).startSpeechInput();
      /** @type {any} */ (el).stopSpeechInput();
      Ctor.lastInstance.onend?.();

      await p;
      expect(Ctor.lastInstance.abortCalls).toBeGreaterThan(0);
    });

    it('is a no-op when no session is active', () => {
      const el = mountVoiceElement();
      expect(() => /** @type {any} */ (el).stopSpeechInput()).not.toThrow();
    });
  });

  describe('speak()', () => {
    it('emits voice-unavailable and resolves when API is missing', async () => {
      const el = mountVoiceElement();
      const evt = new Promise((resolve) =>
        el.addEventListener('voice-unavailable', resolve, { once: true }),
      );
      await /** @type {any} */ (el).speak('hi');
      const e = /** @type {CustomEvent} */ (await evt);
      expect(e.detail.api).toBe('speech-out');
    });

    it('sets speaking=true while active, emits voice-start + voice-end on success', async () => {
      const { getLastUtterance } = installFakeSynthesis();
      const el = mountVoiceElement();

      /** @type {string[]} */
      const events = [];
      el.addEventListener('voice-start', () => events.push('start'));
      el.addEventListener('voice-end', () => events.push('end'));

      const p = /** @type {any} */ (el).speak('hola');
      expect(/** @type {any} */ (el).speaking).toBe(true);
      getLastUtterance().onend?.();
      await p;

      expect(/** @type {any} */ (el).speaking).toBe(false);
      expect(events).toEqual(['start', 'end']);
    });

    it('emits voice-error and rethrows when synthesis fails', async () => {
      const { getLastUtterance } = installFakeSynthesis();
      const el = mountVoiceElement();

      /** @type {any} */
      let caught = null;
      el.addEventListener('voice-error', (e) => {
        caught = /** @type {CustomEvent} */ (e).detail;
      });

      const p = /** @type {any} */ (el).speak('oops');
      getLastUtterance().onerror?.({ error: 'audio-busy' });
      await expect(p).rejects.toThrow(/audio-busy/);
      expect(caught.api).toBe('speech-out');
      expect(/** @type {any} */ (el).speaking).toBe(false);
    });
  });

  describe('disconnectedCallback', () => {
    it('aborts active listen and speak sessions when the element is removed', async () => {
      const Ctor = makeFakeRecognitionCtor();
      /** @type {any} */ (globalThis).SpeechRecognition = Ctor;
      const { synth } = installFakeSynthesis();

      const el = mountVoiceElement();
      /** @type {any} */ (el).startSpeechInput();
      /** @type {any} */ (el).speak('texto');
      // Remove before the fake events fire.
      el.remove();

      expect(Ctor.lastInstance.abortCalls).toBeGreaterThan(0);
      expect(synth.cancel).toHaveBeenCalled();
    });
  });

  describe('events bubble out of the shadow DOM', () => {
    it('voice-transcript is catchable on a parent host', async () => {
      const Ctor = makeFakeRecognitionCtor();
      /** @type {any} */ (globalThis).SpeechRecognition = Ctor;

      const tag = `voice-el-bubble-${++tagCounter}`;
      class El extends VoiceMixin(LitElement) {
        render() {
          return null;
        }
      }
      customElements.define(tag, El);

      const host = document.createElement('div');
      const el = document.createElement(tag);
      host.appendChild(el);
      document.body.appendChild(host);

      const p = /** @type {any} */ (el).startSpeechInput();

      const caught = new Promise((resolve) => {
        host.addEventListener('voice-transcript', resolve, { once: true });
      });

      Ctor.lastInstance.onresult?.(resultEvent([{ transcript: 'ok' }]));
      Ctor.lastInstance.onend?.();

      await p;
      const e = /** @type {CustomEvent} */ (await caught);
      expect(e.detail.transcript).toBe('ok');
    });
  });
});
