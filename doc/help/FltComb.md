# FltComb (Comb Filter)

A comb filter with adjustable feedback and selectable frequency response type. Note that the Comb filter uses DSP audio delayline memory.

## Parameters

### FREQ Knob

Sets the distance, in Hz, between the peaks and notches in the comb filter response.

### FB Knob

Controls the signal feedback to the comb filter. Can be negative or positive. At the 12 o'clock position feedback is zero. Click the green triangle above the knob to reset feedback to 0. The feedback can be modulated from an external source using the blue control signal input and the level attenuator (Attenuator Type I).

### TYPE Selector

Click to select Notch, Peak, or Deep mode:
- **Notch** — Signal notches are attenuated
- **Peak** — Signal peaks are amplified
- **Deep** — Signal notches and peaks are both attenuated and amplified

The frequency characteristics for each mode are displayed in the module's graph.

### LEVEL Knob

Input level attenuator (Attenuator Type I) located to the right of the module.