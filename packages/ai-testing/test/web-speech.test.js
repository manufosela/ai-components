import { describe, it, expect, afterEach } from 'vitest';
import {
  setupWebSpeechMock,
  createSpeechRecognitionMock,
  createSynthMock,
} from '../src/web-speech.js';

describe('createSpeechRecognitionMock()', () => {
  it('instances are tracked on the constructor', () => {
    const Ctor = createSpeechRecognitionMock();
    expect(Ctor.instances).toEqual([]);
    const _a = new Ctor();
    const _b = new Ctor();
    expect(Ctor.instances.length).toBe(2);
    expect(Ctor.instances).toEqual([_a, _b]);
  });

  it('fireResult dispatches onresult with the given transcripts', () => {
    const Ctor = createSpeechRecognitionMock();
    const inst = new Ctor();
    /** @type {any} */
    let received = null;
    inst.onresult = (e) => {
      received = e;
    };
    inst.fireResult([{ transcript: 'a' }, { transcript: 'b', isFinal: false }]);
    expect(received.results.length).toBe(2);
    expect(received.results[0][0].transcript).toBe('a');
    expect(received.results[0].isFinal).toBe(true);
    expect(received.results[1].isFinal).toBe(false);
  });

  it('fireError / fireEnd dispatch on their handlers', () => {
    const Ctor = createSpeechRecognitionMock();
    const inst = new Ctor();
    /** @type {any} */
    let err = null;
    let ended = false;
    inst.onerror = (e) => {
      err = e;
    };
    inst.onend = () => {
      ended = true;
    };
    inst.fireError('no-speech');
    expect(err.error).toBe('no-speech');
    inst.fireEnd();
    expect(ended).toBe(true);
  });

  it('start/abort/stop are spies with .calls', () => {
    const Ctor = createSpeechRecognitionMock();
    const inst = new Ctor();
    inst.start();
    inst.abort();
    expect(inst.start.calls.length).toBe(1);
    expect(inst.abort.calls.length).toBe(1);
  });
});

describe('createSynthMock()', () => {
  it('constructs utterances that are tracked on the ctor and can be driven', () => {
    const { synth, UtteranceCtor, drive } = createSynthMock();
    const utt = new UtteranceCtor('hello');
    expect(utt.text).toBe('hello');
    expect(UtteranceCtor.instances).toContain(utt);

    /** @type {boolean} */
    let ended = false;
    utt.onend = () => {
      ended = true;
    };
    synth.speak(utt);
    drive.finish();
    expect(ended).toBe(true);
    expect(synth.speak.calls.length).toBe(1);
  });

  it('drive.fail fires onerror with the given code (default synthesis-failed)', () => {
    const { UtteranceCtor, drive } = createSynthMock();
    const utt = new UtteranceCtor('x');
    /** @type {any} */
    let got = null;
    utt.onerror = (e) => {
      got = e;
    };
    drive.fail();
    expect(got.error).toBe('synthesis-failed');

    const utt2 = new UtteranceCtor('y');
    /** @type {any} */
    let got2 = null;
    utt2.onerror = (e) => {
      got2 = e;
    };
    drive.fail(utt2, 'audio-busy');
    expect(got2.error).toBe('audio-busy');
  });

  it('synth.cancel is a spy', () => {
    const { synth } = createSynthMock();
    synth.cancel();
    expect(synth.cancel.calls.length).toBe(1);
  });
});

describe('setupWebSpeechMock()', () => {
  const keys = [
    'SpeechRecognition',
    'webkitSpeechRecognition',
    'speechSynthesis',
    'SpeechSynthesisUtterance',
  ];

  afterEach(() => {
    for (const k of keys) delete (/** @type {any} */ (globalThis)[k]);
  });

  it('installs standard SpeechRecognition by default', () => {
    const { teardown } = setupWebSpeechMock();
    expect(/** @type {any} */ (globalThis).SpeechRecognition).toBeTypeOf('function');
    expect(/** @type {any} */ (globalThis).webkitSpeechRecognition).toBeUndefined();
    teardown();
    expect(/** @type {any} */ (globalThis).SpeechRecognition).toBeUndefined();
  });

  it('installs webkit variant when requested', () => {
    const { teardown } = setupWebSpeechMock({ recognitionVariant: 'webkit' });
    expect(/** @type {any} */ (globalThis).webkitSpeechRecognition).toBeTypeOf('function');
    expect(/** @type {any} */ (globalThis).SpeechRecognition).toBeUndefined();
    teardown();
  });

  it('skips speechIn when speechIn=false', () => {
    const { teardown } = setupWebSpeechMock({ speechIn: false });
    expect(/** @type {any} */ (globalThis).SpeechRecognition).toBeUndefined();
    expect(/** @type {any} */ (globalThis).speechSynthesis).toBeDefined();
    teardown();
  });

  it('skips speechOut when speechOut=false', () => {
    const { teardown } = setupWebSpeechMock({ speechOut: false });
    expect(/** @type {any} */ (globalThis).speechSynthesis).toBeUndefined();
    expect(/** @type {any} */ (globalThis).SpeechRecognition).toBeDefined();
    teardown();
  });

  it('teardown restores any pre-existing global', () => {
    /** @type {any} */ (globalThis).speechSynthesis = { sentinel: true };
    const { teardown } = setupWebSpeechMock();
    expect(/** @type {any} */ (globalThis).speechSynthesis.sentinel).toBeUndefined();
    teardown();
    expect(/** @type {any} */ (globalThis).speechSynthesis.sentinel).toBe(true);
    delete (/** @type {any} */ (globalThis).speechSynthesis);
  });

  it('integration: a consumer that uses SpeechRecognition sees the fake and can drive it', async () => {
    const { RecognitionCtor, teardown } = setupWebSpeechMock();

    // Simulate a consumer creating a recognition and listening.
    const inst = new /** @type {any} */ (globalThis).SpeechRecognition();
    /** @type {any} */
    let transcript = '';
    inst.onresult = (e) => {
      transcript = e.results[0][0].transcript;
    };
    // Drive via the last instance through the ctor.
    RecognitionCtor.instances.at(-1).fireResult([{ transcript: 'hola' }]);
    expect(transcript).toBe('hola');

    teardown();
  });
});
