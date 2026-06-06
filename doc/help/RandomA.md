# RandomA (RandomA)

This random wave shape module produces a random waveform that is stepped when Edge is at 100%, slewed between steps for the settings 25%, 50%, and 75%, and a smoothly gliding random wave when Edge is at 0%. When Step is at 100% the difference between the current and the next random values can be quite big, while a Step setting of 25% generates much smaller steps. The rate of the module can be patched to track the keyboard by connecting the Pitch output on a Keyboard module to the Pitch input on this module.

## Parameters (alphabetical)

### Active

Enables or disables the random generation. When active, the module produces random output values according to the Rate, Edge, and StepProb settings.

### Edge

Controls how the random values transition between steps. At 0%, the output smoothly glides between random values. At 25%, 50%, and 75%, the transitions are increasingly slewed. At 100%, the output steps abruptly to each new random value.

### OutputType

Selects whether the output range is unipolar (0 to +1) or bipolar (-1 to +1).

### PolyMono

Selects whether the module operates in polyphone (multiple simultaneous voices) or monophone (single voice) mode.

### Rate

Controls the speed of the random waveform generation. Higher values produce faster changes between random values.

### Range

Sets the range of possible random values. Higher ranges allow for larger swings between consecutive random values.

### StepProb

Controls the probability that a new random value is generated at each step. At 100%, new random values occur at every step. Lower settings reduce the frequency of value changes.

## Inputs

### Rate

A blue input that controls the rate of the random waveform. This can be patched from a Keyboard module's Pitch output to track the keyboard.

## Outputs

### Out

A blue output that outputs the random waveform signal.