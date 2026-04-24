import { describe, it, expect } from 'vitest';
import * as aiVoice from '../src/index.js';

describe('@manufosela/ai-voice barrel', () => {
  it('exports VoiceMixin', () => {
    expect(aiVoice.VoiceMixin).toBeTypeOf('function');
  });

  it('exports listen and isListenAvailable', () => {
    expect(aiVoice.listen).toBeTypeOf('function');
    expect(aiVoice.isListenAvailable).toBeTypeOf('function');
  });

  it('exports speak and isSpeakAvailable', () => {
    expect(aiVoice.speak).toBeTypeOf('function');
    expect(aiVoice.isSpeakAvailable).toBeTypeOf('function');
  });
});
