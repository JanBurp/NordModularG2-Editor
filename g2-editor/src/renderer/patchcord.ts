/**
 * Patchcord (Cable) Math and Rendering for Nord Modular G2
 *
 * Handles Bezier curve calculations for patch cables (control points ported from the original G2 editor)
 */

const HALF_PI = Math.PI / 2;
const THIRD_PI = Math.PI / 3;
const DEFAULT_GRAVITY = 50; // gravity at which the curve is exactly the original G2 editor's

/** One global random byte (0..255) seeding every cable's twist; re-rolled on "Shake cables". */
export function newCableSeed(): number {
	return Math.floor(Math.random() * 256);
}

/**
 * Ported from G2Editor.c TwistAngel: adds a piecewise-linear zig-zag offset (max +-60 degrees) to angle `a`,
 * driven by the wrapped sum a + phi.
 */
export function twistAngle(a: number, phi: number): number {
	let v = a + phi;
	while (v > Math.PI) v -= 2 * Math.PI;
	while (v < -Math.PI) v += 2 * Math.PI;
	let offset: number;
	if (v < -HALF_PI) offset = ((v + Math.PI) * -THIRD_PI) / HALF_PI;
	else if (v < 0) offset = ((v + HALF_PI) * 2 * THIRD_PI) / HALF_PI - THIRD_PI;
	else if (v < HALF_PI) offset = (v * -2 * THIRD_PI) / HALF_PI + THIRD_PI;
	else offset = ((v - HALF_PI) * THIRD_PI) / HALF_PI - THIRD_PI;
	return offset + a;
}

/**
 * Ported from G2Editor.c CRenderSnakeABC::GetControlpoints. Returns the two Bezier control points
 * (cpA next to (ax,ay), cpB next to (bx,by)). Handle length scales with gravity: 0 = straight line,
 * DEFAULT_GRAVITY = original shape, above = more bulge.
 */
export function cableControlPoints(ax: number, ay: number, bx: number, by: number, gravity: number, seed: number): [[number, number], [number, number]] {
	const d = Math.hypot(bx - ax, by - ay);
	let theta = Math.atan2(by - ay, bx - ax);
	let theta2 = theta + Math.PI;
	if (theta2 > Math.PI) theta2 -= 2 * Math.PI;

	const len = (d < 45 ? d / 3 : d / 5 + 9) * (gravity / DEFAULT_GRAVITY);
	const phi = Math.sin(seed + ax + ay + bx + by) * 2 * Math.PI;

	if (d >= 100) {
		theta = twistAngle(theta, phi);
		theta2 = twistAngle(theta2, phi);
	} else {
		const w = (d / 100) ** 2;
		const twisted = w >= 0.5 ? w : 0.5;
		const straight = w >= 0.5 ? 1 - w : 0.5;
		theta = straight * theta + twisted * twistAngle(theta, phi);
		theta2 = straight * theta2 + twisted * twistAngle(theta2, phi);
	}
	return [
		[Math.round(ax + Math.cos(theta) * len), Math.round(ay + Math.sin(theta) * len)],
		[Math.round(bx + Math.cos(theta2) * len), Math.round(by + Math.sin(theta2) * len)],
	];
}

/**
 * Patchcord class for rendering patch cables
 *
 * Represents a cable connection between two jacks as one cubic Bezier
 */
export class Patchcord {
	constructor(
		private sx: number,
		private sy: number,
		private dx: number,
		private dy: number,
	) {}

	/**
	 * SVG path data "M dst C cp1,cp2,src" (cp1 next to dst, cp2 next to src).
	 */
	getCurvePath(gravity = DEFAULT_GRAVITY, seed = 0): string {
		const [cp1, cp2] = cableControlPoints(this.dx, this.dy, this.sx, this.sy, gravity, seed);
		return `M${this.dx} ${this.dy}C${cp1[0]} ${cp1[1]},${cp2[0]} ${cp2[1]},${this.sx} ${this.sy}`;
	}
}

/**
 * Deterministic sag-based preview curve — no randomness, unlike Patchcord — so it stays
 * smooth when recomputed on every mousemove (a real cable's randomized curve is only computed once,
 * at creation; a ghost/preview cable is recomputed continuously while it follows the mouse or updates
 * its snapped target).
 */
export function previewCurvePath(sx: number, sy: number, dx: number, dy: number): string {
	const dist = Math.hypot(dx - sx, dy - sy);
	const sag = Math.min(dist * 0.25, 60);
	const bot = Math.max(sy, dy) + sag;
	return `M${sx} ${sy} C${sx + (dx - sx) * 0.25} ${bot},${sx + (dx - sx) * 0.75} ${bot},${dx} ${dy}`;
}
