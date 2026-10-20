#!/usr/bin/env bash
# Run on the Linux server after uploading and extracting a complete release.
set -euo pipefail
base="${1:?deployment base required}"
release_id="${2:?release id required}"
[[ "$base" =~ ^(/[A-Za-z0-9_.-]+){2,}$ ]] || exit 1
case "$base/" in *'/../'*|*'/./'*) exit 1;; esac
[[ "$release_id" =~ ^[a-f0-9]+-[0-9]+-[0-9]+$ ]] || exit 1
release="$base/releases/$release_id"
test -f "$release/backend/main.py"
test -f "$release/frontend/index.html"
# First-time service/Nginx setup is deliberately done by the server administrator.
systemctl cat lingxi-blog.service >/dev/null || { echo 'Install deploy/lingxi-blog.service first'; exit 1; }
test -f /etc/lingxi-blog.env || { echo 'Configure /etc/lingxi-blog.env first'; exit 1; }
if [ -e "$base/current" ] && [ ! -L "$base/current" ]; then echo 'current must be a symlink'; exit 1; fi
python3 -m venv "$release/.venv"
"$release/.venv/bin/python" -m pip install --disable-pip-version-check -r "$release/backend/requirements.txt"
previous="$(readlink "$base/current" || true)"
ln -s "$release" "$base/.current-$release_id"
mv -Tf "$base/.current-$release_id" "$base/current"
healthy=false
if sudo -n systemctl restart lingxi-blog.service; then
  for attempt in $(seq 1 20); do
    if "$release/.venv/bin/python" "$release/scripts/check_health.py" "$release/RELEASE"; then healthy=true; break; fi
    sleep 1
  done
fi
if [ "$healthy" != true ]; then
  echo 'Backend startup failed; restoring the previous release'
  if [ -n "$previous" ]; then
    ln -s "$previous" "$base/.rollback-$release_id"
    mv -Tf "$base/.rollback-$release_id" "$base/current"
    sudo -n systemctl restart lingxi-blog.service || true
  fi
  exit 1
fi
printf 'Published and health-checked %s\n' "$release_id"
