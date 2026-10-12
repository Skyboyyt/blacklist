import Link from 'next/link';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/users', label: 'Members' },
  { href: '/admin/labels', label: 'Public labels' },
  { href: '/admin/signals', label: 'Suppressions' },
  { href: '/admin/audit', label: 'Audit history' },
] as const;

/** Sections of the administrator console. Navigation only; every action is checked by the service. */
export function AdminNav({ current }: { readonly current: (typeof LINKS)[number]['href'] }) {
  return (
    <nav aria-label="Administration" className="mb-4">
      <ul className="flex flex-wrap gap-2 text-sm">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={l.href === current ? 'page' : undefined}
              className={
                l.href === current
                  ? 'rounded-md bg-accent-soft px-3 py-1.5 font-medium text-text'
                  : 'rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text'
              }
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
