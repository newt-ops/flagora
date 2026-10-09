export interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  title?: string;
}

export function VerifiedBadge({
  className = 'h-4 w-4 shrink-0 text-[#2AABEE]',
  size,
  title = 'Verified',
}: VerifiedBadgeProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block select-none align-middle ${className}`}
      style={style}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M8.5 12.3L10.8 14.6L15.8 9.5"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
