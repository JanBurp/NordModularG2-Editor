# EnvH (Envelope Hold)

This is a Hold Envelope that can be used to gate an audio signal for a specified duration. It has a Hold time control and an AM input. The Hold Envelope has an immediate attack and decay times. This means that when the Hold Envelope is used for controlling the amplitude of an audio signal, there may be a clicking sound at the beginning and end, due to the immediate attack and decay times. If you want to be able to control Attack and Release times, check out the EnvADR or EnvAHD. See also "Common Envelope Generator parameters".

## Parameters

### Hold
Sets the time the envelope should remain at maximum level. The hold time is milliseconds or seconds in the corresponding display box. Range: 0.5 ms to 45 s.

### OutputType
Controls the output signal type. Can be set to positive, negative, or inverted modes.

## Inputs

### Trig
Trigger input (yellow). Starts the envelope cycle when a signal is received.

### AM
Amplitude Modulation input (blue). Allows external control of the envelope amplitude.

### In
Signal input (purple). The audio signal to be gated by the envelope.

## Outputs

### Env
Envelope output (blue). Outputs the envelope control signal.

### Out
Main output (purple). Outputs the gated audio signal.