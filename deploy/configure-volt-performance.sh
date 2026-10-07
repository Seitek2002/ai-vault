#!/usr/bin/env bash
# Host nginx and scheduling settings for the existing Volt production stack.
# Cache only immutable public assets; authenticated API/page responses stay private.
set -euo pipefail
cd /opt/ai-vault
site=/etc/nginx/sites-available/docs.operator.kg
cache_config=/etc/nginx/conf.d/volt-static-cache.conf
compose=/opt/ai-vault/docker-compose.prod.yml
backup=/opt/ai-vault-backups/$(date -u +%Y%m%dT%H%M%SZ)-performance
mkdir -p "$backup"
chmod 700 "$backup"
cp -a "$site" "$backup/site.conf"
cp -a "$compose" "$backup/compose.yml"
if [ -f "$cache_config" ]; then cp -a "$cache_config" "$backup/cache.conf"; fi
for name in aivault-api aivault-web aivault-postgres aivault-minio; do
  docker inspect "$name" --format '{{.HostConfig.CpuShares}}' > "$backup/$name.shares"
done
rollback() {
  set +e
  cp -a "$backup/site.conf" "$site"
  cp -a "$backup/compose.yml" "$compose"
  if [ -f "$backup/cache.conf" ]; then cp -a "$backup/cache.conf" "$cache_config";
  else rm -f "$cache_config"; fi
  for name in aivault-api aivault-web aivault-postgres aivault-minio; do
    docker update --cpu-shares "$(cat "$backup/$name.shares")" "$name" >/dev/null
  done
  nginx -t && systemctl reload nginx
  echo VOLT_PERFORMANCE_CONFIG_ROLLED_BACK
  exit 1
}
trap rollback ERR
python3 - <<'PY'
from pathlib import Path
import re
import yaml
site = Path('/etc/nginx/sites-available/docs.operator.kg')
text = site.read_text()
if '# Volt immutable asset cache' not in text:
    assert text.count('    location /api/ {') == 1
    assets = '''    # Volt immutable asset cache: hashed assets only, never private API data.
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_types application/javascript text/css application/json text/plain application/wasm image/svg+xml;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header Accept-Encoding "";
        proxy_cache volt_static;
        proxy_cache_valid 200 30d;
        proxy_cache_lock on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        add_header X-Volt-Static-Cache $upstream_cache_status always;
    }

'''
    text = text.replace('    location /api/ {', assets + '    location /api/ {', 1)
text = text.replace('listen 443 ssl;', 'listen 443 ssl http2;')
site.write_text(text)
Path('/etc/nginx/conf.d/volt-static-cache.conf').write_text(
    'proxy_cache_path /var/cache/nginx/volt-static levels=1:2 keys_zone=volt_static:10m max_size=512m inactive=30d use_temp_path=off;\n')
compose = Path('/opt/ai-vault/docker-compose.prod.yml')
text = compose.read_text()
data = yaml.safe_load(text)
for name, weight in [('api',4096),('web',4096),('postgres',4096),('minio',2048)]:
    service = data['services'][name]
    current = service.get('cpu_shares')
    assert current is None or current == weight, f'Unexpected scheduling configuration for {name}'
    if current is None:
        text, count = re.subn(r'^  ' + re.escape(name) + r':\s*$',
            f'  {name}:\n    cpu_shares: {weight}', text, count=1, flags=re.M)
        assert count == 1
compose.write_text(text)
PY
mkdir -p /var/cache/nginx/volt-static
chown www-data:www-data /var/cache/nginx/volt-static
nginx -t
docker compose -f "$compose" config --quiet
# Relative weights give Volt more CPU when the VPS is busy, without limiting
# any service's use of otherwise idle CPU or restarting the database/storage.
docker update --cpu-shares 4096 aivault-api aivault-web aivault-postgres >/dev/null
docker update --cpu-shares 2048 aivault-minio >/dev/null
systemctl reload nginx
trap - ERR
printf 'VOLT_PERFORMANCE_CONFIG_APPLIED backup=%s\n' "$backup"
