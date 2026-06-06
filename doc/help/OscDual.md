# OscDual

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

The Dual Oscillator produces pulse and sawtooth waveforms and a suboctave with a square waveform. Three mixer knobs set the blend of the three waveforms on the output of the oscillator. The pulse width of the pulse oscillator and the phase of the sawtooth signal can be modulated. The Soft button reduces the overtone content of the suboctave, making the suboctave sound warmer.

**EXAMPLE OF THE OSCDUAL:** The Dual Oscillator is perfect for creating those classic "analog" polysynth sounds. Connect the modules according to the figure to the right and you're there. The LfoC1 triangle controls the width of the Pulse wave while the LfoC2 sawtooth modulates the Phase of the Sawtooth wave which gives the sound a subtle unisono effect (similar to the modulation example of the DualSaw on OscB). Note that the Phase knob must be exactly in the central position to avoid clicks in the sawtooth. The Lfo rates are controlled by the keyboard morph group to get a balanced unisono chorusing effect over the keyboard range.

Note that this example patch can be played with 24 voices on an unexpanded G2.

## Common Oscillator Parameters

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

**SYNC MODULATION:** The Sync input is used for synchronizing the oscillator.

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

**SqrLevel** (Level_100)
Square wave level.

**PWMod** (Level_100)
Pulse width modulation amount.

**SawLevel** (Level_100)
Sawtooth wave level.

**SawPhase** (Phase)
Sawtooth phase control.

**SubOctLevel** (Level_100)
Sub-octave level.

**Active** (ActiveMonitor)

**SqrPW** (PW)
Square wave pulse width.

**PhaseMod** (Level_100)
Phase modulation amount.

**Soft** (OffOn)
Soft button - reduces overtone content of suboctave.

## Inputs

**Pitch** (purple)
Pitch modulation input.

**PitchVar** (purple)
Additional pitch modulation input.

**Sync** (red)
Sync modulation input.

**PW** (red)
Pulse width modulation input.

**Phase** (red)
Phase modulation input.

## Outputs

**Out** (red)
Signal: Bipolar