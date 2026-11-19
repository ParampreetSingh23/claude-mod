# Claude Code Mods

This repository is a Claude Code marketplace for Session HUD and Session Diff.

## Install Session HUD

Run this from any directory. Claude Code fetches Session HUD from GitHub for you.

```sh
claude plugin install session-hud --marketplace ParampreetSingh23/claude-mod
```

Start a new Claude Code session and approve the mod’s function hooks if prompted. The plugin is also available under `/plugin` after installation.

## Install multiple mods

Install both mods from the same marketplace:

```sh
(
  for mod in session-hud session-diff; do
    claude plugin install "$mod" --marketplace ParampreetSingh23/claude-mod || exit 1
  done
)
```

To browse available mods, add the marketplace with `claude plugin marketplace add ParampreetSingh23/claude-mod`, then open `/plugin` in Claude Code. To publish another mod here, put it under `plugins/<name>/` with its own `.claude-plugin/plugin.json` and add an entry to `.claude-plugin/marketplace.json`. The existing marketplace ID is `session-hud-marketplace`.

## Session HUD

The bars show how much context and five-hour and seven-day subscription capacity remains. They turn yellow at 50% and red at 20%. Narrow terminals show percentages alone. The second row shows the latest skill, plugin, and MCP server Claude Code reports.

```text
Context ████░ 75% · 5h ████░ 87.5% · 7d ███░░ 62%
Last skill review:check · Plugin repo-tools · MCP github
```

To update an existing installation after a new release:

```sh
claude plugin marketplace update session-hud-marketplace
claude plugin update session-hud@session-hud-marketplace
```

### Run Session HUD from a checkout

From the repository root, run:

```sh
claude --plugin-dir "$PWD/plugins/session-hud"
```

Session HUD targets Claude Code 2.1.328 with function hooks enabled. When the live session feed is missing plan limits, the HUD runs Claude Code’s built-in `/usage` command in the background and refreshes its readings up to once every five minutes per session. This uses Claude Code’s existing login and sends no model prompt. Gateway sessions that report a spend limit get a spend meter. If your login or billing setup provides no plan figures, the HUD points you to `/usage`. The activity row fills in as skills, plugin-owned skills or tools, and MCP servers are used. The HUD runs alongside an existing status line.

Run the local test with Node.js 22.18 or later:

```sh
node --test plugins/session-hud/tests/hud.test.mjs
```

## Session Diff

Install Session Diff from GitHub:

```sh
claude plugin install session-diff --marketplace ParampreetSingh23/claude-mod
```

Start Claude Code in a Git working tree, then run `/session-diff` when you want to review your changes.

```text
Session Diff · 3 files changed
Modified  README.md
Added     src/format.ts
Deleted   src/legacy.ts
```

The mod compares the current working tree with a snapshot taken at startup. It includes tracked files and non-ignored untracked files, and detects further edits to files that were already dirty. Commits made during the session stay visible until you restore the starting contents. A rename appears as a deletion and an addition. Staging by itself doesn’t count as a file change.

Session Diff requires the Claude Code terminal (2.1.328 or later), Git, and Node.js on `PATH`. The snapshot stays in memory and starts over when you restart Claude Code or reload the mod. The command shows paths and change types locally. It leaves the Git index and working files untouched. Submodule contents and ignored untracked files are outside the snapshot.
