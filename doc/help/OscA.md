# OscA

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

This oscillator can produce one of six waveforms: Sine, Triangle, Sawtooth, Square, 25% Pulse or 10% Pulse. The oscillator has two pitch modulation inputs. See also "Common Oscillator parameters".

## Common Oscillator Parameters

**WAVEFORM RADIO BUTTONS:** Some oscillators feature waveform selectors of radio-button type. All waveforms instantly available after selection, which means that you can switch waveform without any interruption. This radio-button control can be assigned to a frontpanel knob to instantly select waveforms on the frontpanel.

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator. Ranges: depending on frequency display mode.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator. The range is +/- half a semitone divided into 100 steps. Click on the triangle above the knob to reset the fine tuning to the current coarse tuning value.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

**KBT:** KBT, KeyBoard Tracking, is the internal connection between the oscillator and the keyboard (and the MIDI input). If KBT is activated the oscillator will track the keyboard. If KBT is not activated, the keyboard will not affect the oscillator frequency.

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

**Waveform** (OscA_Waveform)
Waveform selector. The waveforms are: Sine, Triangle, Sawtooth, Square, 25% Pulse and 10% Pulse.

**Active** (ActiveMonitor)

## Inputs

**Pitch** (purple)
Pitch modulation input.

**PitchVar** (purple)
Additional pitch modulation input.

## Outputs

**Out** (red)
Signal: Bipolar