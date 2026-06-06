# OscB

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

OscillatorB can produce one of five waveforms: Sine, Triangle, Sawtooth, Pulse with selectable asymmetric pulse width, Pulse with selectable symmetric pulse width and DualSaw. The oscillator has two pitch modulation inputs, one frequency modulation input, one sync modulation input and a Shape modulation input.

**SHAPABLE WAVEFORMS:** The fourth waveform is Pulse with selectable pulse width. This is the type of waveform found in most analog synthesizers. At 50% Shape setting, the signal is a perfect Square, at 75% a Pulse with 25/75% pulse width and at 99% a Pulse with 1/99% pulse width. When the Shape is modulated with negative values, the signal is "mirrored".

The fifth waveform is a DualSaw. At 50% Shape setting, the signal consists of two Sawtooth waves in phase with each other, at 75% two Sawtooth waves slightly phase shifted and at 99% two Sawtooth waves 90 degrees phase shifted. When the Shape is modulated with negative values, the signal is "mirrored".

**EXAMPLE OF USING THE DUALSAW:** This is an example on how to use the DualSaw waveform to create the sound of two steadily detuned sawtooth waveforms. When a Lfo sawtooth is used and the Shape modulation knob is fully open the same signal is produced as when mixing two sawtooth oscillators (note that when the Shape modulation knob is not fully open it will cause clicks in the sound). One of the two oscillator sawtooths will have the normal pitch of the oscillator, while the other sawtooth is detuned by a frequency which is equal to the rate of the Lfo sawtooth. Depending on whether the Lfo sawtooth is sloping up or down the second oscillator sawtooth is detuned down or up. The detuning of the second sawtooth is an equal amount of Hz over the keyboard range, making the detuned sound too lively in the lower and too static in the higher frequency ranges. Assigning the keyboard morph to the Lfo rate knob can correct the detune, making the unisono effect sound more balanced over the whole keyboard range.

## Common Oscillator Parameters

**WAVEFORM RADIO BUTTONS:** Some oscillators feature waveform selectors of radio-button type. All waveforms instantly available after selection.

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator. The range is +/- half a semitone divided into 100 steps.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

**SYNC MODULATION:** The Sync input is used for synchronizing the oscillator with a control source. Synchronization forces the oscillator to restart its waveform cycle, in sync with the signal of the controlling device.

**FM LIN/FM TRK:** Some oscillators feature an FM scroll button in combination with an FM input and an attenuator. A signal on the FM input will affect the oscillator signal frequency according to the following: The Nord Modular G2 system features different types of FM. Using the FM input with the Lin/Trk option produces true linear FM, meaning that it is the actual (internal) linear frequency parameter of the oscillator that is modulated. The difference between FM Lin and FM Trk is that FM Lin causes a constant frequency deviation and FM Trk causes a constant modulation index over the keyboard range.

**SHAPE AND SHAPE MODULATION:** Use the Shape knob to set the initial shape of waveform.

**KBT:** KBT, KeyBoard Tracking, is the internal connection between the oscillator and the keyboard (and the MIDI input). If KBT is activated the oscillator will track the keyboard.

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

**Shape** (PW)
Shape/pulse width control.

**ShapeMod** (Level_100)
Shape modulation amount.

**Waveform** (OscBWaveform)
Waveform selector.

**Active** (ActiveMonitor)

**FmMode** (FmLinTrk)
FM mode selector (Linear FM / FM Track).

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