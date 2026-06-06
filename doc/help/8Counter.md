# 8Counter

8-Bit Counter module that counts input pulses and outputs the count value as an 8-bit signal.

## MAX COUNT KNOB

Set the maximum count value. Range: 1–255.

## INPUTS

**Clk**
The clock input. Each positive edge increments the count.

**Rst**
The reset input. Resets the count to 0.

## OUTPUT(S)

**Out1–8**
The 8-bit count value outputs.

**Note:** The counter wraps around when it reaches the maximum value.