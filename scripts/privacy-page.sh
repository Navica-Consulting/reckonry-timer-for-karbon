#!/usr/bin/env bash
# Renders docs/privacy-policy.md into a static site for GitHub Pages (timer.reckonry.ai).
#
#   scripts/privacy-page.sh [outdir]   default outdir: _site
#
#   <outdir>/privacy.html   served at https://timer.reckonry.ai/privacy
#   <outdir>/index.html     sends the bare domain to /privacy
#
# Uses GitHub's Markdown API through gh, so it needs gh signed in (GH_TOKEN in Actions).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-_site}
mkdir -p "$OUT"

body=$(gh api markdown/raw -H "Content-Type: text/plain" --input docs/privacy-policy.md)

cat > "$OUT/privacy.html" <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy for Reckonry Timer for Karbon</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1f2933; --muted:#5f6b7a; --line:#e3e7ec; --accent:#2e5aac; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1b1f24; --fg:#e8ecf1; --muted:#9aa5b1; --line:#323a43; --accent:#7cb0ff; }
  }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, sans-serif; }
  main { max-width:720px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:28px; line-height:1.25; margin:0 0 8px; }
  h2 { font-size:19px; margin:32px 0 8px; padding-top:16px; border-top:1px solid var(--line); }
  a { color:var(--accent); }
  .anchor { display:none; }
</style>
</head>
<body>
<main>
$body
</main>
</body>
</html>
EOF

cat > "$OUT/index.html" <<'EOF'
<!doctype html>
<meta charset="utf-8">
<title>Reckonry Timer for Karbon</title>
<meta http-equiv="refresh" content="0; url=/privacy">
<a href="/privacy">Privacy policy</a>
EOF

echo "Wrote $OUT/privacy.html and $OUT/index.html"
