#!/usr/bin/env bash
set -euo pipefail

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI is required. Install it with: pnpm add --global vercel" >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_API_URL:-}" ]]; then
  read -r -p "Render API base URL (for example https://reachinbox-api.onrender.com): " NEXT_PUBLIC_API_URL
fi

if [[ ! "$NEXT_PUBLIC_API_URL" =~ ^https:// ]]; then
  echo "NEXT_PUBLIC_API_URL must be the HTTPS URL of the deployed Render API." >&2
  exit 1
fi

vercel link --cwd apps/web
printf '%s' "$NEXT_PUBLIC_API_URL" | vercel env add NEXT_PUBLIC_API_URL production --force --cwd apps/web
vercel --cwd apps/web --prod
