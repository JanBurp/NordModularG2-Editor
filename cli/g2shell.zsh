# g2shell.zsh — G2 command shell environment
# Source this file (or let g2tmux.sh do it) to get direct G2 commands + autocomplete

_G2_FIFO=/tmp/g2-cmd
_G2_ID_FILE=/tmp/g2-daemon-id
_G2_DAEMON_PID_FILE=/tmp/g2-daemon-pid
_G2_DIR="${${(%):-%x}:A:h}"

_G2_CMDS=(
  connect disconnect list-devices startup device list
  get-patch get-patch-file select-patch select-perf upload-patch upload-perf get-perf-file
  slot variation set-perf-mode set-perf-name set-patch-name
  set-master-clock-run set-master-clock-bpm
  set-patch-description
  get-resources voice-mode voice-count
  get-perf-settings set-slot-enabled set-slot-key
  add-module del-module move-module set-module-color set-module-name set-module-mode
  add-cable del-cable set-cable-color
  set-param set-param-label copy-variation
  verbose debug
)

__g2_send() {
  local id=$(( $(cat "$_G2_ID_FILE") + 1 ))
  echo $id > "$_G2_ID_FILE"
  local cmd="$1"; shift
  local args_json=""
  for arg in "$@"; do args_json+="\"$arg\","; done
  echo "{\"id\":$id,\"cmd\":\"$cmd\",\"args\":[${args_json%,}]}" > "$_G2_FIFO"
  print -- $'\e[2m['"$(date +%H:%M:%S)"$']\e[0m -> id '"$id"
}

stop()  { kill "$(cat "$_G2_DAEMON_PID_FILE")" 2>/dev/null; }
start() {
  tmux send-keys -t g2:0.1 "cd '$_G2_DIR' && ./g2-daemon-view.sh" Enter 2>/dev/null \
    || print "Run './g2-daemon-view.sh' manually in the daemon pane."
}
help()  { "$_G2_DIR/build/bin/g2-cli" -h }
exit()  { tmux kill-session -t g2 2>/dev/null || builtin exit }

for _g2_cmd in "${_G2_CMDS[@]}"; do
  eval "function $_g2_cmd() { __g2_send $_g2_cmd \"\$@\"; }"
done
unset _g2_cmd

# Argument completion for G2 commands
_g2_complete() {
  case $service in
    get-patch|get-patch-file|upload-patch|select-patch)
      (( CURRENT == 2 )) && compadd A B C D
      ;;
    slot)
      compadd A B C D
      ;;
    del-module|move-module|set-module-color|set-module-name|set-module-mode|\
    add-cable|del-cable|set-cable-color|set-param|set-param-label|add-module)
      case $CURRENT in
        2) compadd A B C D ;;
        3) compadd va fx ;;
      esac
      ;;
    copy-variation)
      case $CURRENT in
        2) compadd A B C D ;;
        3|4) compadd 0 1 2 3 4 5 6 7 8 ;;
      esac
      ;;
    variation)
      case $CURRENT in
        2) compadd 1 2 3 4 5 6 7 8 ;;
        3) compadd A B C D ;;
      esac
      ;;
    set-patch-name)
      (( CURRENT == 2 )) && compadd A B C D
      ;;
    set-master-clock-run)
      (( CURRENT == 2 )) && compadd 0 1
      ;;
    set-master-clock-bpm)
      ;;
    set-patch-description)
      (( CURRENT == 2 )) && compadd A B C D
      ;;
    get-resources)
      (( CURRENT == 2 )) && compadd A B C D
      ;;
    voice-mode|voice-count)
      case $CURRENT in
        2) compadd A B C D ;;
        3) [[ $service == voice-mode ]] && compadd 0 1 2 3 || compadd {1..32} ;;
      esac
      ;;
    set-perf-mode)
      compadd patch performance
      ;;
    set-slot-enabled|set-slot-key)
      case $CURRENT in
        2) compadd A B C D ;;
        3) compadd 0 1 ;;
      esac
      ;;
    list)
      (( CURRENT == 2 )) && compadd patches performances
      ;;
    verbose|debug)
      (( CURRENT == 2 )) && compadd on off
      ;;
  esac
}

(( $+functions[compdef] )) || { autoload -Uz compinit && compinit; }
compdef _g2_complete "${_G2_CMDS[@]}" stop start help exit

# TAB completion: at command position only offer G2 commands, not all system commands
_g2_tab_complete() {
  if (( CURRENT == 1 )); then
    compadd -- "${_G2_CMDS[@]}" stop start help exit
  else
    _main_complete "$@"
  fi
}
zle -C _g2_complete_widget complete-word _g2_tab_complete
bindkey '^I' _g2_complete_widget

# Minimal prompt: drop theme hooks (e.g. powerlevel10k) and path/git info, just '>'
precmd_functions=("${(@)precmd_functions:#_p9k_*}")
preexec_functions=("${(@)preexec_functions:#_p9k_*}")
unset RPROMPT RPS1
PROMPT='> '

print "G2 shell ready. 'start'/'stop' to control daemon, 'debug on'/'debug off' to toggle send-message logging, 'help' to list commands, 'exit' to quit."
