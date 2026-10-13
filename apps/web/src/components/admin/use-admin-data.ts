'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, ModerationResult } from '@/lib/api/types';
import { getAdminApi } from '@/lib/api/browser';

export type AdminLoad<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly data: T };

/** Loads one admin read and exposes a reload. The service decides access; this only renders its answer. */
export function useAdminData<T>(read: (api: AdminApi) => Promise<ModerationResult<T>>) {
  const [load, setLoad] = useState<AdminLoad<T>>({ kind: 'loading' });
  const reload = useCallback(async () => {
    try {
      const result = await read(await getAdminApi());
      if (result.kind === 'ok') setLoad({ kind: 'ready', data: result.data });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, [read]);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { load, reload };
}

export async function verifyAdminStepUp(action: string, targetId: string, parameters?: readonly unknown[]) {
  return (await getAdminApi()).verifyStepUp(action, targetId, parameters);
}
