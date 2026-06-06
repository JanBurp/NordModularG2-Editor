# OscString

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

The String Oscillator is a little different from the other oscillators. One significant difference is that it requires a short burst of audio on the red input to be able to produce sound. The String Oscillator is basically a delay line with feedback tuned to the keyboard, with controls for decay and damping of the feedback signal. The String Oscillator is ideal for simulating plucked strings. With this module it's quite easy to simulate an acoustic string instrument like a nylon-string guitar.

**DECAY:** Set the decay time of the internal feedback signal through the delay line. The higher the decay value, the longer it will take for the signal to decay to silence.

**DAMP:** Set the high frequency damping of the internal feedback signal through the delay line. The higher the damp value, the more mellow the signal.

**EXAMPLE OF THE OSCSTRING:** The String Oscillator requires some sort of input signal or a pulse to start oscillating. In this example a plucked string instrument is simulated. Feed a short noise burst through an AHD Envelope to the input of the StringOsc. Set all the module parameters according to the picture and you will get sort of a "plucked or hammered string" sound when you play the keyboard. The keyboard morph group is used on the Decay of the String Oscillator and the Hold time of the EnvAHD to get a more balanced sound over the keyboard range.

## Common Oscillator Parameters

**SEMI/FREQ/FAC/PART SCROLL BUTTON:** Click this button to switch the frequency control modes between Semitone, Frequency, Partial and Factor mode.

**THE SEMI (OR FREQ/PART/FAC) KNOB:** Changes the coarse tuning of the oscillator.

**THE CENT KNOB:** Adjust the fine tuning of the oscillator.

**PITCH MODULATION:** There are one or more DYNAMIC CONTROL/AUDIO inputs for modulating the pitch on the oscillators.

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

**Decay** (Level_100)
Decay time of internal feedback signal.

**Moisture** (Level_100)
High frequency damping (Damp).

**Active** (ActiveMonitor)

## Inputs

**In** (red)
Audio input - requires a short burst to start oscillating.

**Pitch** (blue)
Pitch modulation input.

**PitchVar** (blue)
Additional pitch modulation input.

## Outputs

**Out** (red)
Signal: Bipolar