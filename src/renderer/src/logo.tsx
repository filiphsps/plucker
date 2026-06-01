import React from "react";

export interface LogoProps {
	/** Font size of the wordmark. Number is treated as px. Defaults to `text-xs` (0.75rem). */
	fontSize?: string | number;
	/** Tracking between letters. Defaults to the header's `tracking-[3px]`. */
	letterSpacing?: string | number;
	/** Font weight. Defaults to `font-semibold` (600). */
	fontWeight?: number;
	/** Base wordmark color. */
	color?: string;
	/** Color of the accent "U". Defaults to the live OS accent var used across the app. */
	accent?: string;
	className?: string;
	style?: React.CSSProperties;
}

/**
 * The Plucker wordmark — `PL` + an accent `U` + `CKER` in Geist Mono.
 *
 * Inline-styled (no Tailwind) so the exact same component renders in the
 * Tailwind app *and* in the standalone icon build, where the accent/colors are
 * passed explicitly instead of resolved from CSS variables.
 */
export function Logo({
	fontSize = "0.75rem",
	letterSpacing = "3px",
	fontWeight = 600,
	color = "#e7ebef",
	accent = "var(--color-accent)",
	className,
	style,
}: LogoProps): React.JSX.Element {
	return (
		<span
			className={className}
			style={{
				fontFamily: "'Geist Mono', ui-monospace, monospace",
				fontWeight,
				lineHeight: 1,
				whiteSpace: "nowrap",
				color,
				fontSize,
				letterSpacing,
				...style,
			}}
		>
			P<span style={{ color: accent }}>LU</span>CKER
		</span>
	);
}
