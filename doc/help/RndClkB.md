# Random Clock B (RndClkB)

The modulatable clocked random signal module produces a new random value each time it receives a trigger pulse on its Clk input. Using the Rst input and the Seed input will randomize the module to a position in the pseudorandom sequence that is set with the value on the Seed input. Step settings can be modulated by a control signal on its input, setting the amount of modulation is done with the modulation depth knob.

## Parameters (alphabetical)

### Active
Enables or disables the module. When active, the module processes clock triggers and generates random output values.

### Character
Selects the random generation algorithm. Rnd 1 is virtually free of motifs and produces more uniform random distribution. Rnd 2 exhibits clusters of values that show some similarities, creating a less predictable pattern.

### OutputType
Controls the output signal range. Bip toggles between unipolar (0 to positive) and bipolar (negative to positive) output modes.

### PolyMono
Selects between polyphonic and monophonic operation modes for the random generator.

### StepProb
Sets the probability percentage for a new random value to be generated on each clock trigger. Lower values produce sparser random events.

### StepProbMod
Sets the modulation depth for the Step input. This controls how much the signal connected to the Step input affects the step probability.

## Inputs

### Clk (orange)
Accepts a clock waveform. Every time the signal transitions from a zero or negative value to a positive value, the output of the clocked random generator changes to a new random value.

### Rst (orange)
Reset input. When triggered, resets the random generator to its initial state. When a control signal is connected to the Seed input, the trigger on the Rst input causes the module to start at a different position in the sequence.

### Seed (purple)
Seed input. The value on this input determines the starting position in the pseudorandom sequence when the Rst input is triggered.

### Step (blue)
Modulation input for the step probability. The amount of effect is controlled by the StepProbMod parameter.

## Outputs

### Out (purple)
Outputs the randomly generated value each time a clock trigger is received.