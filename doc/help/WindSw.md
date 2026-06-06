# WindSw - Window Switch that closes when a control signal is within a specified range

## Overview

The Window Switch closes when an incoming Control signal value is within the range set by the From and To parameters. When the switch is closed, a high logic gate signal is output from the yellow logic output.

## Controls

- **From** — Sets the lower limit where the switch should close. Range: 0.0–64.0 units in steps of 0.5. Note: if From is higher than To, the switch never closes.
- **To** — Sets the upper limit where the switch should close. Range: 0.0–64.0 units in steps of 0.5. Note: if From is higher than To, the switch never closes.

## Output

- **Gate** — Yellow logic output that sends a high signal when the switch is closed.

## See Also

Common Switch parameters