# @manufosela/ai-components

Monorepo of AI web components built with [Lit](https://lit.dev/), powered by Chrome Built-in AI (Gemini Nano via Prompt API, Writer, Summarizer, Translator and Speech APIs).

**100% JavaScript + JSDoc. No TypeScript.** Published with hand-refined `.d.ts` generated from JSDoc so consumers still get full type support.

> Status: **Bootstrapping**. Follow [Sprint 1](#sprint-1-2026-04-23--2026-05-07) progress.

## Philosophy

- **Progressive enhancement by capability detection.** Each component detects Chrome AI availability on mount. If AI is available, it renders an enriched UI (voice, auto-fill, semantic validation). If not, it renders a traditional HTML form with native HTML5 validation.
- **Chrome AI first** when available: on-device, private, free.
- **No adapters, no fallback backends.** The same component serves both scenarios via `renderAI()` / `renderFallback()`.
- **Real HTML underneath.** Components wrap real `<form>`, `<input>`, etc. If JS fails or AI is unavailable, the underlying element still works.

## Packages

| Package                  | Description                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `@manufosela/ai-core`    | `AIElement` base class (extends `LitElement`) + `detectAICapabilities()` + helpers for Prompt / Writer / Summarizer / Translator. |
| `@manufosela/ai-testing` | Reusable mocks of Chrome AI + Web Speech APIs for Vitest / jsdom / CI.                                                            |
| `@manufosela/ai-voice`   | `VoiceMixin` + wrappers over Web Speech API (TTS / STT) with cross-browser detection.                                             |
| `@manufosela/ai-form`    | `<ai-form>` — wraps a `<form>`, adds fill-from-text, semantic validation and optional voice I/O when AI is available.             |

## Requirements

- Node ≥ 20
- pnpm ≥ 10
- For Chrome AI features: Chrome 127+ with suitable hardware (see each component's docs).

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm site:dev
```

## Language and tooling

- Source: JavaScript (ES2022+, ES modules) with JSDoc annotations for type safety.
- Editor intellisense: driven by `jsconfig.json` with `checkJs: true`.
- Published types: `.d.ts` generated from JSDoc via `tsc --allowJs --declaration --emitDeclarationOnly` (TypeScript is used only as a generator, never as a source language).
- Lint: ESLint flat config + `eslint-plugin-jsdoc`.

## Sprint 1 (2026-04-23 → 2026-05-07)

Core infrastructure + first component `<ai-form>` + docs site + first npm release.

## License

MIT © Mánu Fosela
