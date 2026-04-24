import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speak, isSpeakAvailable } from '../src/speak.js';

/**
 * Install a fake SpeechSynthesis + SpeechSynthesisUtterance pair on globalThis
 * and return the constructed utterance so tests can drive its events.
 * @returns {{ getLastUtterance: () => any, synth: any }}
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
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      lastUtterance = this;
    }
  }
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
  };
  /** @type {any} */ (globalThis).speechSynthesis = synth;
  /** @type {any} */ (globalThis).SpeechSynthesisUtterance = FakeUtterance;
  return {
    getLastUtterance: () => lastUtterance,
    synth,
  };
}

describe('isSpeakAvailable()', () => {
  /** @type {{ speechSynthesis: any, SpeechSynthesisUtterance: any }} */
  const saved = { speechSynthesis: undefined, SpeechSynthesisUtterance: undefined };

  beforeEach(() => {
    saved.speechSynthesis = /** @type {any} */ (globalThis).speechSynthesis;
    saved.SpeechSynthesisUtterance = /** @type {any} */ (globalThis).SpeechSynthesisUtterance;
    delete (/** @type {any} */ (globalThis).speechSynthesis);
    delete (/** @type {any} */ (globalThis).SpeechSynthesisUtterance);
  });

  afterEach(() => {
    if (saved.speechSynthesis === undefined)
      delete (/** @type {any} */ (globalThis).speechSynthesis);
    else /** @type {any} */ (globalThis).speechSynthesis = saved.speechSynthesis;
    if (saved.SpeechSynthesisUtterance === undefined)
      delete (/** @type {any} */ (globalThis).SpeechSynthesisUtterance);
    else /** @type {any} */ (globalThis).SpeechSynthesisUtterance = saved.SpeechSynthesisUtterance;
  });

  it('returns false in a bare jsdom environment', () => {
    expect(isSpeakAvailable()).toBe(false);
  });

  it('returns true when both APIs are present', () => {
    installFakeSynthesis();
    expect(isSpeakAvailable()).toBe(true);
  });

  it('returns false when SpeechSynthesisUtterance is missing', () => {
    /** @type {any} */ (globalThis).speechSynthesis = { speak() {}, cancel() {} };
    expect(isSpeakAvailable()).toBe(false);
  });
});

describe('speak()', () => {
  beforeEach(() => {
    delete (/** @type {any} */ (globalThis).speechSynthesis);
    delete (/** @type {any} */ (globalThis).SpeechSynthesisUtterance);
  });

  afterEach(() => {
    delete (/** @type {any} */ (globalThis).speechSynthesis);
    delete (/** @type {any} */ (globalThis).SpeechSynthesisUtterance);
  });

  it('rejects when SpeechSynthesis is not available', async () => {
    await expect(speak('hello')).rejects.toThrow(/SpeechSynthesis not available/);
  });

  it('passes text, lang, rate, pitch and volume to the utterance', async () => {
    const { getLastUtterance, synth } = installFakeSynthesis();
    const p = speak('hola', { lang: 'es-ES', rate: 1.2, pitch: 0.8, volume: 0.5 });
    const utt = getLastUtterance();
    expect(utt.text).toBe('hola');
    expect(utt.lang).toBe('es-ES');
    expect(utt.rate).toBe(1.2);
    expect(utt.pitch).toBe(0.8);
    expect(utt.volume).toBe(0.5);
    expect(synth.speak).toHaveBeenCalledWith(utt);
    utt.onend?.();
    await p;
  });

  it('resolves when the utterance ends', async () => {
    const { getLastUtterance } = installFakeSynthesis();
    const p = speak('done');
    getLastUtterance().onend?.();
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects with a descriptive error on synthesis error', async () => {
    const { getLastUtterance } = installFakeSynthesis();
    const p = speak('oops');
    getLastUtterance().onerror?.({ error: 'audio-busy' });
    await expect(p).rejects.toThrow(/audio-busy/);
  });

  it('resolves silently when an already-aborted signal is passed', async () => {
    installFakeSynthesis();
    const ac = new AbortController();
    ac.abort();
    await expect(speak('x', { signal: ac.signal })).resolves.toBeUndefined();
  });

  it('calls speechSynthesis.cancel() and resolves when signal fires mid-speech', async () => {
    const { synth } = installFakeSynthesis();
    const ac = new AbortController();
    const p = speak('interrupting', { signal: ac.signal });
    ac.abort();
    await expect(p).resolves.toBeUndefined();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
