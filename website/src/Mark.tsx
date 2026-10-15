/** The AelionBot partner from the logo, used as a small brand mark and as the Bots in illustrations. */
export function Mark({ className = '' }: { className?: string }) {
  return (
    <svg className={`mark ${className}`} viewBox="0 0 60 60" aria-hidden="true">
      <path d="M31 3C47 3 56 14 56 31C56 46 46 56 29 56C12 56 4 46 4 30C4 14 15 3 31 3Z" fill="currentColor" />
      <ellipse className="mark-eye" cx="24" cy="26" rx="2.5" ry="5" transform="rotate(-14 24 26)" />
      <ellipse className="mark-eye" cx="36" cy="24" rx="2.5" ry="5" transform="rotate(-14 36 24)" />
    </svg>
  );
}
