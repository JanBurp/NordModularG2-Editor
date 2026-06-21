# fold.jq -- pretty-print JSON with colors and a timestamp, folding scalar-only arrays inline.
# No external JSON/color library is used: colors and folding are hand-rolled here with
# plain ANSI escape codes (\u001b = ESC) inside this jq filter -- see cli/g2tmux.sh header.
#
# "hex"/"data" values (raw USB hex, sample arrays) are emitted as one unbroken token/line --
# we never insert manual newlines into them. If a value is wider than the pane, the terminal
# soft-wraps it visually across rows, but tmux still treats it as a single logical line: use
# tmux copy-mode (prefix + [) or `tmux capture-pane -J` to view/copy the unwrapped value.
# (Disabling terminal autowrap was tried and rejected -- it just clips/overwrites long values
# instead of making them scrollable, since tmux panes have no hidden off-screen columns.)
def reset: "\u001b[0m";
def keyColor: "\u001b[1;36m";
def strColor: "\u001b[32m";
def numColor: "\u001b[33m";
def boolColor: "\u001b[35m";
def nullColor: "\u001b[90m";
def punct: "\u001b[1m";
def timeColor: "\u001b[2m";

def colorScalar:
  if (. | type) == "string" then strColor + (. | tojson) + reset
  elif (. | type) == "number" then numColor + (. | tojson) + reset
  elif (. | type) == "boolean" then boolColor + (. | tojson) + reset
  elif (. | type) == "null" then nullColor + "null" + reset
  else (. | tojson)
  end;

def render(v; ind):
  if (v | type) == "array" then
    if (v | all(type != "object" and type != "array")) then
      (punct + "[" + reset) + (v | map(colorScalar) | join(", ")) + (punct + "]" + reset)
    elif (v | length) == 0 then punct + "[]" + reset
    else
      (punct + "[\n" + reset) + (v | map(ind + "  " + render(.; ind + "  ")) | join(",\n")) + "\n" + ind + (punct + "]" + reset)
    end
  elif (v | type) == "object" then
    if (v | length) == 0 then punct + "{}" + reset
    else
      (punct + "{\n" + reset) + (v | to_entries | map(ind + "  " + keyColor + (.key | tojson) + reset + (punct + ": " + reset) + render(.value; ind + "  ")) | join(",\n")) + "\n" + ind + (punct + "}" + reset)
    end
  else
    v | colorScalar
  end;

def timestamp: timeColor + "[" + (now | localtime | strftime("%H:%M:%S")) + "] " + reset;

select(.type != "led_data" and .type != "volume_data") | (timestamp + render(.; ""))
