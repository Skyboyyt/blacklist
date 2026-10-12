import type { ReactNode } from 'react';
import { ShellLayout } from '@/components/layout/shell-layout';
import { SessionExpiredPanel } from '@/components/security/session-expired-panel';
import { SignInRequired } from '@/components/states/access-states';
import { getResearchApi } from '@/lib/api/server';

/** Signed-in area. The anonymous check is UX only; the API enforces access. */
export default async function SignedInLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await (await getResearchApi()).getViewer();
  if (viewer.kind === 'anonymous') {
    return (
      <ShellLayout>
        {viewer.reason ? <SessionExpiredPanel reason={viewer.reason} /> : <SignInRequired />}
      </ShellLayout>
    );
  }
  return <ShellLayout>{children}</ShellLayout>;
}
