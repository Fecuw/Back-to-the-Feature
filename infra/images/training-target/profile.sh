export PS1='\[\033[32m\]operator@${BTF_SERVER_ID:-node}\[\033[0m\]:\[\033[34m\]\w\[\033[0m\]\$ '
export HISTFILE=/workspace/.shell_history
export HISTSIZE=200
help() { command /usr/local/bin/help "$@"; }
printf '\nBack to the Feature // %s // isolated session\n' "${BTF_SERVER_LABEL:-training-node}"
printf "Type 'help' to list the twelve investigation commands.\n\n"
