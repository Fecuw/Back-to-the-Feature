#!/bin/bash
set -eu

settings_json=/tmp/btf-settings.json
if [[ -n ${BTF_SETTINGS_B64:-} ]] && printf '%s' "$BTF_SETTINGS_B64" | base64 -d > "$settings_json" 2>/dev/null; then
  jq -e 'type == "array"' "$settings_json" >/dev/null 2>&1 || printf '[]\n' > "$settings_json"
else
  printf '[]\n' > "$settings_json"
fi

cat > /workspace/session.conf <<EOF
# stage_id: このワークスペースで読み込まれているステージID
stage_id=${BTF_STAGE_ID:-unknown}
# server_id: 現在接続しているノードID
server_id=${BTF_SERVER_ID:-node}
# mode: セッションの動作モード（observe は調査モード）
mode=observe
EOF

while IFS= read -r encoded; do
  setting="$(printf '%s' "$encoded" | base64 -d)"
  id="$(printf '%s' "$setting" | jq -r '.id')"
  label="$(printf '%s' "$setting" | jq -r '.label')"
  description="$(printf '%s' "$setting" | jq -r '.description | gsub("[\\r\\n|]"; " ")')"
  on_label="$(printf '%s' "$setting" | jq -r '.onLabel | gsub("[\\r\\n|]"; " ")')"
  off_label="$(printf '%s' "$setting" | jq -r '.offLabel | gsub("[\\r\\n|]"; " ")')"
  config_path="$(printf '%s' "$setting" | jq -r '.configPath | gsub("[\\r\\n|]"; " ")')"
  value="$(printf '%s' "$setting" | jq -r 'if .default then "on" else "off" end')"
  {
    printf '# %s: %s\n' "$id" "$description"
    printf '# source: ゲーム内で対応する元の設定パスは %s\n' "$config_path"
    printf '# on: %s / off: %s\n' "$on_label" "$off_label"
    printf '# 次の行が %s の現在値を格納する設定行\n' "$label"
    printf '%s=%s\n' "$id" "$value"
  } > "/workspace/$id.conf"
done < <(jq -r '.[] | @base64' "$settings_json")

{
  printf '# %s configuration files\n\n' "${BTF_SERVER_LABEL:-training-node}"
  printf 'このディレクトリは、ゲーム内設定を調査するための `/workspace` ミラーです。\n'
  printf '`ls` で一覧、`cat <file>` または `config get <file>` で内容を確認できます。\n'
  printf '各 `.conf` の設定行直前には、その行の役割と on/off の意味をコメントで記載しています。\n\n'
  printf '| ファイル | 格納する設定 | 役割 | ゲーム内の対応パス |\n'
  printf '| --- | --- | --- | --- |\n'
  printf '| `session.conf` | `stage_id`, `server_id`, `mode` | 接続中セッションの識別情報 | runtime |\n'
  if [[ $(jq 'length' "$settings_json") -eq 0 ]]; then
    printf '| — | — | このノードに変更可能な防御設定はありません | — |\n'
  else
    while IFS= read -r encoded; do
      setting="$(printf '%s' "$encoded" | base64 -d)"
      id="$(printf '%s' "$setting" | jq -r '.id')"
      description="$(printf '%s' "$setting" | jq -r '.description | gsub("[\\r\\n|]"; " ")')"
      config_path="$(printf '%s' "$setting" | jq -r '.configPath | gsub("[\\r\\n|]"; " ")')"
      printf '| `%s.conf` | `%s` | %s | `%s` |\n' "$id" "$id" "$description" "$config_path"
    done < <(jq -r '.[] | @base64' "$settings_json")
  fi
  printf '\n> 対策フェーズでは `config set <file> <setting> on|off` で防御設定をゲームへ即時反映できます。\n'
} > /workspace/README.md

printf '%s service started at %s\n' "${BTF_SERVER_LABEL:-training-node}" "$(date -u +%FT%TZ)" > /workspace/service.log
touch /workspace/.btf-workspace-ready
exec httpd -f -p 8080 -h /opt/btf/www
