# OscNoise (Noise Oscillator)

The noise oscillator produces a narrow band of noise. The bandwidth can be so narrow that the noise will have a distinct pitched character, sounding like a noisy sine wave.

## Parameters

### Active
Switches the oscillator on/off.

### FreqCoarse
Sets the base frequency of the noise band (Semi, Freq, Fac, or Part mode).

### FreqFine
Fine tune adjustment in cents (active in Freq mode).

### FreqMode
Selects frequency scaling mode: Semi (semitones), Freq (Hz), Fac (multiplier), or Part (partial/overtone).

### Kbt
Keyboard tracking - when enabled, the frequency follows the keyboard pitch.

### PitchMod
Modulation amount for the Pitch input.

### Width
Sets the bandwidth of the noise band. At minimum, produces a narrow band with a distinct pitched character. Fully open, the bandwidth spans about two octaves.

### WidthMod
Modulation amount for the Width input.

## Inputs

### Pitch
Pitch CV input (1V/octave).

### PitchVar
Pitch variation/modulation input.

### Width
Width (bandwidth) modulation input.

## Outputs

### Out
Noise signal output.