# Envelope Decay (EnvD)

This is a Decay Envelope. It has a Decay time control and an AM modulation input. The attack time of the Decay Envelope is immediate, which makes it suitable for controlling the amplitude of percussive and click sounds where a click at the start of the sound is desirable. The Env output signal can be used as audio e.g. to generate rhythmic audio clicks. Other applications could be to control Pitch, Filter and FM modulation. If you want to be able to control Attack time, check out the "EnvADR". See also "Common Envelope Generator parameters".

## Parameters

### Decay
Sets the decay time. After the envelope has completed the attack part, it will drop down to the sustain level with the decay time. The decay is exponential. Range: 0.5 ms to 45 s.

### OutputType
Sets the output type.

## Inputs

### Trig
Trigger input (yellow).

### AM
Amplitude Modulation input (blue).

### In
Signal input (purple).

## Outputs

### Env
Envelope output (blue).

### Out
Signal output (purple).