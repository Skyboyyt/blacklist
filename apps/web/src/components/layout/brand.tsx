import Link from 'next/link';

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-md font-semibold tracking-tight text-text"
    >
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" className="fill-text" />
        <path d="M7 8h10M7 12h10M7 16h6" className="stroke-bg" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {/* Below 360 px the name is visually hidden so the header controls keep their size. */}
      <span className="max-[359px]:sr-only">Blacklist</span>
    </Link>
  );
}
