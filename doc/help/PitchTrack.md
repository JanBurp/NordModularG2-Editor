# PitchTrack

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

The Pitch Tracker module can transform the pitch of a monophonic audio input signal into a blue control signal on the Pitch output. The output control signal can be patched directly into a Pitch input of an oscillator or filter. The module features a Gate function with selectable threshold which produces a logic HIGH signal when the input level exceeds the Threshold value.

The Pitchtrack module uses an advanced tracking method that is a good trade off between speed, noise immunity and accuracy.

## Parameters

**Threshold** (Threshold_127)
Set the threshold level for the input signal to generate the Gate signal (see below).

## Inputs

**In** (purple)
The input of the PitchTrack module.

## Outputs

**Period** (orange)
Outputs a very short logic HIGH pulse every time a new pitch measurement value is available. Signal: Logic.

**Gate** (orange)
Outputs a logic HIGH signal when the input signal level exceeds the Threshold level (see below). Signal: Logic.

**Pitch** (blue)
Signal: Bipolar

**Example Patch**
This example patch can be used when a microphone is connected to the XLR input on the G2. The oscillator OscA1 KBT button should be set to Off to prevent the oscillator to also track the keyboard. Though when the KBT button is On you can offset the Pitch by the keyboard, note E4 will be the reference Pitch to which you have to calculate the Pitch offset. E.g. playing note E5 will transpose the oscillator one octave higher as the pitch of the incoming audio signal.