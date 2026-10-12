import type { ReactNode } from 'react';
import { ShellLayout } from '@/components/layout/shell-layout';

export default function PublicLayout({ children }: { readonly children: ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
