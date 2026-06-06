# PartQuant

**Group:** Note

## Description

Modules in this group do operations on blue signals that represent keyboard note information. In this group you will find modules that can rescale and quantize pitch control signals to halfnote scales, chord scales, harmonic scales and extract pitch control signals from audio signals.

The Partial Quantizer module is used to transpose an Oscillator to one of its harmonic partials. It works similar to the NoteQuant module, but instead of quantizing to seminote values this module quantizes to 'overtone' values. The PartQuant module is similar to the Part setting on a G2 oscillator module. The PartQuant transforms a Pitch control signal to a new signal value that will offset the frequency of an oscillator in an exact harmonic interval. The range of the partial generator is 0 to +/- 64 partials in steps of 1 harmonic. Note that the practical limit for this module is +/- 32 harmonics. This means that if the input value is greater than +32 units, the output signal will quantize to the 32nd harmonic control signal value, as that's where the scale stops. In normal use the PartQuant output is connected to a direct Pitch input (without attenuator knob) of an Oscillator or a Filter module. Positive input signals will tune an oscillator to a higher harmonic, while negative input signals will make the oscillator produce 'undertones'.

## Parameters

**Range** (PartialRange)
Scales down a full input signal of +64 units to a control value which will produce the overtone shown in the associated display (the actual harmonic is one higher as the display shows, e.g. when the display shows +/- 2 it actually means the third harmonic). If the input signal is smaller than +64 units, e.g. +32 units, then the actual output control signal will produce the harmonic that is half as low as the value shown in the display. Note that an increase in value of 1 unit of the input signal level corresponds to a step of one harmonic, provided the Range is set to +63*. Knob settings which exceed +/- 32 partials are shown with an asterisk, indicating that the practical output limit is exceeded.

As the output is a result of both the Range setting and the value of the input signal, it is recommended to either use the Range knob with an input setting of +64 units, or instead set the Range knob fully open to +/-63* and variate the level of the input signal with e.g. a Constant module to force an oscillator or filter to a fixed harmonic. When the purpose of the module is to arpeggiate an oscillator through its harmonic series, use a Lfo waveform set to positive only. As the Lfo waveform will in this case vary between 0 and +64 units the Range knob will set the harmonic arpeggiator range.

Note that when the display shows +1 it will detune to the second harmonic, and when set to +2 detune to the third harmonic, etc.

## Inputs

**In** (blue)
The blue control signal input.

## Outputs

**Out** (blue)
Signal: Bipolar.

**Example of a Harmonic Arpeggiator**
In this example a positive only triangle lfo waveform is quantized to an up down arpeggio that steps from the fundamental pitch up to the eighth harmonic and down again.

**Example of Just Tuning**
Just tuning is commonly based on 'pure' ratios that can be expressed as rational fraction ratios of relatively small numbers, e.g. a pitch can have a 3:2, 4:3 or 5:4 ratio in respect to another pitch. These detune ratio's are excellent to use in techniques like FM and ringmodulation, where two oscillators are often detuned to rational fraction ratios to have minimal 'beating' effect.

The PartQuant can be easily used to create rational fraction ratios. For a rational fraction a numerator and a denominator are given. On the G2 the 'pure' detuning can be calculated by creating a numerator and a denominator with two PartQuant modules, and then simply subtract the denominator value from the numerator value. Subtracting is done with a two input mixer with the Inv button ON for the denominator.

The two Constant modules in the example together define the actual detune, which in this case is 4(+1) divided by 3(+1), so 5:4. Adding one to the value of the Constant module to know the proper ratio is necessary, as when the Constant module shows 4 it is actually the fifth harmonic that will be generated (remember that when both values are zero the ratio is 1:1). So, in this example the second oscillator is detuned to the 'fourth undertone' of the 'fifth overtone' of the fundamental.