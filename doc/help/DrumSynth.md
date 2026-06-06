# DrumSynth

**Group:** Oscillator

## Description

The Nord Modular G2 oscillators produce continuous waveforms with a certain pitch and an amplitude swing that is between -64 and +64 units. If you connect an oscillator output to a mix bus, it will generate a constant sound - just as you would expect. If you want the behaviour of a traditional synthesizer, i.e. to generate sound only when you play on the keyboard, patch the output of the oscillator to the audio signal input of an envelope generator. Then, patch the audio signal output of the envelope generator to an Output module.

The Drum synth module is designed to generate classic analog drumcomputer or rhythmbox sounds. It consists of a master and a slave oscillator in combination with a noise source and a multimode noise filter. The global parameters include a bend function and a click and noise mixer.

**TRIG:** The yellow Trig input trigs the Drum synth module each time it receives a signal that changes from 0 units or below to anything above 0 units. This signal could come from a gate output of a Keyboard or Sequencer module, for example. A green LED indicates when a trig signal is received.

**VEL MODULATION INPUT:** This blue control input is used to receive velocity information from an external source. The input velocity signal will affect Master and Slave Oscillator Level, Noise Filter Sweep, Bend Amount, Click Level and Noise Level. Maximum input velocity will force the parameters to reach their current settings.

**PITCH MODULATION INPUT:** This blue control input is used to receive pitch data from an external module such as a Keyboard or Sequencer module, for example.

**MASTER AND SLAVE DISPLAY BOXES:** The Master display box shows the master pitch in Hz, and the Slave display box the pitch ratio related to the master pitch. Range: Master: 20.0 Hz to 784 Hz. Slave: 1:1 to 6.26.

**MASTER AND SLAVE KNOBS:** These are the parameters of the two oscillators that generate the basic drum waveform.

- **TUNE:** The tune of the Master can be set between 20.0 and 784 Hz. The Slave ranges from 1 to 6.26 times the Master frequency.

- **DCY:** Decay determines the decay time for each oscillator. Range: 0.5 ms to 45 s.

- **LEV:** With the Level knobs you set the respective volume of the two oscillators.

**NOISE FILTER:** Here you can filter and affect the noise component of the Drum synth module.

- **FREQ:** With the Freq knob you set the cutoff frequency of the noise. Range: 10 Hz to 15.8 kHz.

- **Res:** With the Res knob you set the resonance amount around the cutoff frequency.

- **Swp:** With the Sweep knob you set a sweep range for the cutoff frequency. The setting results in a sweep from a high cutoff frequency down to the frequency you set with the Freq knob. Range: 0 to 5 octaves.

- **Dcy:** The Decay knob sets the noise sweep and decay time. Range: 0.5 ms to 45 s.

- **HP/BP/LP:** Click on the HP, BP or LP button to select filter mode: highpass, bandpass or lowpass.

**BEND:** Bend is a global function for the Master and Slave oscillators.

- **Amt:** With the Amt knob you set the bend amount, i.e. the frequency range to bend through. The bending always start from the higher frequency and sweeps down in frequency. Range: 0 to 5 octaves.

- **Dcy:** With the Dcy knob you set the bend decay time. The bend time can be considered more as a bend rate, since the actual decay time is determined by the Decay knobs of the two oscillators. Range: 0.5 to 45 s.

**CLICK:** With the Click knob you can add a clicking sound to the attack of the sound.

**NOISE:** With the Noise knob you set the noise level in the total mix.

**PRESET:** Here you can choose between a number of factory presets by clicking on the up or down buttons. The preset name is shown in the display box.

## Parameters

**Masterfreq** (DrumSynthFreq)
Master oscillator frequency.

**SlaveRatio** (DrumSynthRatio)
Slave oscillator ratio to master.

**MasterDecay** (EnvTime)
Master oscillator decay time.

**SlaveDecay** (EnvTime)
Slave oscillator decay time.

**MasterLevel** (Level_100)
Master oscillator level.

**SlaveLevel** (Level_100)
Slave oscillator level.

**NoiseFltFreq** (DrumSynthNoiseFlt)
Noise filter cutoff frequency.

**NoiseFltRes** (Level_100)
Noise filter resonance.

**NoiseFltSweep** (Level_100)
Noise filter sweep range.

**NoiseFltDecay** (EnvTime)
Noise filter decay time.

**NoiseFltMode** (LpBpHp2)
Noise filter mode (LP/BP/HP).

**BendAmount** (Level_100)
Bend amount.

**BendDecay** (EnvTime)
Bend decay time.

**Click** (Level_100)
Click level.

**Noise** (Level_100)
Noise level.

**Active** (ActiveMonitor)

## Inputs

**Trig** (yellow)
Trigger input.

**Vel** (blue)
Velocity modulation input.

**Pitch** (blue)
Pitch modulation input.

## Outputs

**Out** (red)
Signal: Bipolar