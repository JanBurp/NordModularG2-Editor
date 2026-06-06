# Operator

**Group:** Oscillator

## Description

The Operator module consists of a sinewave oscillator in combination with a Level & Rate amplitude envelope generator and a keyboard level scaler. The Operator module has the same functionality as an 'operator' in the well-known DX7 FM synthesizer. Note that as this is a replica of the classic DX7 synth, all the parameters and controls behave like on the DX7. Which means that they behave completely different to how all the normal G2 controls behave. The reason is of course that it should be easy for you to copy an original DX7 sound by setting the controls in this module to the same values as the DX7 sound. This way the copied sound will be a very close approximation.

## Parameters

### AMod
Modulation amount for the amplitude. AMod modulates the amplitude with a bipolar control signal. Patch a control signal to the AMod input and set the sensitivity with the arrow buttons. Range 0-7 where 7 is the highest sensitivity.

### BrPoint
Break point note number for the Keyboard Level Scaler. The value is displayed in the corresponding display box. Range: A-1 to C8.

### FreqCoarse
Coarse frequency tuning. Sets the frequency as a multiple relative to the input value on the Pitch input (Ratio mode) or as a fixed number of Hz relative to the Pitch input value (Fixed mode).

### FreqDetune
Fine adjustment of the pitch in even smaller steps than with the FreqFine knob. Range -7 to 7.

### FreqFine
Fine frequency tuning.

### Kbt
KeyBoard Tracking. When active, the frequency is relative to the note played on the keyboard (or received via MIDI). When not active and no Pitch modulation is present, the value is relative to the note E4.

### L1
Level 1 of the amplitude envelope. The lower the Rate values, the longer it will take for the envelope to reach the next Level.

### L2
Level 2 of the amplitude envelope.

### L3
Level 3 of the amplitude envelope. This is the level at which the envelope will sustain.

### L4
Level 4 of the amplitude envelope.

### LDepth
Amplification/attenuation slope for the lower key section. The value is displayed in the corresponding display box.

### LDepthMode
Select Linear or Exponential attenuation or amplification characteristics of the level scaling for the lower key section.

### OutputType
Output signal type selector.

### R1
Rate 1 of the amplitude envelope.

### R2
Rate 2 of the amplitude envelope.

### R3
Rate 3 of the amplitude envelope.

### R4
Rate 4 of the amplitude envelope.

### RDepth
Amplification/attenuation slope for the upper key section. The value is displayed in the corresponding display box.

### RDepthMode
Select Linear or Exponential attenuation or amplification characteristics of the level scaling for the upper key section.

### RatioFixed
Select Ratio to set the frequency as a multiple relative to the input value on the Pitch input. Select Fixed to set the frequency as a fixed number of Hz relative to the Pitch input value.

### RateScale
Envelope rate scaling for the note signals received at the Note input. Range 0-7. The higher the RateScale value, the faster the envelope rates at higher notes.

### Sync
Oscillator sync.

### Vel
Velocity sensitivity for the velocity signal received at the Vel input. Range 0-7 where 7 is the highest sensitivity.

## Inputs

### AMod (blue)
Amplitude modulation input. Controls the levels of the level & rate envelope generator. The amplitude sensitivity is set with the AMod arrow buttons. Range 0-7 where 7 is the highest sensitivity.

### FM (red)
Frequency modulation input. A modulator connected to the FM input will modulate the operator frequency in a linear fashion.

### Freq (blue)
Frequency modulation input.

### Gate (yellow)
Gate input. A signal at the Gate input will gate the envelope.

### Note (blue)
Note input. A signal present at the Note input will affect all the rates of the envelope if the RateScale value is higher than 0. It will also affect the Keyboard Level Scaler.

### Pitch (blue)
Pitch modulation input. An input value of +32 units will generate zero modulation. An input value of 0 units will generate 0 Hz pitch output from the Operator and an input value of +64 units will generate a pitch twice as high as the Operator pitch. If left unconnected, the modulation will be zero.

### Vel (blue)
Velocity input. Controls the levels of the level & rate envelope generator. The velocity sensitivity is set with the Vel arrow buttons. Note that lower envelope levels means that the entire envelope cycle becomes faster!

## Outputs

### Out (red)
Signal output.