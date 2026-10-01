#!/bin/sh
# agents-village: forward agent hook events to villaged. Always fails open:
# exit 0, and print only a decision that villaged explicitly marked as its own.
AGENT="$1"
# "Authorization: Bearer <token>", written 0600 by install-hooks; read by curl so the token never hits argv (ps).
HDR_FILE="$HOME/.agents-village/auth-header"
if [ ! -r "$HDR_FILE" ]; then cat >/dev/null; exit 0; fi
IN=$(cat)

# The agent runs us through one or more shells (e.g. the `if [ -x ]` guard); walk up to the agent itself.
P=$PPID
AGENT_PID=$PPID
for _ in 1 2 3 4 5; do
  A=$(ps -o args= -p "$P" 2>/dev/null)
  if printf '%s' "$A" | grep -Eq '(^|/)(claude|codex|gemini)( |$)|(^|/)(claude|codex|gemini)\.(c|m)?js( |$)'; then AGENT_PID=$P; break; fi
  P=$(ps -o ppid= -p "$P" 2>/dev/null | tr -d ' ')
  [ -z "$P" ] || [ "$P" -le 1 ] && break
done
TTY=$(ps -o tty= -p "$AGENT_PID" 2>/dev/null | tr -d ' ')

# Only events that may wait for the user get a long timeout.
MAX=4
if printf '%s' "$IN" | grep -Eq '"hook_event_name" *: *"(PermissionRequest|Stop|AfterAgent)"' \
  || printf '%s' "$IN" | grep -Eq '"tool_name" *: *"(AskUserQuestion|ExitPlanMode)"'; then MAX=900; fi

OUT=$(mktemp "${TMPDIR:-/tmp}/village-hook.XXXXXX") || exit 0
CURL=
trap 'rm -f "$OUT" "$OUT.m"' EXIT
# Killed by the agent (e.g. hook timeout): drop the request too, so villaged releases the hold.
trap '[ -n "$CURL" ] && kill "$CURL" 2>/dev/null; exit 0' INT TERM HUP
# curl runs in the background so `wait` (unlike a foreground child) lets the traps fire right away.
# -w %header{} needs curl >= 7.84.
printf '%s' "$IN" | curl -sf --connect-timeout 1 --max-time "$MAX" -X POST -o "$OUT" -w '%header{x-village}' \
  -H @"$HDR_FILE" -H "Content-Type: application/json" \
  -H "X-Village-Pid: $AGENT_PID" -H "X-Village-Tty: $TTY" \
  -H "X-Village-Tmux-Pane: ${TMUX_PANE:-}" -H "X-Village-Term: ${TERM_PROGRAM:-}" \
  -H "X-Village-Pty: ${VILLAGE_PTY_ID:-}" -H "X-Village-Orca: ${ORCA_PANE_KEY:-}" -H "X-Village-Warp: ${WARP_FOCUS_URL:-}" \
  --data-binary @- "http://127.0.0.1:${VILLAGE_PORT:-4777}/hook?agent=$AGENT" >"$OUT.m" 2>/dev/null &
CURL=$!
wait "$CURL"
[ "$(cat "$OUT.m" 2>/dev/null)" = "1" ] && cat "$OUT"
exit 0
