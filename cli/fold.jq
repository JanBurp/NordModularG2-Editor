# fold.jq -- pretty-print JSON with colors and a timestamp, folding small/scalar-only
# values inline. No external JSON/color library is used: colors and folding are
# hand-rolled here with plain ANSI escape codes (\u001b = ESC) -- see cli/g2tmux.sh header.
#
# "hex"/"data" values (raw USB hex, sample arrays) are truncated (HEXDATA_STRLEN chars /
# HEXDATA_ARRLEN elements, each followed by "...") so they always render on a single
# visual line, never wrapping across rows. Disabling terminal autowrap (DECAWM) was tried
# and rejected -- it just clips/overwrites long values instead of making them scrollable,
# since tmux panes have no hidden off-screen columns. Truncation is the only way to
# guarantee one line on any pane width; the full untruncated value is still in the
# daemon's JSON stream/log, just not in this pretty-printed view. Exception: while the
# daemon's runtime debug flag is on (toggled live via the "debug" command, which echoes
# back {"debugOn":true/false} on every change), hex/data is shown full/untruncated for
# *all* messages -- this is tracked as running state across the whole input stream below
# (jq is invoked with -n so this script reads "inputs" itself instead of being re-run
# per message), since seeing exact bytes is the point of debug mode.
#
# A "hex"/"data" key only gets this flat/truncated treatment when its value is itself a
# string or array (the raw payload). When it's an object (e.g. a slot dump that nests its
# own "data" hex string inside {"slot":...,"data":"..."}), it's rendered normally so the
# truncation rule is applied to the *nested* hex/data field instead of skipping it.
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

def HEXDATA_STRLEN: 16;
def HEXDATA_ARRLEN: 8;
def COMPACT_MAX: 80;

def colorScalar:
  if (. | type) == "string" then strColor + (. | tojson) + reset
  elif (. | type) == "number" then numColor + (. | tojson) + reset
  elif (. | type) == "boolean" then boolColor + (. | tojson) + reset
  elif (. | type) == "null" then nullColor + "null" + reset
  else (. | tojson)
  end;

def isHexDataKey(k; v): (k == "hex" or k == "data") and ((v | type) == "string" or (v | type) == "array");

def renderFlat(v; full):
  if (v | type) == "string" then
    (if (full | not) and (v | length) > HEXDATA_STRLEN then v[0:HEXDATA_STRLEN] + "..." else v end) as $s
    | strColor + ($s | tojson) + reset
  elif (v | type) == "array" then
    (punct + "[" + reset)
    + ((if (full | not) and (v | length) > HEXDATA_ARRLEN then v[0:HEXDATA_ARRLEN] else v end) | map(colorScalar) | join(", "))
    + (if (full | not) and (v | length) > HEXDATA_ARRLEN then ", " + nullColor + "..." + reset else "" end)
    + (punct + "]" + reset)
  else v | colorScalar
  end;

def renderInline(v; full):
  if (v | type) == "array" then
    if (v | length) == 0 then punct + "[]" + reset
    else (punct + "[" + reset) + (v | map(renderInline(.; full)) | join(", ")) + (punct + "]" + reset)
    end
  elif (v | type) == "object" then
    if (v | length) == 0 then punct + "{}" + reset
    else
      (punct + "{ " + reset) + (v | to_entries | map(
        keyColor + (.key | tojson) + reset + (punct + ": " + reset)
        + (if isHexDataKey(.key; .value) then renderFlat(.value; full) else renderInline(.value; full) end)
      ) | join(", ")) + (punct + " }" + reset)
    end
  else v | colorScalar
  end;

def fits: (. | tojson | length) <= COMPACT_MAX;

def render(v; ind; full):
  if (v | type) == "array" or (v | type) == "object" then
    if (v | fits) then v | renderInline(.; full)
    elif (v | type) == "array" then
      if (v | length) == 0 then punct + "[]" + reset
      else (punct + "[\n" + reset) + (v | map(ind + "  " + render(.; ind + "  "; full)) | join(",\n")) + "\n" + ind + (punct + "]" + reset)
      end
    else
      (punct + "{\n" + reset) + (v | to_entries | map(
        ind + "  " + keyColor + (.key | tojson) + reset + (punct + ": " + reset)
        + (if isHexDataKey(.key; .value) then renderFlat(.value; full) else render(.value; ind + "  "; full) end)
      ) | join(",\n")) + "\n" + ind + (punct + "}" + reset)
    end
  else
    v | colorScalar
  end;

def timestamp: timeColor + "[" + (now | localtime | strftime("%H:%M:%S")) + "] " + reset;

foreach inputs as $msg (
  false;
  if ($msg | has("debugOn")) then $msg.debugOn else . end;
  . as $debugOn
  | $msg
  | select(.type != "led_data" and .type != "volume_data")
  | (.debug == "send") as $isSend
  | timestamp + (if $isSend then "-> " else "" end) + render(.; ""; $debugOn)
)
