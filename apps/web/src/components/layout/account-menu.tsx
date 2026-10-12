import type { Viewer } from '@blacklist/contracts';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export function AccountMenu({ viewer }: { readonly viewer: Viewer }) {
  if (viewer.kind === 'anonymous') {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
        <ButtonLink href="/register" variant="primary" size="sm" className="hidden sm:inline-flex">
          Create account
        </ButtonLink>
      </div>
    );
  }
  return (
    <Link
      href="/settings/profile"
      className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-text hover:bg-surface-2"
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-muted">
        <Icon name="user" className="size-4" />
      </span>
      <span className="hidden max-w-32 truncate sm:inline">{viewer.handle}</span>
      <span className="sr-only sm:hidden">Account settings for {viewer.handle}</span>
    </Link>
  );
}
