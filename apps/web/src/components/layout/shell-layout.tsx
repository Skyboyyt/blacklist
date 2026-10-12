import type { ReactNode } from 'react';
import { getResearchApi } from '@/lib/api/server';
import { AppShell } from './app-shell';

/** Server wrapper shared by the (public), (app) and (staff) route groups. */
export async function ShellLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await (await getResearchApi()).getViewer();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
