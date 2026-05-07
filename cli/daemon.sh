#!/bin/zsh
# daemon.sh — control the g2-cli daemon from two terminals
#
# Terminal 1:  ./daemon.sh start           (foreground daemon, watch output here)
# Terminal 2:  ./daemon.sh <cmd> [args...] (send commands)
#              ./daemon.sh stop            (kill daemon)
#
# FIFO and keeper process auto-cleanup on exit.

G2CLI="$(cd "$(dirname "$0")" && pwd)/build/bin/g2-cli"
FIFO=/tmp/g2-cmd
ID_FILE=/tmp/g2-daemon-id
DAEMON_PID_FILE=/tmp/g2-daemon-pid
KEEPER_PID_FILE=/tmp/g2-daemon-keeper-pid

case "$1" in
  start)
    rm -f "$FIFO"
    mkfifo "$FIFO"
    echo 0 > "$ID_FILE"
    sleep 999999999 > "$FIFO" &
    echo $! > "$KEEPER_PID_FILE"
    trap 'kill "$(cat "$KEEPER_PID_FILE")" 2>/dev/null; rm -f "$FIFO" "$ID_FILE" "$DAEMON_PID_FILE" "$KEEPER_PID_FILE"' EXIT
    "$G2CLI" daemon < "$FIFO" &
    echo $! > "$DAEMON_PID_FILE"
    wait "$(cat "$DAEMON_PID_FILE")"
    ;;

  stop)
    kill "$(cat "$DAEMON_PID_FILE")" 2>/dev/null
    ;;

  *)
    id=$(( $(cat "$ID_FILE") + 1 ))
    echo "$id" > "$ID_FILE"
    cmd="$1"; shift
    args_json=""
    for arg in "$@"; do args_json+="\"$arg\","; done
    echo "{\"id\":$id,\"cmd\":\"$cmd\",\"args\":[${args_json%,}]}" > "$FIFO"
    ;;
esac
