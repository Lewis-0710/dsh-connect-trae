# dsh-connect-trae

[English](README.en.md) | 中文

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) bundle plugin that connects locally signed-in Trae models to the DSH model picker, and exposes a read-only usage/credits overview.

## Preview

<p align="center">
  <img src="docs/assets/dsh-connect-trae-usage-card.png" alt="DSH Connect Trae plugin card showing the current Trae account and credit summary" width="900">
</p>

<p align="center"><sub>Settings → Plugins → DSH Connect Trae: reads the currently signed-in Trae account and displays available, consumed, and total credits.</sub></p>

## Features

- **Trae model provider** — registers locally signed-in Trae models as the `trae` provider (e.g. `DeepSeek-V4-Flash`, `DeepSeek-V4-Pro`).
- **New SOLO remote sessions** — creates a session and polls the final answer over `solo.trae.cn/api/remote/v1`.
- **Read-only usage overview** — expand the card in Plugin configuration (Settings → Plugins → DSH Connect Trae) to see total available credits, per-pack sources (legacy, check-in, monthly bonus), daily check-in status, and reward activity rules. Read-only; does not consume Trae credits.
- **Secure loopback shim** — random port + in-process random secret; the real Trae token is never handed to pi-ai.

## How it works

```text
DSH PiAiAdapter
  -> secure loopback shim
  -> TraeSoloRemoteBridge
  -> TraeSoloRemoteClient
  -> https://solo.trae.cn/api/remote/v1/chat_sessions
  -> poll /chat_sessions/:id/messages
  -> extract final answer -> OpenAI SSE -> DSH
```

Usage overview hits the read-only `https://api.trae.cn/trae/api/v2/pay/*` and `/trae/api/v2/ug/*` endpoints.

> See `docs/IMPLEMENTATION_PLAN.md`, `docs/SOLO_ROUTE_DECISION.md`, `docs/USAGE_API_RESEARCH.md`.

## Install

```sh
dsh plugin --profile desktop add dsh-connect-trae
```

Or directly via npm:

```sh
npm install dsh-connect-trae
```

Restart the DSH process after install/update/uninstall.

## Development

```sh
pnpm install
pnpm run check   # typecheck + test + build
```

Local dev via a `link:` install to the desktop profile (restart DSH Desktop after editing):

```sh
dsh plugin --profile desktop add /Users/dmh2002/DshProject/dsh-connect-trae
```

## Third-party open-source dependencies

The open-source projects referenced for Trae integration (architecture/protocol research), together with their licenses and compliance notes, are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). When introducing new Trae-related external dependencies or reusing code from other projects, update that file accordingly and honor the upstream licenses.

## License

This project is licensed under the [MIT License](LICENSE). Copyright: **Copyright (c) 2026 LaoDing**.
