#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash mac/install.sh [--test]

Install cloudmail in ~/bin, save Worker credentials, and verify /health.
Set BASE_URL, SEND_API_KEY, and FROM beforehand to skip credential prompts.
EOF
}

die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

TEST=false
case "${1:-}" in
  '') ;;
  --test) TEST=true ;;
  -h|--help) usage; exit 0 ;;
  *) die "unknown option: $1" ;;
esac

[[ "$(uname -s)" == "Darwin" ]] || die "this installer only supports macOS"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/cloudmail"
BIN_DIR="$HOME/bin"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/cloudmail"
CONFIG_FILE="$CONFIG_DIR/config"

[[ -f "$SOURCE" ]] || die "cloudmail not found next to this installer"
mkdir -p "$BIN_DIR" "$CONFIG_DIR"
if [[ -e "$BIN_DIR/cloudmail" ]]; then
  printf 'cloudmail already exists at %s; overwriting it.\n' "$BIN_DIR/cloudmail"
fi
install -m 755 "$SOURCE" "$BIN_DIR/cloudmail"

if [[ -e "$CONFIG_FILE" ]]; then
  printf 'configuration already exists at %s; values entered below will overwrite it.\n' "$CONFIG_FILE"
fi

BASE_URL="${BASE_URL:-}"
SEND_API_KEY="${SEND_API_KEY:-}"
FROM="${FROM:-}"
if [[ -z "$BASE_URL" ]]; then read -r -p 'Worker BASE_URL: ' BASE_URL; fi
if [[ -z "$SEND_API_KEY" ]]; then read -r -s -p 'SEND_API_KEY: ' SEND_API_KEY; printf '\n'; fi
if [[ -z "$FROM" ]]; then read -r -p 'From address (@ashesborn.cloud): ' FROM; fi
[[ -n "$BASE_URL" && -n "$SEND_API_KEY" && -n "$FROM" ]] || die "BASE_URL, SEND_API_KEY, and FROM are all required"
[[ "$BASE_URL$SEND_API_KEY$FROM" != *$'\n'* && "$BASE_URL$SEND_API_KEY$FROM" != *$'\r'* ]] || die "configuration values must not contain newlines"

umask 077
{
  printf 'BASE_URL=%s\n' "$BASE_URL"
  printf 'SEND_API_KEY=%s\n' "$SEND_API_KEY"
  printf 'FROM=%s\n' "$FROM"
} > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

case ":${PATH}:" in
  *":$HOME/bin:"*) ;;
  *) printf 'Add this line to ~/.zshrc, then open a new Terminal: export PATH="$HOME/bin:$PATH"\n' ;;
esac

printf 'Health check: '
curl --fail --silent --show-error --max-time 60 "${BASE_URL%/}/health"
printf '\n'

if [[ "$TEST" == true ]]; then
  read -r -p "Send a test email to $FROM now? [y/N] " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    "$BIN_DIR/cloudmail" -t "$FROM" -s 'CloudMail test' -m 'CloudMail is configured correctly.'
  else
    printf 'Test email skipped.\n'
  fi
fi
