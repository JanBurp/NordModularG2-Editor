# LfoC

LFO C produces one of six selectable waveforms. The rate of the LFO can be modulated by an incoming control signal. LfoC uses a drop-down waveform selector, which reduces Patch Load compared to LfoA/LfoE. See "Common LFO parameters" for shared controls.

## Parameters (alphabetical)

### Active
Enables or disables the LFO. When active, the LED indicator lights.

### OutputType
Selects the output signal type: normal, inverted, or unipolar (offset above zero).

### PolyMono
Switches between Polyphonic and Monophonic LFO modes. In Poly mode, each voice has its own LFO cycle. In Mono mode, all voices share a single LFO.

### Range
Adjusts the frequency range of the LFO (slow to fast rates).

### Rate
Controls the speed of the LFO oscillation. Can be modulated via the Rate input.

### Waveform
Selects the LFO waveform shape from a drop-down menu:
- Triangle
- Sine
- Square
- Sawtooth
- Reverse Sawtooth
- Random (Sample & Hold)

## Inputs

### Rate
Modulation input that controls the LFO rate. A positive signal increases the frequency.

## Outputs

### Out
The LFO output signal. The waveform shape and amplitude depend on the Waveform and OutputType settings.