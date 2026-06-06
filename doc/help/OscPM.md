# OscPM

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

The Phase Modulation Oscillator uses the same basic technology for signal generation as the DX7. By constantly modulating the phase of a signal, an "FM" type of signal is generated. The frequency bands track the basic pitch similar to the 'FM Trk' modulation in OscB and C described above but with slightly different characteristics. The OscPH also features inputs for pitch modulation and sync.

With this type of FM it is actually the phase of the waveform which is modulated, which means that the waveform is shifted forwards and backwards at a fast audio rate. The advantage of this method is that the modulation is not sensitive for what is named a DC component in the modulating signal. A DC component shifts the waveform upwards or downwards, making its long term average a positive or negative level. With true linear frequency modulation a DC component can detune the oscillator, which happens with the oscillators with the FM Lin and FM Trk modes. But when the phase is modulated instead of the linear frequency parameter this detuning can never happen. This detuning is especially an issue when selfmodulation by feedback of the output to the modulation input is used. Selfmodulation works only reliable on this OscPM oscillator.

Tip! If the OscPM is set to 0 Hz in the Part tuning mode and initially reset by a short pulse on the Sync input (e.g. by using the Status module Var. Change output) this module can act as a sine function. To use this option, open the Phase Mod knob fully and add a linear mixer in front of the Phase Mod input. If the linear mixer knob is set to [6.3 (8)], a control signal between -64 and +64 units will cover exactly 360 degrees of a sine function. The sine value will be available on the output of the module.

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

**FreqMode** (FreqMode_3)
Frequency mode selector (Semitone/Frequency/Partial/Factor).

**PhaseMod** (Level_100)
Phase modulation amount.

**Active** (ActiveMonitor)

**PitchVar** (Level_100)
Pitch variation modulation amount.

**Waveform** (OscWaveform_2)
Waveform selector (drop-down).

## Inputs

**PitchVar** (purple)
Pitch variation modulation input.

**Sync** (red)
Sync modulation input.

**PhaseMod** (red)
Phase modulation input.

**Pitch** (purple)
Pitch modulation input.

## Outputs

**Out** (red)
Signal: Bipolar