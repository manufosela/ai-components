# @manufosela/ai-components

Monorepo of AI web components built with [Lit](https://lit.dev/), powered by Chrome Built-in AI (Gemini Nano via Prompt API, Writer, Summarizer, Translator and Speech APIs) with **pluggable fallback adapters** so they work in any browser and any circumstance.

> Status: **Bootstrapping**. Follow [Sprint 1](#sprint-1-2026-04-23--2026-05-07) progress.

## Philosophy

- **Chrome AI first** when available (on-device, private, free).
- **Graceful fallback everywhere else** via a simple `AIAdapter` interface — plug your own server, OpenAI, Anthropic, Transformers.js…
- **Progressive enhancement**: components wrap real HTML (`<form>`, `<input>`…) and enhance it. If AI is unavailable, the underlying element still works.

## Packages

| Package | Description |
|---------|-------------|
| `@manufosela/ai-core` | Adapter interface, ChromeAIAdapter, NoopAdapter, capability detection, types. |
| `@manufosela/ai-testing` | Reusable mocks of Chrome AI APIs for Vitest / jsdom / CI. |
| `@manufosela/ai-voice` | Wrappers over Web Speech API (TTS / STT) with cross-browser detection. |
| `@manufosela/ai-form` | `<ai-form>` — wraps a `<form>`, adds fill-from-text, semantic validation and optional voice I/O. |

## Requirements

- Node ≥ 20
- pnpm ≥ 10
- For Chrome AI features: Chrome 127+ with suitable hardware (see each component's docs).

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm site:dev
```

## Sprint 1 (2026-04-23 → 2026-05-07)

Core infrastructure + first component `<ai-form>` + docs site + first npm release.

## License

MIT © Mánu Fosela
