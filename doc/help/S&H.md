# S&H (Sample & Hold)

The S&H module takes samples of the values of an incoming signal and holds them at the output. The sampling of the input signal occurs every time the signal on the Ctrl (clock) input changes from a logic LOW to a logic HIGH signal (the positive edge). In between the positive edges of the clocking signal, the module holds the value of the latest sample on the output. See also "Common Switch parameters".

**Tip!** The S&H module is in essence a storage or memory cell. Traditionally it is often used to generate 'stairway' arpeggios by sampling an LFO waveform or random notes by sampling a noise signal.

The S&H is also a very important synchronisation module. Imagine that the keyboard Gate and Note signals are first sampled at the rate of the master tempo clock before being passed on to oscillators and envelope generators. This will delay the played notes until the next master clock pulse and get all your notes automatically in sync with the master clock. This technique can also be used to transpose a Sequencer module from the keyboard exactly on the beat. In fact there are many, many tricks that can be done with the S&H module, especially to solve timing problems in a patch.

## Inputs

### In

Signal input to be sampled.

### Ctrl

Clock/trigger input. The module samples the In signal on the positive edge (LOW to HIGH transition) of this input.

## Outputs

### Out

Holds the sampled value until the next positive clock edge.