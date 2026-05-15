#!/bin/zsh
# g2tmux.sh — start G2 tmux environment
# Left pane: daemon output  |  Right pane: command shell with autocomplete
# Usage: ./g2tmux.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="g2"

tmux kill-session -t "$SESSION" 2>/dev/null

tmux new-session -d -s "$SESSION"
tmux rename-window -t "$SESSION:0" "G2"
tmux send-keys -t "$SESSION:0.0" "cd '$DIR' && ./daemon.sh start" Enter

tmux split-window -h -t "$SESSION:0"
tmux send-keys -t "$SESSION:0.1" "cd '$DIR' && source ./g2shell.zsh" Enter

tmux select-pane -t "$SESSION:0.1"
tmux attach-session -t "$SESSION"
