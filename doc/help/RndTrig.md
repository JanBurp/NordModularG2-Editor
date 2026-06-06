# Random Trig (RndTrig)

The random trigger module produces a yellow pulse or gate output signal at a state that is either a logic HIGH or logic LOW. The output signal can be used directly to trigger yellow Trigger or Gate inputs. Note that when using the output signal as an analog (to a blue or red input) control signal, the output alternates between a logic LOW or 0 units for the OFF state and a logic HIGH or +64 units for the ON state.

For every new pulse it is decided if it is passed to the output or not, making the output signal equal in ON duration to the ON duration of the input pulse signal. This means that if gate signals of different lengths are used to clock this module, the length of the current gate signal is left unaltered if the module decides to "pass" this current clocking gate signal to the output of the module.

## Parameters (alphabetical)

### Active
Enables or disables the module. When active, the module processes incoming clock pulses according to the probability setting. When disabled, no output pulses are generated.

### PolyMono
Selects between poly and mono operation modes.

### StepProb
Sets the base probability that a clocked input pulse will be passed to the output. When StepProbMod is at zero, this is the effective probability. Higher values increase the likelihood that an output pulse will be generated on each clock.

### StepProbMod
Modulation amount for the step probability. Allows the probability to be modulated by an external signal connected to the Prob input.

## Inputs

### Clk
Orange clock/trigger input. Each rising edge on this input triggers a decision of whether to pass a pulse to the output based on the current probability setting.

### Prob
Purple probability modulation input. This input modulates the effective probability around the StepProb value. When StepProbMod is set high, changes to this input have a greater effect on the output probability.

### Rst
Orange reset input. A trigger or gate on this input resets the internal state of the random generator.

### Seed
Purple seed input. Provides a seed value that influences the random sequence. Different seed values produce different random patterns.

## Outputs

### Out
Orange output. Outputs either a gate/trigger pulse (logic HIGH +64 units) or remains at logic LOW (0 units) for the OFF state, depending on whether the current clock was selected by the probability algorithm to be passed.