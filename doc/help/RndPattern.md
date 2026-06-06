# RndPattern (Random Pattern)

The RndPattern generator produces short repeating sequences of either random values or random state signals. Length of the sequences can be set by the Length control. This module is similar in its core to the modulatable clocked random signal module. The difference is that this module has an internal clock rate divider prepatched internally to the Rst input. There are over 32000 different patterns with a maximum length of 128 steps, presettable by the A and B pattern and the Length controls. By connecting control signals to the A and B inputs the control signal values will set the pattern to be played. These control values are added to the values set by the A and B controls, expanding the pattern range to many millions of possible patterns. Two different types of pattern are available, one based on the Character Type 1 random sequence and one based on the RndTrig random sequence. If the output wave shape is set to random trigger mode, the clocking gate signal will pass through to the output in the same way as descibed by the RndTrig module, though with a signal alternating between -64 and +64 units.

## Parameters (alphabetical)

### Active
Toggles the module on/off.

### LoopCount
Sets the number of steps in the pattern (1-128).

### OutputType
Selects between different output modes.

### PatternA
Sets the pattern number MSB value.

### PatternB
Sets the pattern number LSB value.

### StepProb
Sets the probability for each step in the random sequence.

### StepProbMod
Modulation amount for the StepProb parameter.

## Inputs

### A (blue)
Adds to the PatternA value to select the current pattern.

### B (blue)
Adds to the PatternB value to select the current pattern.

### Clk (orange)
Clock input that advances the pattern step.

### Rst (orange)
Resets the pattern to step 1.

### StepProb (blue)
Modulates the step probability.

## Outputs

### Out (purple)
The random pattern output signal.