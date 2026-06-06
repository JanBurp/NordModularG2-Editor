# EnvMulti (Envelope Multi)

The Multi stage envelope is a 5-segment time and level envelope with selectable sustain segment.

## Parameters (alphabetical)

### KB
Keyboard trigger on/off.

### NR
Envelope Normal/Retrigger mode. When active (NR depressed), the envelope always restarts at zero level. Without NR active, the envelope restarts at the current level (L4 when at the sustain segment).

### OutputType
Output type: Positive, Negative, or Inverted.

### Shape
Envelope Shape control.

### SustainMode
By clicking the Sustain scroll button you define the sustain segment. This segment can be any of the four level segments, or, if you wish, none at all. The sustain segment works like in an ordinary ADSR envelope, i.e this is the level that sustains as you hold down the key(s). After releasing the key(s) the envelope will continue till the end of T4 and stop at the L4 level. Range: None and L1 to L4.

### Time1
Time between start and Level1.

### Time2
Time between Level1 and Level2.

### Time3
Time between Level2 and Level3.

### Time4
Time between Level3 and Level4.

### Level1
Amplitude of level segment 1. The levels can be either unipolar or bipolar. Range: 0 to 64 units (unipolar) or -64 to +64 units (bipolar).

### Level2
Amplitude of level segment 2. The levels can be either unipolar or bipolar. Range: 0 to 64 units (unipolar) or -64 to +64 units (bipolar).

### Level3
Amplitude of level segment 3. The levels can be either unipolar or bipolar. Range: 0 to 64 units (unipolar) or -64 to +64 units (bipolar).

### Level4
Amplitude of level segment 4. The envelope always ends at the L4 level, which can indeed be different from the initial start level. When you then restart the envelope at the L4 stage, the start level will be the same as L4. The levels can be either unipolar or bipolar. Range: 0 to 64 units (unipolar) or -64 to +64 units (bipolar).

## Inputs

### AM
Amplitude modulation input.

### Gate
Gate/trigger input.

### In
Envelope signal input.

## Outputs

### Env
Envelope output.

### Out
Signal output.

## Graph Display

This module includes a graphical envelope display showing the multi-stage envelope shape with four level segments (L1-L4) and four time segments (T1-T4). The straight line at the T1 segment indicates the restarted (bipolar) envelope without the R (NR) button depressed, and the dotted line with the R button depressed.