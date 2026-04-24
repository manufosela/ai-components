import { spy } from './_spy.js';

/**
 * Build a fake SpeechRecognition constructor. Each instance exposes helpers
 * to drive the recognition lifecycle from tests:
 *
 * - `fireResult(items)`  dispatches `onresult` with the given transcripts.
 *                         Items are `{ transcript, isFinal? }`. Default `isFinal: true`.
 * - `fireError(code)`    dispatches `onerror` with `{ error: code }`.
 * - `fireEnd()`          dispatches `onend`.
 *
 * The returned constructor has a static `.instances` array so tests can find
 * the last-created instance without a global lookup: `Ctor.instances.at(-1)`.
 * @returns {any}
 */
export function createSpeechRecognitionMock() {
  /** @type {any[]} */
  const instances = [];

  class FakeRecognition {
    constructor() {
      /** @type {((ev: any) => void) | null} */
      this.onresult = null;
      /** @type {((ev: any) => void) | null} */
      this.onerror = null;
      /** @type {(() => void) | null} */
      this.onend = null;
      /** @type {(() => void) | null} */
      this.onstart = null;
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.start = spy();
      this.abort = spy();
      this.stop = spy();
      instances.push(this);
    }

    /**
     * @param {Array<{ transcript: string, isFinal?: boolean }>} items
     */
    fireResult(items) {
      const results = items.map(({ transcript, isFinal }) => ({
        0: { transcript },
        isFinal: isFinal !== false,
      }));
      results.length = items.length;
      this.onresult?.({ results, resultIndex: 0 });
    }

    /**
     * @param {string} code
     */
    fireError(code) {
      this.onerror?.({ error: code });
    }

    fireEnd() {
      this.onend?.();
    }
  }

  /** @type {any} */ (FakeRecognition).instances = instances;
  return FakeRecognition;
}

/**
 * Build a fake `speechSynthesis` + `SpeechSynthesisUtterance` pair.
 *
 * - `synth.speak` and `synth.cancel` are tracked spies.
 * - `UtteranceCtor` is the fake utterance class; it captures all constructed
 *   instances in `UtteranceCtor.instances`.
 * - `drive.finish(utterance?)` fires `onend` on the given utterance (or the
 *   last one); `drive.fail(utterance?, code?)` fires `onerror` with
 *   `{ error: code }` (defaults to `'synthesis-failed'`).
 * @returns {{
 *   synth: { speak: any, cancel: any },
 *   UtteranceCtor: any,
 *   drive: {
 *     finish: (utterance?: any) => void,
 *     fail: (utterance?: any, code?: string) => void,
 *   },
 * }}
 */
export function createSynthMock() {
  /** @type {any[]} */
  const instances = [];

  class FakeUtterance {
    /** @param {string} text */
    constructor(text) {
      this.text = text;
      /** @type {(() => void) | null} */
      this.onend = null;
      /** @type {((ev: any) => void) | null} */
      this.onerror = null;
      /** @type {(() => void) | null} */
      this.onstart = null;
      /** @type {string} */
      this.lang = '';
      /** @type {number} */
      this.rate = 1;
      /** @type {number} */
      this.pitch = 1;
      /** @type {number} */
      this.volume = 1;
      /** @type {any} */
      this.voice = null;
      instances.push(this);
    }
  }
  /** @type {any} */ (FakeUtterance).instances = instances;

  const synth = {
    speak: spy(),
    cancel: spy(),
  };

  const last = () => instances[instances.length - 1];

  const drive = {
    /**
     * @param {any} [utterance]
     */
    finish(utterance) {
      (utterance ?? last())?.onend?.();
    },
    /**
     * @param {any} [utterance]
     * @param {string} [code]
     */
    fail(utterance, code = 'synthesis-failed') {
      (utterance ?? last())?.onerror?.({ error: code });
    },
  };

  return { synth, UtteranceCtor: FakeUtterance, drive };
}

/**
 * @typedef {object} WebSpeechMockConfig
 * @property {boolean} [speechIn]  Install a fake SpeechRecognition. Default true.
 * @property {boolean} [speechOut] Install a fake speechSynthesis + SpeechSynthesisUtterance. Default true.
 * @property {'standard' | 'webkit'} [recognitionVariant] Which global name to use for SpeechRecognition. Default 'standard'.
 */

/**
 * Install fake Web Speech APIs on `globalThis` and return drivers + a
 * teardown function that restores whatever was there before.
 * @param {WebSpeechMockConfig} [config]
 * @returns {{
 *   RecognitionCtor: any,
 *   synth: { speak: any, cancel: any } | null,
 *   UtteranceCtor: any,
 *   drive: { finish: (utt?: any) => void, fail: (utt?: any, code?: string) => void } | null,
 *   teardown: () => void,
 * }}
 */
export function setupWebSpeechMock(config = {}) {
  const { speechIn = true, speechOut = true, recognitionVariant = 'standard' } = config;
  const g = /** @type {Record<string, unknown>} */ (globalThis);
  /** @type {Record<string, unknown>} */
  const saved = {};

  const install = (/** @type {string} */ key, /** @type {any} */ value) => {
    saved[key] = g[key];
    g[key] = value;
  };

  /** @type {any} */
  let RecognitionCtor = null;
  if (speechIn) {
    RecognitionCtor = createSpeechRecognitionMock();
    if (recognitionVariant === 'webkit') {
      install('webkitSpeechRecognition', RecognitionCtor);
    } else {
      install('SpeechRecognition', RecognitionCtor);
    }
  }

  /** @type {{ speak: any, cancel: any } | null} */
  let synth = null;
  /** @type {any} */
  let UtteranceCtor = null;
  /** @type {{ finish: (u?: any) => void, fail: (u?: any, c?: string) => void } | null} */
  let drive = null;
  if (speechOut) {
    const synthSetup = createSynthMock();
    synth = synthSetup.synth;
    UtteranceCtor = synthSetup.UtteranceCtor;
    drive = synthSetup.drive;
    install('speechSynthesis', synth);
    install('SpeechSynthesisUtterance', UtteranceCtor);
  }

  const teardown = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  };

  return { RecognitionCtor, synth, UtteranceCtor, drive, teardown };
}
