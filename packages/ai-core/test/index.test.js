import { describe, it, expect } from 'vitest';
import * as aiCore from '../src/index.js';

describe('@manufosela/ai-core barrel', () => {
  it('exports AIElement', () => {
    expect(aiCore.AIElement).toBeTypeOf('function');
  });

  it('exports detectAICapabilities', () => {
    expect(aiCore.detectAICapabilities).toBeTypeOf('function');
  });

  it('exports prompt, summarize, write, translate helpers', () => {
    expect(aiCore.prompt).toBeTypeOf('function');
    expect(aiCore.summarize).toBeTypeOf('function');
    expect(aiCore.write).toBeTypeOf('function');
    expect(aiCore.translate).toBeTypeOf('function');
  });
});
