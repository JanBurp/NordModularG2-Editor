# ModAHD (Envelope Modulation AHD)

The AHDMod envelope is an Attack-Hold-Decay envelope with control signal inputs for modulating Attack, Hold and Release times. The Shape characteristics of this envelope is fixed to Linear Attack & Exponential Decay/Release.

Tip! This module can be used to create pulses with a modulatable length when the A and D times are set to very short and the Hold is modulated by a varying control signal. See also "Common Envelope Generator parameters".

Note: The A, D and R control inputs handle bipolar control signals. Positive control signals shorten the times and negative control signals increase the times. With the H parameter it is the other way around.

## Parameters (alphabetical)

### Attack
Envelope attack time.

### AttackMod
Attenuator for the Attack modulation input. Positive control signals shorten attack time; negative control signals increase it.

### Decay
Envelope decay time.

### DecayMod
Attenuator for the Decay modulation input. Positive control signals shorten decay time; negative control signals increase it.

### Hold
Envelope hold time.

### HoldMod
Attenuator for the Hold modulation input. Positive control signals shorten hold time; negative control signals increase it.

### KB
Keyboard trigger on/off. When enabled, the envelope retriggers based on keyboard input.

### OutputType
Selects unipolar, bipolar, inverted, or inverted bipolar output.

## Inputs

### AM
Amplitude modulation input.

### AttackMod
Bipolar control signal for modulating attack time.

### DecayMod
Bipolar control signal for modulating decay time.

### HoldMod
Bipolar control signal for modulating hold time.

### In
General input.

### Trig
Trigger input.

## Outputs

### Env
Envelope output.

### Out
Main output.

## Graph Display

This module includes a graphical envelope display showing the AHD envelope shape.