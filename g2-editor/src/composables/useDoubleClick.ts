export function useDoubleClick(
	onClick: () => void,
	onDblClick: () => void,
	delay = 220,
) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	function handleClick() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
			onDblClick();
		} else {
			timer = setTimeout(() => {
				timer = null;
				onClick();
			}, delay);
		}
	}

	return { handleClick };
}
