/**
 * Patchcord (Cable) Math and Rendering for Nord Modular G2
 *
 * Handles Bezier curve calculations for patch cables
 */

/**
 * FastVector - 2D vector math for patchcord calculations
 */
export class FastVector {
	x: number;
	y: number;
	x2?: number;

	constructor(x: number, y: number, x2?: number) {
		this.x = x;
		this.y = y;
		this.x2 = x2;
	}

	/**
	 * Add a scalar or vector
	 */
	add(B: number | FastVector): FastVector {
		if (typeof B === 'number') {
			return new FastVector(this.x + B, this.y + B);
		}
		return new FastVector(this.x + B.x, this.y + B.y);
	}

	/**
	 * Subtract a scalar or vector
	 */
	subtract(B: number | FastVector): FastVector {
		if (typeof B === 'number') {
			return new FastVector(this.x - B, this.y - B);
		}
		return new FastVector(this.x - B.x, this.y - B.y);
	}

	/**
	 * Multiply by a scalar or vector
	 */
	multiply(B: number | FastVector): FastVector {
		if (typeof B === 'number') {
			return new FastVector(this.x * B, this.y * B);
		}
		return new FastVector(this.x * B.x, this.y * B.y);
	}

	/**
	 * Rotate vector by angle (radians)
	 */
	rotate(angle: number): FastVector {
		const sa = Math.sin(angle);
		const ca = Math.cos(angle);
		return new FastVector(ca * this.x - sa * this.y, sa * this.x + ca * this.y);
	}

	/**
	 * Get string representation for path commands
	 */
	getstr(p: string, xs: number, ys: number, yo: number): string {
		return p + this.x * xs + ',' + (this.y * ys + yo);
	}

	/**
	 * Convert to SVG path string
	 */
	toString(pre = ''): string {
		return `${pre}${this.x} ${this.y}`;
	}
}

/**
 * Creates a FastVector with optional getstr override
 */
export function createFastVector(
	x: number,
	y: number,
	x2?: number,
	getstrFn?: (this: any, p: string, xs: number, ys: number, yo: number, shp?: number) => string,
): FastVector {
	const fv = new FastVector(x, y, x2);
	if (getstrFn) {
		(fv as any).getstr = getstrFn.bind(fv);
	}
	return fv;
}

/**
 * Patchcord class for rendering patch cables
 *
 * Represents a cable connection between two jacks with Bezier curves
 */
export class Patchcord {
	points: FastVector[];

	/**
	 * Create a patchcord from source to destination
	 *
	 * @param sx - Source X
	 * @param sy - Source Y
	 * @param dx - Destination X
	 * @param dy - Destination Y
	 */
	constructor(sx: number, sy: number, dx: number, dy: number) {
		this.points = [];
		this.points[3] = new FastVector(sx, sy);
		this.points[0] = new FastVector(dx, dy);
	}

	/**
	 * Set Bezier control points combining random organic variation with a gravity-based downward bias.
	 * gravity=0: straight line (no variation, no droop).
	 * gravity=100: full random variation + maximum downward droop.
	 */
	shake(gravity: number): void {
		const t = gravity / 100;

		// Random organic variation scaled by gravity (0 at gravity=0 → straight).
		const angle1 = (Math.random() - 0.5) * 2;
		const strength1 = Math.random() * 0.7 * t;
		const angle2 = (Math.random() - 0.5) * 2;
		const strength2 = Math.random() * 0.7 * t;
		const dir1 = this.points[0].subtract(this.points[3]).rotate(angle1);
		const dir2 = this.points[0].subtract(this.points[3]).rotate(angle2);
		this.points[1] = this.points[0].subtract(dir1.multiply(strength1));
		this.points[2] = this.points[3].add(dir2.multiply(strength2));

		// Add gravity downward bias on top of the organic variation.
		if (t > 0) {
			const src = this.points[3];
			const dst = this.points[0];
			const dx = src.x - dst.x;
			const dy = src.y - dst.y;
			const length = Math.sqrt(dx * dx + dy * dy);
			const midY = (src.y + dst.y) / 2;
			const maxY = Math.max(src.y, dst.y);
			const d = t * (maxY - midY + length * 0.2) * (4 / 3);
			this.points[1] = new FastVector(this.points[1].x, this.points[1].y + d);
			this.points[2] = new FastVector(this.points[2].x, this.points[2].y + d);
		}
	}

	/**
	 * Generate SVG path data for the cable using gravity-based droop.
	 */
	getCurvePath(gravity = 50): string {
		this.shake(gravity);
		return this.points[0].toString('M') + this.points[1]!.toString('C') + this.points[2]!.toString(',') + this.points[3].toString(',');
	}
}
