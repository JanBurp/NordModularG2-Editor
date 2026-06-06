# T&H - Signal follower/sampler with hold mode

When the signal on the Ctrl input is a logic HIGH the output follows the input signal. When the signal on the Ctrl input goes to logic LOW it samples the momentary output value and holds it until the Ctrl input goes HIGH again. Unlike a normal switch which outputs 0 when inactive, this module holds the last value. See also "Common Switch parameters".