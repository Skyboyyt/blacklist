'use client';

import type { AuditEntry } from '@blacklist/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Notice } from '@/components/app/notice';
import { LoadingStatus } from '@/components/states/skeletons';
import { getModerationApi } from '@/lib/api/browser';
import { MOCK_AUDIT_NOTICE } from '@/lib/staff/copy';
import { AuditTimeline } from './audit-timeline';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly entries: readonly AuditEntry[] };

/** Administrator audit history (`audit:read`). The service refuses other roles. */
export function AuditLogView() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchLog = useCallback(async () => {
    try {
      const result = await (await getModerationApi()).getAuditLog();
      if (result.kind === 'ok') setLoad({ kind: 'ready', entries: result.data });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLog();
  }, [fetchLog]);

  if (load.kind === 'loading') return <LoadingStatus label="Loading the audit history…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchLog()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning" title="Mock audit history">
        {MOCK_AUDIT_NOTICE}
      </Notice>
      <AuditTimeline entries={load.entries} showCase />
    </div>
  );
}
