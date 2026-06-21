#!/bin/zsh
# g2-daemon-view.sh — run the daemon, splitting LED/VU traffic from everything else
# LED/VU messages (type led_data/volume_data) go to a FIFO for a separate viewer pane.
# All other messages are pretty-printed JSON on stdout.

DIR="$(cd "$(dirname "$0")" && pwd)"
LED_FIFO=/tmp/g2-ledvu-fifo

[ -p "$LED_FIFO" ] || mkfifo "$LED_FIFO"

cd "$DIR" && ./daemon.sh start "$@" \
  | tee >(jq --unbuffered -c 'select(.type=="led_data" or .type=="volume_data")' > "$LED_FIFO") \
  | jq --unbuffered -r -f "$DIR/fold.jq"
