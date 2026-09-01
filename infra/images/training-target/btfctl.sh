#!/bin/bash
set -u

command_name="$(basename "$0")"

print_help() {
  cat <<'EOF'

BACK TO THE FEATURE - INVESTIGATION COMMANDS (12)

COMMAND                                  ARGUMENTS                         DESCRIPTION
help [command]                           command: optional                Show all commands or one detailed entry
hostname                                 none                              Print the current container hostname
whoami                                   none                              Print the non-root session user
status [--json]                          --json: machine-readable output  Show node, stage, uptime and health
services [--all]                         --all: include helper processes  List services running in this node
ports [--listen]                         --listen: listening sockets only Show TCP listeners and owning processes
ps [--sort cpu|mem]                      --sort: cpu or memory             Show the process table with optional sorting
logs [service] [--lines N]               service; N: 1-200                Read recent isolated service logs
inspect [defense|network]                section: optional                Inspect applied defenses or network scope
ls [path]                                path: optional                   List README and configuration files
cat PATH                                 workspace file                  Read a README or configuration file
config get PATH | config set PATH KEY on|off                              Read or immediately apply a defense setting

Example: config set rate_limit.conf rate_limit on

EOF
}

case "$command_name" in
  help)
    if [[ ${1:-} == "logs" ]]; then
      printf '\nlogs [service] [--lines N]\n  Reads 1-200 recent lines. service defaults to the current node.\n\n'
    elif [[ ${1:-} == "config" ]]; then
      printf '\nconfig get PATH | config set PATH KEY on|off\n  PATH is resolved below /workspace. KEY must match the setting in that file.\n\n'
    else
      print_help
    fi
    ;;
  status)
    if [[ ${1:-} == "--json" ]]; then
      jq -n --arg node "${BTF_SERVER_ID:-node}" --arg stage "${BTF_STAGE_ID:-unknown}" --arg health "healthy" '{node:$node,stage:$stage,health:$health}'
    else
      printf '\nNODE      %s\nSTAGE     %s\nHEALTH    healthy\nUPTIME    %s\n\n' "${BTF_SERVER_ID:-node}" "${BTF_STAGE_ID:-unknown}" "$(cut -d. -f1 /proc/uptime)s"
    fi
    ;;
  services)
    printf '\nSERVICE              PID       STATE\n'
    printf '%-20s %-9s %s\n' 'training-http' "$(pgrep -o httpd || printf '-')" 'running'
    [[ ${1:-} == "--all" ]] && ps -o comm,pid,state
    printf '\n'
    ;;
  ports)
    printf '\n'
    ss -lntp
    printf '\n'
    ;;
  logs)
    lines=30
    while [[ $# -gt 0 ]]; do
      if [[ $1 == "--lines" && ${2:-} =~ ^[0-9]+$ ]]; then lines=$2; shift 2; else shift; fi
    done
    (( lines < 1 )) && lines=1
    (( lines > 200 )) && lines=200
    printf '\n'
    tail -n "$lines" /workspace/service.log
    printf '\n'
    ;;
  inspect)
    defenses="$(awk -F= '!/^#/ && NF == 2 { printf "%s%s=%s", separator, $1, $2; separator=", " }' /workspace/*.conf 2>/dev/null)"
    printf '\nSESSION    %s\nNETWORK    isolated / egress denied\nROOTFS     read-only\nUSER       10001:10001\nCAPS       none\nSETTINGS   %s\n\n' "${BTF_SESSION_ID:-unknown}" "${defenses:-none}"
    ;;
  config)
    action=${1:-}
    path=${2:-}
    if [[ -z $path || $path == /* || $path == *..* ]]; then printf '\nusage: config get PATH | config set PATH KEY on|off\n\n'; exit 2; fi
    target="/workspace/$path"
    if [[ $action == "get" ]]; then
      printf '\n'; cat "$target" 2>/dev/null || printf 'config: %s not found\n' "$path"; printf '\n'
    elif [[ $action == "set" ]]; then
      if [[ ! -f $target || $path != *.conf ]]; then printf '\nconfig: %s is not an editable configuration file\n\n' "$path"; exit 2; fi
      expected_key="$(awk -F= '!/^#/ && NF == 2 { print $1; exit }' "$target")"
      supplied_key=${3:-}
      value=${4:-}
      if [[ -z $expected_key || -z $supplied_key || -z $value || $# -ne 4 ]]; then printf '\nusage: config set %s %s on|off\n\n' "$path" "${expected_key:-KEY}"; exit 2; fi
      if [[ $path != "$expected_key.conf" ]]; then printf '\nconfig: %s is not an editable defense setting\n\n' "$path"; exit 2; fi
      if [[ $supplied_key != "$expected_key" ]]; then printf "\nconfig: '%s' is not the setting in %s (expected: %s)\n\n" "$supplied_key" "$path" "$expected_key"; exit 2; fi
      if [[ $value != "on" && $value != "off" ]]; then printf '\nconfig: VALUE must be on or off\n\n'; exit 2; fi
      awk -v key="$expected_key" -v value="$value" 'index($0, key "=") == 1 { print key "=" value; next } { print }' "$target" > "$target.tmp"
      mv "$target.tmp" "$target"
      printf '\nupdated %s: %s=%s\n\n' "$path" "$expected_key" "$value"
    else
      printf '\nusage: config get PATH | config set PATH KEY on|off\n\n'; exit 2
    fi
    ;;
  *)
    print_help
    ;;
esac
