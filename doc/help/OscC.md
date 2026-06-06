# OscC

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

This oscillator produces one of six available waveforms. It also has two pitch modulation inputs. The oscillator has the same waveforms as OscA but uses less Patch Load because of the waveform drop-down selector, meaning that waveforms must be preselected in the Editor program.

## Common Oscillator Parameters

**WAVEFORM DROP-DOWN SELECTORS:** Some oscillators feature drop-down waveform selectors. The different waveforms of these oscillators are not instantly available as in the "radio button" oscillators described above. Waveforms from the drop-down menu must be preselected in the Editor program. Selecting another waveform in the Editor will force the G2 to optimize the DSPs and will cause a brief moment of silence. The advantage of this is that these oscillators use less Patch Load.

Note that Oscillators with drop-down waveform selectors will use the preselected waveform in all 8 Variations. If you want different waveforms in different Variations, use oscillators with radio buttons instead.

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

**FM LIN/FM TRK:** Some oscillators feature an FM scroll button in combination with an FM input and an attenuator.

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

**FmAmount** (Level_100)
FM modulation amount.

**Active** (ActiveMonitor)

**FmMode** (FmLinTrk)
FM mode selector (Linear FM / FM Track).

**PitchMod** (Level_100)
Pitch modulation amount.

**Waveform** (OscWaveform_2)
Waveform selector (drop-down).

## Inputs

**PitchVar** (purple)
Pitch variation modulation input.

**Sync** (red)
Sync modulation input.

**FmMod** (red)
FM modulation input.

**Pitch** (purple)
Pitch modulation input.

## Outputs

**Out** (red)
Signal: Bipolar