# ModADSR (Envelope Modulation ADSR)

The Mod Envelope is an ADSR envelope with control signal inputs for modulating Attack, Decay, Sustain and Release from external sources. The Shape characteristics of this envelope is fixed to Linear Attack and Exponential Decay/Release.

## Parameters

### Attack
Envelope attack time.

### Decay
Envelope decay time.

### Sustain
Envelope sustain level.

### Release
Envelope release time.

### AttackMod
Attenuator for the Attack modulation input. Positive control signals shorten attack time; negative control signals increase it.

### DecayMod
Attenuator for the Decay modulation input. Positive control signals shorten decay time; negative control signals increase it.

### SustainMod
Attenuator for the Sustain modulation input.

### ReleaseMod
Attenuator for the Release modulation input. Positive control signals shorten release time; negative control signals increase it.

### OutputType
Selects unipolar, bipolar, inverted, or inverted bipolar output.

### KB
Keyboard trigger on/off. When enabled, the envelope retriggers based on keyboard input.

## Inputs

### Gate
Gate/trigger input (yellow).

### AttackMod
Bipolar control signal for modulating attack time (blue).

### DecayMod
Bipolar control signal for modulating decay time (blue).

### SustainMod
Bipolar control signal for modulating sustain level (blue).

### ReleaseMod
Bipolar control signal for modulating release time (blue).

### In
General input (purple).

### AM
Amplitude modulation input (blue).

## Outputs

### Env
Envelope output (blue).

### Out
Main output (purple).