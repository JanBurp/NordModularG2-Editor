# SeqEvent

Outputs gate signals in a sequence determined by clock input and step values.

## Parameters

**Step Value** (knob, per step 1–8)
Set the gate value for each step. Range: 0–127 units.

**Clock Mode** (buttons: Free / Tap1–8)
Set the clock mode.

## Inputs

| Port | Description |
|------|-------------|
| Clk  | Clock input |
| Rst  | Reset input |

## Outputs

| Port | Description |
|------|-------------|
| Out1 | Sequenced gate signal |

The sequencer advances through the steps on each clock pulse.