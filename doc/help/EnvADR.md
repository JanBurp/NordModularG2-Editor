# EnvADR (Envelope ADR)

This is an envelope with two or three stages, Attack and Decay or Attack, Sustain and Release. In [Rel] mode, the Sustain level is fixed at maximum level for the duration of the Keyboard Gate pulse or pulse on the Gate input, turning the module into an ASR-type envelope generator. When in [Rel] mode the Gate/Trig button must be set to Gate, else the module will still work as when in [Dcy] mode.

## Parameters

### Attack
Sets the attack time. The attack stage raises the envelope signal from zero to maximum level.

### DcyRel
Click to change from Attack and Decay stages to Attack, Sustain and Release stages. The Sustain level is fixed at maximum level.

### KB
Keyboard gate control. When enabled, the envelope responds to keyboard gate signals.

### NR
Noise reduction setting for the envelope.

### OutputType
Sets the output type. Can be set to positive, negative, or inverted modes.

### Release
Sets the release time. After the sustain stage, the envelope drops to zero with the release time.

### Shape
Controls the shape of the envelope curve.

### TG
Gate/Trig scroll button. Select whether the envelope should be gated or trigged.

## Inputs

### AM
Amplitude Modulation input (blue). Allows external control of the envelope amplitude.

### Gate
Gate input (yellow). Controls the envelope trigger/gate operation.

### In
Signal input (purple). The audio or control signal to be processed by the envelope.

## Outputs

### End
Logic output (yellow). Sends out a logic HIGH signal as soon as the envelope has completed its stages and the envelope signal is back to zero units. This signal can be useful for gating or triggering other modules. Another interesting application is that you can connect this output directly to the Gate/Trig input and thus create a repeating envelope signal - like a sort of shapeable "LFO". You will have to set the Gate/Trig button to Trig for this to work. In this case the Envelope will restart itself after it has finished its envelope shape.

### Env
Envelope output (blue). Outputs the envelope control signal.

### Out
Signal output (purple). Outputs the processed signal.