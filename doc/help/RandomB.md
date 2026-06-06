# RandomB

The modulatable random wave shape module is quite similar to the LfoA module in Random Steps or Random waveform mode, but with the added Step and Edge controls to fine-tune the random wave shapes or sequence of random values. The rate can be easily modulated by applying a varying control signal to the Pitch input that has the modulation depth knob.

## Parameters (alphabetical)

### Active
Determines whether the LFO is running or muted.

### Edge
Selects the edge shape of the random output: Triangle, Saw, Square, or S&H (Sample & Hold).

### Kbt
Keyboard tracking. When enabled, the LFO rate is tied to the keyboard pitch.

### OutputType
Selects unipolar (0 to +1) or bipolar (-1 to +1) output range.

### PolyMono
Selects poly or mono mode. In mono mode, a single random generator drives all voices. In poly mode, each voice has its own random generator.

### Rate
Sets the basic LFO rate.

### RateMod
Modulation depth for the Rate input. Controls how much the incoming modulation signal affects the LFO rate.

### Range
Selects the frequency range: Lo, Med, or Hi.

### StepProb
Step probability. Controls how often new random values are generated. Lower values produce more stable, slowly changing patterns; higher values create more erratic, rapidly changing sequences.

## Inputs

### Rate
Pitch modulation input for controlling the LFO rate.

### RateVar
Additional modulation input for varying the LFO rate.

## Outputs

### Out
The random waveform output signal.