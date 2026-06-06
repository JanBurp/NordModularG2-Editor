# OscMaster (Master Oscillator)

The Master Oscillator doesn't generate any audio signal. Instead, it generates a Pitch control signal which can be used to control other Oscillator modules on their Pitch inputs. The combination of the Master Oscillator with a number of other Oscillators makes it possible to simultaneously tune all connected Oscillators from the Master Oscillator instead of having to tune each individual connected Oscillator.

## Parameters

### FreqCoarse
Sets the base pitch in semi-tones. Modes: Semi, Freq, Fac and Part.

### FreqFine
Fine tune offset in cents (+/- 50 cents).

### Kbt
Keyboard tracking on/off. When enabled, the pitch follows the keyboard.

### PitchMod
Modulation amount for the pitch modulation input (0-100%).

### FreqMode
Selects frequency mode: Semi (semi-tone), Freq (frequency), Fac (frequency factor).

## Inputs

### Pitch
Pitch modulation input.

### PitchVar
Variable pitch modulation input.

## Outputs

### Out
Pitch control signal (purple). Connect to the Pitch input of other Oscillator modules to sync their tuning.