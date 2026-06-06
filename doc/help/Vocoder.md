# Vocoder

A classic 16-band vocoder that filters a synthesizer sound using another sound source (typically voice). The result is a "singing" synthesizer where the notes from the synthesizer pass through while being shaped by the vocal input's frequency content. Each of the 16 analysis bands controls a corresponding frequency band of the synthesis bank via an envelope follower. Unlike standard vocoders, this module allows rerouting of analysis bands to any synthesis band, creating unique frequency combinations.

## Inputs

### Analysis Bank Ctrl Input

Audio input for the modulator signal (typically a vocal signal). This is the "modulator" that shapes the synthesizer sound.

### Synthesizer Input

Audio input for the synthesizer signal to be filtered by the vocoder.

## Parameters

### MON

Button that bypasses the modulator (Ctrl) signal directly to the output for monitoring. Use to switch between hearing the original vocal and the vocoded synthesizer sound.

### EMP (Emphasis)

Button to emphasize high frequencies in the analysis signal. Helps achieve a more even frequency response in the modulated output.

### Reroute Buttons

Up/down buttons for each synthesis band to route it to any frequency band of the analysis bank.

## Presets

### Reroute Presets

Click the preset buttons to reroute all synthesis bands by the indicated number of steps. Useful for creating consistent patterns across bands.

### Inv (Invert)

Inverts the band routing: Analysis band 1 routes to Synthesis band 16, and so on.

### Rnd (Random)

Reroutes all bands completely randomly. Great for experimental sounds.

## Graph

Visual display showing the routing between Analysis and Synthesis bands. Click on the graph or use the reroute buttons to modify connections.