export PS1='\[\033[32m\]operator@${BTF_SERVER_ID:-node}\[\033[0m\]:\[\033[34m\]\w\[\033[0m\]\$ '
export HISTFILE=/workspace/.shell_history
export HISTSIZE=200
export HISTFILESIZE=200
export PROMPT_COMMAND='history -a'
help() { command /usr/local/bin/help "$@"; }
_btf_complete_files() {
  local current="${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=($(compgen -f -- "$current"))
}
_btf_complete_help() {
  local current="${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=($(compgen -W 'help hostname whoami status services ports ps logs inspect ls cat config shutdown reboot clear' -- "$current"))
}
_btf_complete_config() {
  local current="${COMP_WORDS[COMP_CWORD]}"
  case "$COMP_CWORD" in
    1) COMPREPLY=($(compgen -W 'get set' -- "$current")) ;;
    2) COMPREPLY=($(compgen -f -- "$current")) ;;
    3)
      if [[ ${COMP_WORDS[1]} == set && ${COMP_WORDS[2]} == *.conf ]]; then
        local key
        key="$(awk -F= '!/^#/ && NF == 2 { print $1; exit }' "${COMP_WORDS[2]}" 2>/dev/null)"
        COMPREPLY=($(compgen -W "$key" -- "$current"))
      fi
      ;;
    4) [[ ${COMP_WORDS[1]} == set ]] && COMPREPLY=($(compgen -W 'on off' -- "$current")) ;;
  esac
}
complete -F _btf_complete_help help
complete -F _btf_complete_files cat ls
complete -F _btf_complete_config config
complete -W '--json' status
complete -W '--all' services
complete -W '--listen' ports
complete -W '--sort cpu mem' ps
complete -W '--lines' logs
complete -W 'defense network' inspect
printf '\nBack to the Feature // %s // isolated session\n' "${BTF_SERVER_LABEL:-training-node}"
printf "Type 'help' to list the available investigation commands.\n\n"
