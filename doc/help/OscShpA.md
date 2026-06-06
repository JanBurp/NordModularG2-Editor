# OscShpA

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

This Shape oscillator is able to generate a vast variety of waveform shapes. There are six basic waveforms to choose from. Since you can transform and modulate the shape of each of these waveforms, it's possible to generate very interesting signals with very varying harmonic content. The principle for all Sinewave based signals is to start with a signal with a pure sinewave and then, by gradually transforming the signal, adding more overtones and creating a more complex and rich signal. The sonic result of changing the shape is similar to running a complex signal through a filter and changing the cutoff frequency. The oscillator also has inputs for modulating pitch and frequency (FM) as well as sync.

**WAVEFORMS AND SHAPES:**

- **Sine1:** Phase modulated sine wave. At 50% Shape setting, the signal is a perfect sine wave and at 99% similar to a sawtooth wave. When the Shape is modulated with negative values, the signal is "mirrored".

- **Sine2:** Sine -> Double Sine signal. At 50% Shape setting, the signal is a pure sine wave and at 99% Shape setting, the first half of the period almost covers the entire period length and the second half is a very narrow "spike". When the Shape is modulated with negative values, the signal is "mirrored".

- **Sine3:** Sine -> Even harmonics signal. At 50% Shape setting, the signal is a perfect sine wave and at 99% a lot of even harmonics have been added. When the Shape is modulated with negative values, the signal is limited at pure sine wave shape.

- **Sine4:** Sine -> Odd harmonics signal. At 50% Shape setting, the signal is a perfect sine wave and at 99% a lot of odd harmonics have been added. When the Shape is modulated with negative values, the signal is limited at pure sine wave shape.

- **TriSaw:** Triangle -> Sawtooth signal. At 50% Shape setting, the signal is a perfect Triangle and at 99% a perfect Sawtooth. When the Shape is modulated with negative values, the signal is "mirrored".

- **SymPulse:** Pulse with selectable SYMMETRIC pulse width. At 50% Shape setting, the signal is a perfect Square, at 75% a Pulse with 25% symmetric pulse width and at 99% a Pulse with 1% symmetric pulse width. When the Shape is modulated with negative values, the signal is "mirrored".

## Common Oscillator Parameters

**WAVEFORM DROP-DOWN SELECTORS WITH GRAPHS:** The Shape Oscillators have drop-down waveform selectors with a graphical display of the wave shape that shows how the waveform changes when tweaking the Shape knob. Waveforms from the drop-down menu must be preselected in the Editor program.

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

**SYNC MODULATION:** The Sync input is used for synchronizing the oscillator.

**FM LIN/FM TRK:** Some oscillators feature an FM scroll button in combination with an FM input and an attenuator.

**SHAPE AND SHAPE MODULATION:** Use the Shape knob to set the initial shape of waveform.

**KBT:** KBT, KeyBoard Tracking, is the internal connection between the oscillator and the keyboard.

**ON/OFF:** Click to mute the output of the oscillator. Blue button color indicates that the oscillator is ON

**OUTPUT:** The signal output on the oscillator. Signal: BIPOLAR

## Parameters

**FreqCoarse** (FreqCoarse)
Coarse frequency tuning.

**FreqFine** (FreqFine)
Fine frequency tuning (Cent).

**Kbt** (Kbt_1)
KBT, KeyBoard Tracking.

**PitchMod** (Level_100)
Pitch modulation amount.

**FreqMode** (FreqMode_3)
Frequency mode selector (Semitone/Frequency/Partial/Factor).

**FmAmount** (Level_100)
FM modulation amount.

**FmMode** (FmLinTrk)
FM mode selector (Linear FM / FM Track).

**Shape** (PW)
Shape control (with graph display).

**ShapeMod** (Level_100)
Shape modulation amount.

**Waveform** (OscShpA_Waveform)
Waveform selector (drop-down with graph).

**Active** (ActiveMonitor)

## Inputs

**Pitch** (purple)
Pitch modulation input.

**PitchVar** (purple)
Additional pitch modulation input.

**Sync** (red)
Sync modulation input.

**FmMod** (red)
FM modulation input.

**ShapeMod** (red)
Shape modulation input.

## Outputs

**Out** (red)
Signal: Bipolar