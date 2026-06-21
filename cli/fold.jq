# fold.jq -- pretty-print JSON with colors and a timestamp, folding small/scalar-only
# values inline. No external JSON/color library is used: colors and folding are
# hand-rolled here with plain ANSI escape codes (\u001b = ESC) -- see cli/g2tmux.sh header.
#
# "hex"/"data" values (raw USB hex, sample arrays) are truncated (HEXDATA_STRLEN chars /
# HEXDATA_ARRLEN elements) so they always render on a single visual line, never wrapping
# across rows. Disabling terminal autowrap (DECAWM) was tried and rejected -- it just
# clips/overwrites long values instead of making them scrollable, since tmux panes have
# no hidden off-screen columns. Truncation is the only way to guarantee one line on any
# pane width; the full untruncated value is still in the daemon's JSON stream/log, just
# not in this pretty-printed view.
#
# Any object/array whose plain JSON is COMPACT_MAX chars or less (checked recursively,
# so small nested objects collapse too) renders on one line instead of being indented
# across multiple lines, to keep the log compact.
def reset: "\u001b[0m";
def keyColor: "\u001b[1;36m";
def strColor: "\u001b[32m";
def numColor: "\u001b[33m";
def boolColor: "\u001b[35m";
def nullColor: "\u001b[90m";
def punct: "\u001b[1m";
def timeColor: "\u001b[2m";

def HEXDATA_STRLEN: 40;
def HEXDATA_ARRLEN: 40;
def COMPACT_MAX: 80;

def colorScalar:
  if (. | type) == "string" then strColor + (. | tojson) + reset
  elif (. | type) == "number" then numColor + (. | tojson) + reset
  elif (. | type) == "boolean" then boolColor + (. | tojson) + reset
  elif (. | type) == "null" then nullColor + "null" + reset
  else (. | tojson)
  end;

def renderFlat(v):
  if (v | type) == "string" then
    (if (v | length) > HEXDATA_STRLEN
     then v[0:HEXDATA_STRLEN] + "...(" + ((v | length) - HEXDATA_STRLEN | tostring) + " more)"
     else v end) as $s
    | strColor + ($s | tojson) + reset
  elif (v | type) == "array" then
    (punct + "[" + reset)
    + ((if (v | length) > HEXDATA_ARRLEN then v[0:HEXDATA_ARRLEN] else v end) | map(colorScalar) | join(", "))
    + (if (v | length) > HEXDATA_ARRLEN
       then ", " + nullColor + "...(" + ((v | length) - HEXDATA_ARRLEN | tostring) + " more)" + reset
       else "" end)
    + (punct + "]" + reset)
  else v | colorScalar
  end;

def renderInline(v):
  if (v | type) == "array" then
    if (v | length) == 0 then punct + "[]" + reset
    else (punct + "[" + reset) + (v | map(renderInline(.)) | join(", ")) + (punct + "]" + reset)
    end
  elif (v | type) == "object" then
    if (v | length) == 0 then punct + "{}" + reset
    else
      (punct + "{ " + reset) + (v | to_entries | map(
        keyColor + (.key | tojson) + reset + (punct + ": " + reset)
        + (if (.key == "hex" or .key == "data") then renderFlat(.value) else renderInline(.value) end)
      ) | join(", ")) + (punct + " }" + reset)
    end
  else v | colorScalar
  end;

def fits: (. | tojson | length) <= COMPACT_MAX;

def render(v; ind):
  if (v | type) == "array" or (v | type) == "object" then
    if (v | fits) then v | renderInline(.)
    elif (v | type) == "array" then
      if (v | length) == 0 then punct + "[]" + reset
      else (punct + "[\n" + reset) + (v | map(ind + "  " + render(.; ind + "  ")) | join(",\n")) + "\n" + ind + (punct + "]" + reset)
      end
    else
      (punct + "{\n" + reset) + (v | to_entries | map(
        ind + "  " + keyColor + (.key | tojson) + reset + (punct + ": " + reset)
        + (if (.key == "hex" or .key == "data") then renderFlat(.value) else render(.value; ind + "  ") end)
      ) | join(",\n")) + "\n" + ind + (punct + "}" + reset)
    end
  else
    v | colorScalar
  end;

def timestamp: timeColor + "[" + (now | localtime | strftime("%H:%M:%S")) + "] " + reset;

select(.type != "led_data" and .type != "volume_data")
| timestamp + (if .debug == "send" then "-> " else "" end) + render(.; "")
