# Envelope ADDSR (EnvADDSR)

This is an enhanced ADSR envelope featuring Attack, Decay, Break, Decay, Break and Release controls. The sustain segment is selectable between the first and second Break stage. The Env output signal can be used as audio or to control Pitch, Filter, FM modulation and other parameters. See also "Common Envelope Generator parameters".

## Parameters

### Attack
Sets the attack time. Range: 0.5 ms to 45 s.

### Decay1
Sets the first decay time. After the attack part, the envelope will drop down to Level1 with this decay time. The decay is exponential.

### Decay2
Sets the second decay time. After the first decay, the envelope will drop down to Level2 with this decay time.

### KB
Keyboard trigger on/off. When on, the envelope restarts each time a new note is received.

### Level1
Sets the level after the first decay. The L1 or L2 segment can be selected to act as sustain stage and will then represent the level at which the envelope will be held when the Gate signal is high.

### Level2
Sets the level after the second decay. The L1 or L2 segment can be selected to act as sustain stage and will then represent the level at which the envelope will be held when the Gate signal is high.

### NR
Norm/Release mode. When off (Norm), the envelope completes the release phase after the gate goes low. When on (Release), the envelope immediately jumps to the release phase.

### OutputType
Sets the output type.

### Release
Sets the release time. When the Gate signal goes low, the envelope will drop from the current level to zero with this release time.

### Shape
Controls the curvature of the envelope stages.

### SustainMode
Sustain mode. Click to select stage L1 or L2 as the sustain segment.

## Inputs

### AM
Amplitude Modulation input (blue).

### Gate
Gate/trigger input (yellow).

### In
Signal input (purple).

## Outputs

### Env
Envelope output (blue).

### Out
Signal output (purple).