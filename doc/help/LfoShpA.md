# LfoShpA

**Group:** LFO

## Description

LfoShpA generates one of six different shapable control signals. The shape and phase of the signal can be controlled and modulated. The rate of the LFO can be modulated by a modulation source and the keyboard. The wave cycle can also be forced to restart via the Rst input. It's also possible to alter the rate and "direction" of the signal via the Dir input.

**WAVEFORMS AND SHAPES:**

- **Sine:** A sine>sawtooth type of signal. At 50% Shape, the signal is a pure sine wave. At 1% Shape, the signal is a "down sawtooth" and at 99% Shape, an "up sawtooth" signal.

- **CosBell:** A cosine signal with variable "width". At 1% Shape, the signal has a very narrow peak which expands with increasing Shape amount up to 99%, where the signal is a pure (co)sine wave.

- **TriBell:** A triangle wave with variable "width". At 1% Shape, the signal has a very narrow peak which expands with increasing Shape amount up to 99%, where the signal is a pure triangle wave.

- **Saw>Tri:** A variable sawtooth>triangle wave. At 1% Shape, the signal is a "down sawtooth" which transforms into a triangle wave and then to an "up sawtooth" with increasing Shape amount.

- **Tri>Square:** A triangle wave which gradually transforms into a square wave with increasing Shape amount.

- **Pulse:** A regular pulse wave with adjustable pulse width, from 1% to 99%.

## Parameters

**Active** (ActiveMonitor)

**Dir** (Dir)
The Dir input can be used to continuously control the rate and "direction" of the LFO signal. Let's say we have set the LFO rate to 200 Hz. An input offset value of +64 units on the Dir input will then make the LFO run at 200 Hz. An input offset value of 0 units will force the LFO to stop completely and an input offset value of -64 units will force the LFO to run at -200 Hz, i.e. produce a 180 degrees phase shifted LFO signal.

**Kbt** (Kbt_4)
KBT, KeyBoard Tracking.

**OutputType** (OutTypeLfo)
Output type selector.

**Phase** (Phase)
Phase control (with graph display).

**PhaseMod** (Level_100)
Phase modulation amount.

**PolyMono** (PolyMono)
Poly/Mono mode selector.

**Range** (LfoRange_4)
LFO range selector.

**Rate** (LfoRate_4)
LFO rate control.

**RateMod** (Level_100)
Rate modulation amount.

**Shape** (LfoShpAPW)
Shape control (with graph display).

**ShapeMod** (Level_100)
Shape modulation amount.

**Waveform** (LfoShpA__Waveform)
Waveform selector (drop-down with graph).

## Common LFO Parameters

**RATE/CLK SYNC MODE:** Some LFOs have a Rate button for setting the LFO free running or in sync with the system clock.

**PHASE:** Use the Phase knob to set the initial phase offset of the LFO wave cycle.

**RST INPUT:** The Rst input is used for forcing the LFO wave cycle to restart.

**SNC OUTPUT:** The Sync output sends a trigger pulse each time the LFO wave cycle restarts.

**POLY/MONO:** Click the Poly/Mono button to switch between Polyphonic and Monophonic LFO mode. In Polyphonic mode, the LFO runs at a rate relative to each note you play. In Monophonic mode, the LFO runs at a fixed rate.

**KBT:** KBT, KeyBoard Tracking, is the internal connection between the LFO and the keyboard.

**OUTPUT TYPE:** Some LFOs have an Output Type button for selecting between unipolar and bipolar output. Bipolar output: signal range -64 to +64. Unipolar output: signal range 0 to +64.

**ON/OFF:** Click to mute the output of the LFO. Blue button color indicates that the LFO is ON.

**OUTPUT:** The signal output on the LFO. Signal: BIPOLAR (or UNIPOLAR depending on OutputType setting).

## Inputs

**Dir** (blue)
Direction control input.

**PhaseMod** (blue)
Phase modulation input.

**Rate** (blue)
Rate modulation input.

**RateVar** (blue)
Additional rate modulation input.

**Rst** (blue)
Reset input.

**ShapeMod** (blue)
Shape modulation input.

## Outputs

**Out** (blue)
Signal output.

**Snc** (blue)
Sync output.