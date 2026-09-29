# Agents Village

See every Claude Code / Codex / Gemini CLI agent on your Mac as a little 3D person — what it's doing right now, and who needs you. Answer their questions from the browser.

**Live demo (no agents needed):** https://diwakersurya.github.io/agent-village/

- **Office** view: open-plan benching desks modelled on a real office; each agent sits at a desk, its monitor shows the current activity.
- **Village** view: projects are houses, tools are buildings (Workshop = Bash, Library = Read/Search, Drafting = Edit, Post office = Web/MCP); agents walk to the tool they're using.
- A **beacon** above each agent shows its status: gear = working, `!` = needs you (visible through walls), Zz = idle, ✕ = exited.
- **Focus an agent** (click it, Tab / N, or the Agents list) and its beacon opens a menu: Reply / Answer, Live, History, Terminal (keys 1–4). The overlay you pick freezes the scene until you close it (Esc).
- **Walk mode** (default, P to toggle): drag to look, WASD to walk. Click a beacon or a place tag (bean bag, stage, pantry, meeting room) to flash-teleport there. Idle agents wander off for coffee (at most 2 at a time) and come over to play billiards or table tennis with you. The cooler, pantry and robot vacuum react when you use them (or kick them).
- Filter agents by status from the top bar; sounds are synthesised and positional (mute button in the top bar).

## Run

```sh
npm install
npm run build:web
bin/village install-hooks     # adds tagged hooks to ~/.claude, ~/.codex, ~/.gemini (backups made)
bin/village start             # prints the URL with your access token
```

Restart running agents after installing hooks. Without hooks, agents still show up (from session logs + process scan) but can't be answered from the page.

Other commands: `bin/village doctor`, `bin/village uninstall-hooks`, `bin/village run claude` (runs the agent in a village-owned PTY so replies can always be typed in).

Try it without any agents: open `http://127.0.0.1:4777/?demo=1`, or the hosted demo above.

Why the token: the daemon can type into your terminals and approve agent permissions, and any web page in your browser can reach `127.0.0.1`. The token (plus Host and Origin checks) stops other sites from doing that. `village start` prints a link that carries it; the page remembers it after the first visit.

## How replies get back to an agent

| Where the agent runs | Reply | Focus terminal |
|---|---|---|
| any terminal, hooks installed | held hook returns your answer (permission, question, "what next?") | — |
| `village run` | typed into its PTY | — |
| tmux | `tmux send-keys` | select pane + raise terminal app |
| Orca | `orca terminal send` | `orca terminal switch` |
| Terminal.app | AppleScript `do script` in the matching tab | select tab |
| Warp / other | held hook only | bring app to front |

Hooks fail open: if the daemon isn't running, agents behave exactly as before.

## Dev

```sh
npm test                 # daemon + web unit tests
npm run daemon           # daemon on :4777
npm run dev:web          # Vite on :5173, proxied to the daemon
```

Env: `VILLAGE_PORT` (default 4777), `VILLAGE_HOLD_TIMEOUT_S` (default 600).

The GitHub Pages demo is built by `.github/workflows/pages.yml` on every push to `main` (`VITE_DEMO=1`, base `/<repo>/`).

Avatars: KayKit Adventurers Character Pack (CC0) — `web/public/models/LICENSE-KayKit.txt`.

License: MIT (see `LICENSE`).
