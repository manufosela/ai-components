// @manufosela/ai-testing
// Reusable mocks of Chrome AI + Web Speech APIs for testing.

export {
  setupChromeAIMock,
  createLanguageModelMock,
  createWriterMock,
  createSummarizerMock,
  createTranslatorMock,
} from './chrome-ai.js';

export { setupWebSpeechMock, createSpeechRecognitionMock, createSynthMock } from './web-speech.js';
