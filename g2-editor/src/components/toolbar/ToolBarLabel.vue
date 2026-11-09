<template>
	<!-- Hidden from the step where the load meter moves into the patch toolbar (< 1356px, see ExtendedToolBar.vue),
	     so the patch toolbar keeps to one row -->
	<span class="text-xs/3 hidden @min-[1356px]/toolbar:inline">
		<slot></slot>
	</span>
</template>
