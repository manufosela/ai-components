import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listen, isListenAvailable } from '../src/listen.js';

/**
 * Build a fake SpeechRecognition constructor that the tests can drive manually.
 * The returned constructor exposes `.lastInstance` so tests can fire events.
 * @returns {any}
 */
function makeFakeRecognitionCtor() {
  class FakeRecognition {
    constructor() {
      /** @type {((e: any) => void) | null} */
      this.onresult = null;
      /** @type {((e: any) => void) | null} */
      this.onerror = null;
      /** @type {(() => void) | null} */
      this.onend = null;
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.startCalls = 0;
      this.abortCalls = 0;
      FakeRecognition.lastInstance = this;
    }
    start() {
      this.startCalls += 1;
    }
    abort() {
      this.abortCalls += 1;
    }
    stop() {}
  }
  /** @type {InstanceType<typeof FakeRecognition> | null} */
  FakeRecognition.lastInstance = null;
  return FakeRecognition;
}

/**
 * Build a SpeechRecognition-like result event.
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

describe('isListenAvailable()', () => {
  const saved = { SpeechRecognition: undefined, webkitSpeechRecognition: undefined };

  beforeEach(() => {
    saved.SpeechRecognition = /** @type {any} */ (globalThis).SpeechRecognition;
    saved.webkitSpeechRecognition = /** @type {any} */ (globalThis).webkitSpeechRecognition;
    delete (/** @type {any} */ (globalThis).SpeechRecognition);
    delete (/** @type {any} */ (globalThis).webkitSpeechRecognition);
  });

  afterEach(() => {
    if (saved.SpeechRecognition === undefined)
      delete (/** @type {any} */ (globalThis).SpeechRecognition);
    else /** @type {any} */ (globalThis).SpeechRecognition = saved.SpeechRecognition;
    if (saved.webkitSpeechRecognition === undefined)
      delete (/** @type {any} */ (globalThis).webkitSpeechRecognition);
    else /** @type {any} */ (globalThis).webkitSpeechRecognition = saved.webkitSpeechRecognition;
  });

  it('returns false in a bare jsdom environment', () => {
    expect(isListenAvailable()).toBe(false);
  });

  it('returns true when SpeechRecognition exists', () => {
    /** @type {any} */ (globalThis).SpeechRecognition = function () {};
    expect(isListenAvailable()).toBe(true);
  });

  it('returns true when only webkitSpeechRecognition exists', () => {
    /** @type {any} */ (globalThis).webkitSpeechRecognition = function () {};
    expect(isListenAvailable()).toBe(true);
  });
});

describe('listen()', () => {
  /** @type {any} */
  let Ctor;

  beforeEach(() => {
    Ctor = makeFakeRecognitionCtor();
    /** @type {any} */ (globalThis).SpeechRecognition = Ctor;
    delete (/** @type {any} */ (globalThis).webkitSpeechRecognition);
  });

  afterEach(() => {
    delete (/** @type {any} */ (globalThis).SpeechRecognition);
    delete (/** @type {any} */ (globalThis).webkitSpeechRecognition);
  });

  it('rejects when SpeechRecognition is not available', async () => {
    delete (/** @type {any} */ (globalThis).SpeechRecognition);
    await expect(listen()).rejects.toThrow(/SpeechRecognition not available/);
  });

  it('honors lang / continuous / interimResults on the recognition object', async () => {
    const p = listen({ lang: 'es-ES', continuous: true, interimResults: true });
    const inst = Ctor.lastInstance;
    expect(inst.lang).toBe('es-ES');
    expect(inst.continuous).toBe(true);
    expect(inst.interimResults).toBe(true);
    inst.onend?.();
    await p;
  });

  it('resolves with the accumulated final transcript when recognition ends', async () => {
    const p = listen();
    const inst = Ctor.lastInstance;
    inst.onresult?.(resultEvent([{ transcript: 'hello ' }, { transcript: 'world' }]));
    inst.onend?.();
    await expect(p).resolves.toBe('hello world');
  });

  it('ignores interim results in the returned transcript and forwards them via onInterim', async () => {
    const onInterim = vi.fn();
    const p = listen({ interimResults: true, onInterim });
    const inst = Ctor.lastInstance;
    inst.onresult?.(resultEvent([{ transcript: 'inter', isFinal: false }]));
    inst.onresult?.(resultEvent([{ transcript: 'final' }]));
    inst.onend?.();
    await expect(p).resolves.toBe('final');
    expect(onInterim).toHaveBeenCalledWith('inter');
  });

  it('rejects with a descriptive error when recognition fails', async () => {
    const p = listen();
    const inst = Ctor.lastInstance;
    inst.onerror?.({ error: 'no-speech' });
    await expect(p).rejects.toThrow(/no-speech/);
  });

  it('resolves empty when an already-aborted signal is passed', async () => {
    const ac = new AbortController();
    ac.abort();
    const p = listen({ signal: ac.signal });
    // No instance is needed because we short-circuit; but the ctor already ran.
    await expect(p).resolves.toBe('');
  });

  it('aborts recognition and resolves with what was captured when signal fires', async () => {
    const ac = new AbortController();
    const p = listen({ signal: ac.signal });
    const inst = Ctor.lastInstance;
    inst.onresult?.(resultEvent([{ transcript: 'partial ' }]));
    ac.abort();
    inst.onend?.(); // abort() in real APIs fires `end` afterwards.
    await expect(p).resolves.toBe('partial ');
    expect(inst.abortCalls).toBeGreaterThan(0);
  });

  it('does not throw when onInterim throws', async () => {
    const onInterim = vi.fn(() => {
      throw new Error('consumer bug');
    });
    const p = listen({ interimResults: true, onInterim });
    const inst = Ctor.lastInstance;
    inst.onresult?.(resultEvent([{ transcript: 'x', isFinal: false }]));
    inst.onend?.();
    await expect(p).resolves.toBe('');
  });
});
