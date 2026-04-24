import { describe, it, expect } from 'vitest';
import * as aiTesting from '../src/index.js';

describe('@manufosela/ai-testing barrel', () => {
  it('exports all Chrome AI helpers', () => {
    expect(aiTesting.setupChromeAIMock).toBeTypeOf('function');
    expect(aiTesting.createLanguageModelMock).toBeTypeOf('function');
    expect(aiTesting.createWriterMock).toBeTypeOf('function');
    expect(aiTesting.createSummarizerMock).toBeTypeOf('function');
    expect(aiTesting.createTranslatorMock).toBeTypeOf('function');
  });

  it('exports all Web Speech helpers', () => {
    expect(aiTesting.setupWebSpeechMock).toBeTypeOf('function');
    expect(aiTesting.createSpeechRecognitionMock).toBeTypeOf('function');
    expect(aiTesting.createSynthMock).toBeTypeOf('function');
  });
});
