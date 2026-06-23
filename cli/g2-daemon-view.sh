#!/bin/zsh
# g2-daemon-view.sh — run the daemon, splitting LED/VU traffic from everything else
# LED/VU messages (type led_data/volume_data) go to a FIFO for a separate viewer pane.
# All other messages are pretty-printed JSON on stdout.
#
# Every line is also appended, with a plain ms-resolution timestamp prefix and no ANSI
# colors, to daemon.log — open/tail that file in a normal editor/terminal instead of
# copy-pasting from the tmux pane (which mangles colors and folded/wrapped lines).

DIR="$(cd "$(dirname "$0")" && pwd)"
LED_FIFO=/tmp/g2-ledvu-fifo
LOG_FILE="$DIR/daemon.log"

[ -p "$LED_FIFO" ] || mkfifo "$LED_FIFO"

cd "$DIR" && ./daemon.sh start "$@" \
  | tee >(jq --unbuffered -c 'select(.type=="led_data" or .type=="volume_data")' > "$LED_FIFO") \
  | tee >(jq --unbuffered -r '. as $line | (now*1000|floor) as $ms | (($ms/1000)|floor|localtime|strftime("%H:%M:%S")) + "." + (($ms % 1000)|tostring|if length==1 then "00"+. elif length==2 then "0"+. else . end) + " " + ($line|tostring)' > "$LOG_FILE") \
  | jq --unbuffered -n -r -f "$DIR/fold.jq"
