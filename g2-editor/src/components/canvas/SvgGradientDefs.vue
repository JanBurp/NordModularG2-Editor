<template>
	<defs>
		<!-- Left side gradient -->
		<linearGradient id="g116" gradientUnits="objectBoundingBox">
			<stop class="gradient-stop-dark" offset="0" />
			<stop class="gradient-stop-mid" offset="0.2" />
			<stop class="gradient-stop-light" offset="1" />
		</linearGradient>

		<!-- Right side gradient -->
		<linearGradient id="g117" gradientUnits="objectBoundingBox">
			<stop class="gradient-stop-transparent" offset="0" />
			<stop class="gradient-stop-very-light" offset="0.7" />
			<stop class="gradient-stop-white" offset="1" />
		</linearGradient>

		<!-- Top gradient -->
		<linearGradient
			id="g118"
			gradientUnits="objectBoundingBox"
			x1="0%"
			y1="0%"
			x2="0%"
			y2="100%"
		>
			<stop class="gradient-stop-white" offset="0" />
			<stop class="gradient-stop-very-light" offset="0.3" />
			<stop class="gradient-stop-transparent" offset="1" />
		</linearGradient>

		<!-- Bottom gradient -->
		<linearGradient
			id="g119"
			gradientUnits="objectBoundingBox"
			x1="0%"
			y1="0%"
			x2="0%"
			y2="100%"
		>
			<stop class="gradient-stop-transparent" offset="0" />
			<stop class="gradient-stop-mid-gray" offset="0.8" />
			<stop class="gradient-stop-dark" offset="1" />
		</linearGradient>

		<!-- Knob radial gradient -->
		<radialGradient
			id="g120"
			gradientUnits="objectBoundingBox"
			cx="50%"
			cy="50%"
			r="70%"
		>
			<stop stop-color="#FFF" offset="0" />
			<stop stop-color="#FFF" offset="0.5" />
			<stop stop-color="#000" offset="1" />
		</radialGradient>

		<!-- Slider linear gradient -->
		<linearGradient
			id="g121"
			gradientUnits="objectBoundingBox"
			x1="0%"
			y1="0%"
			x2="0%"
			y2="100%"
		>
			<stop stop-color="#333" offset="0" />
			<stop stop-color="#CCC" offset="0.5" />
			<stop stop-color="#222" offset="1" />
		</linearGradient>
	</defs>
</template>

<style scoped>
/* Module panel gradient stops */
.gradient-stop-dark {
	stop-color: rgb(16, 16, 16);
	stop-opacity: 1;
}

.gradient-stop-mid {
	stop-color: rgb(127, 127, 127);
	stop-opacity: 0.75;
}

.gradient-stop-light {
	stop-color: rgb(190, 190, 190);
	stop-opacity: 0;
}

.gradient-stop-transparent {
	stop-color: rgb(190, 190, 190);
	stop-opacity: 0;
}

.gradient-stop-very-light {
	stop-color: rgb(210, 210, 210);
	stop-opacity: 0.15;
}

.gradient-stop-white {
	stop-color: rgb(255, 255, 255);
	stop-opacity: 1;
}

.gradient-stop-mid-gray {
	stop-color: rgb(127, 127, 127);
	stop-opacity: 0.25;
}
</style>
