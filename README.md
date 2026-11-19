# Session HUD for Claude Code

Session HUD shows two rows above the terminal prompt with your remaining context, five-hour and seven-day subscription limits, and the latest skill, plugin, and MCP server Claude Code reports.

```text
Context 75% left · 5h 87.5% left · 7d 62% left
Last skill review:check · Plugin repo-tools · MCP github
```

## Install from GitHub

Replace `OWNER/session-hud` with the GitHub repository that hosts this marketplace, then run:

```sh
claude plugin marketplace add OWNER/session-hud
claude plugin install session-hud@session-hud-marketplace
claude
```

## Run from a checkout

From the repository root, run:

```sh
claude --plugin-dir "$PWD/plugins/session-hud"
```

Session HUD was verified on Claude Code 2.1.328. Function hooks must be enabled. A dash means Claude Code has supplied no value. Subscription limits appear after Claude Code receives usage data and can stay blank with API billing. The HUD runs alongside an existing status line.

Run the local test with Node.js 22.18 or later:

```sh
node --test plugins/session-hud/tests/hud.test.mjs
```
