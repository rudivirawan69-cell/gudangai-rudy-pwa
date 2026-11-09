#!/usr/bin/env bash
set -euo pipefail

command -v npx >/dev/null 2>&1 || { echo "Node.js/npm tidak ditemukan." >&2; exit 1; }

read -r -s -p "Supabase publishable key: " SUPABASE_PUBLISHABLE_KEY
printf '\n'
if [[ -z "${SUPABASE_PUBLISHABLE_KEY}" ]]; then
  echo "Publishable key kosong; dibatalkan." >&2
  exit 1
fi
printf '%s' "${SUPABASE_PUBLISHABLE_KEY}" | npx --yes wrangler@4.158.0 secret put SUPABASE_PUBLISHABLE_KEY

read -r -s -p "Apps Script gateway secret: " GUDANGAI_SHEETS_API_SECRET
printf '\n'
if [[ -n "${GUDANGAI_SHEETS_API_SECRET}" ]]; then
  printf '%s' "${GUDANGAI_SHEETS_API_SECRET}" | npx --yes wrangler@4.158.0 secret put GUDANGAI_SHEETS_API_SECRET
fi

unset SUPABASE_PUBLISHABLE_KEY GUDANGAI_SHEETS_API_SECRET
echo "Secret Worker telah dikirim melalui Wrangler. Nilai tidak dicetak."
