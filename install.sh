#!/usr/bin/env bash
# One-time setup: put the queue CLI on PATH and write a default config if none exists.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.local/bin" "$HOME/.config/agent-queue"
ln -sf "$root/bin/q" "$HOME/.local/bin/q"
config="$HOME/.config/agent-queue/config.toml"
if [ ! -f "$config" ]; then
  cat > "$config" <<'TOML'
# Where `q reconcile` checks PRs and deploy ancestry.
[reconcile]
repo_dir = ""          # absolute path to a clone of the repo the PRs are in
release_ref = ""       # ref that means "in production", e.g. origin/release
TOML
  echo "wrote $config - fill in [reconcile]"
fi
"$HOME/.local/bin/q" list >/dev/null && echo "q ready: $(command -v q || echo "$HOME/.local/bin/q")"
