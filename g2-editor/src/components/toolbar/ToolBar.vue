<template>
	<!-- flex-wrap: narrow windows reflow onto extra lines instead of clipping; @container: children adapt to the bar's width -->
	<div data-toolbar class="@container flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 bg-surface-1 border-b border-line-subtle">
		<slot />
	</div>
</template>
