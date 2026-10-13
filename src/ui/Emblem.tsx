import type { CSSProperties, ReactNode } from 'react';
import './emblem.css';

/** Two shapes on a 40×40 ground: the lighter tone first, the deeper one on top. Each is also shown turned. */
const COMPOSITIONS: ReactNode[] = [
  // A hill with a disc above it.
  <>
    <circle className="emblem-mid" cx="20" cy="38" r="20" />
    <circle className="emblem-deep" cx="29" cy="11" r="5" />
  </>,
  // Quarter discs in opposite corners.
  <>
    <path className="emblem-mid" d="M0 40V10a30 30 0 0 1 30 30Z" />
    <path className="emblem-deep" d="M40 0v14A14 14 0 0 1 26 0Z" />
  </>,
  // Two discs that overlap.
  <>
    <circle className="emblem-mid" cx="15.5" cy="20" r="11" />
    <circle className="emblem-deep" cx="25.5" cy="20" r="11" opacity="0.86" />
  </>,
  // A diagonal half and a disc.
  <>
    <path className="emblem-mid" d="M40 0v40H0Z" />
    <circle className="emblem-deep" cx="12.5" cy="12.5" r="5.5" />
  </>,
  // Rings spreading from a corner.
  <>
    <circle className="emblem-mid" cx="0" cy="40" r="34" />
    <circle className="emblem-ground" cx="0" cy="40" r="23" />
    <circle className="emblem-deep" cx="0" cy="40" r="12" />
  </>,
  // A leaf and a seed.
  <>
    <path className="emblem-mid" d="M6 34A28 28 0 0 1 34 6 28 28 0 0 1 6 34Z" />
    <circle className="emblem-deep" cx="31" cy="31" r="4" />
  </>,
  // A half, and a half disc leaving it.
  <>
    <rect className="emblem-mid" width="20" height="40" />
    <path className="emblem-deep" d="M20 8a12 12 0 0 1 0 24Z" />
  </>,
  // An arch within an arch.
  <>
    <path className="emblem-mid" d="M8 40V22a12 12 0 0 1 24 0v18Z" />
    <path className="emblem-deep" d="M15 40V24a5 5 0 0 1 10 0v16Z" />
  </>,
  // A square and a disc.
  <>
    <rect className="emblem-mid" x="6" y="6" width="18" height="18" rx="2.5" />
    <circle className="emblem-deep" cx="26.5" cy="26.5" r="9" />
  </>,
  // A ring and its satellite.
  <>
    <circle className="emblem-ring" cx="20" cy="20" r="11.5" />
    <circle className="emblem-deep" cx="28.2" cy="11.8" r="5" />
  </>,
  // A wave under a disc.
  <>
    <path className="emblem-mid" d="M0 25c7-9 13-9 20 0s13 9 20 0v15H0Z" />
    <circle className="emblem-deep" cx="29" cy="11" r="4.5" />
  </>,
];
/** OKLCH hues that stay clean at the emblem's tones; the yellow-greens between amber and green turn muddy. */
const HUES = [15, 35, 55, 72, 145, 165, 185, 205, 228, 250, 272, 295, 320, 345];

function hash(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.codePointAt(0)!, 16777619);
  return value >>> 0;
}

/**
 * A mark for something that has no picture of its own (a model provider, you): a small composition of two shapes
 * in one hue, always the same for the same `seed`. Pass `hue` to keep a family of marks in one color.
 */
export function Emblem({
  seed,
  size = 30,
  round = false,
  hue,
}: {
  seed: string;
  size?: number;
  round?: boolean;
  hue?: number;
}) {
  const value = hash(seed);
  return (
    <svg
      className={`emblem ${round ? 'is-round' : ''}`}
      viewBox="0 0 40 40"
      width={size}
      height={size}
      style={{ '--emblem-hue': hue ?? HUES[(value >>> 12) % HUES.length] } as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="emblem-ground" width="40" height="40" />
      <g transform={`rotate(${((value >>> 8) % 4) * 90} 20 20)`}>{COMPOSITIONS[value % COMPOSITIONS.length]}</g>
    </svg>
  );
}
