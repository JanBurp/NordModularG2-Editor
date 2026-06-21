#!/bin/zsh
# g2tmux.sh — start G2 tmux environment
# Left: LED/VU feed (top, small) + folded JSON daemon log (bottom)  |  Right: command shell with autocomplete
# Usage: ./g2tmux.sh
#
# JSON folding/coloring for the daemon log pane (bottom-left) is done by cli/fold.jq — a plain
# jq filter with hand-rolled ANSI color codes, not a separate JSON/color library/dependency.

DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="g2"
LED_FIFO=/tmp/g2-ledvu-fifo

tmux kill-session -t "$SESSION" 2>/dev/null
rm -f "$LED_FIFO"
mkfifo "$LED_FIFO"

tmux new-session -d -s "$SESSION"
tmux rename-window -t "$SESSION:0" "G2"
tmux split-window -h -t "$SESSION:0"
tmux split-window -v -b -l 6 -t "$SESSION:0.0"

# After splitting, panes settle as: 0.0 = LED/VU (top-left), 0.1 = daemon (bottom-left), 0.2 = shell (right)
tmux send-keys -t "$SESSION:0.0" "cat '$LED_FIFO' | jq --unbuffered -c ." Enter
tmux send-keys -t "$SESSION:0.1" "cd '$DIR' && ./g2-daemon-view.sh --debug" Enter
tmux send-keys -t "$SESSION:0.2" "cd '$DIR' && source ./g2shell.zsh" Enter

tmux select-pane -t "$SESSION:0.2"
tmux attach-session -t "$SESSION"
