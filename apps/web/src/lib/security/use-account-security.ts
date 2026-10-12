'use client';

import type { AccountError, AccountSecurity } from '@blacklist/contracts';
import { useCallback, useEffect, useState } from 'react';
import { getAccountApi } from '@/lib/api/browser';

export type AccountSecurityState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: AccountSecurity }
  | { readonly status: 'error'; readonly error: AccountError };

/**
 * Loads the signed-in holder's security overview from the account API. Always
 * re-reads after a change, so the UI never trusts its own idea of what happened.
 */
export function useAccountSecurity() {
  const [state, setState] = useState<AccountSecurityState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const result = await (await getAccountApi()).getSecurity();
      setState(
        result.kind === 'ok' ? { status: 'ready', data: result.data } : { status: 'error', error: result },
      );
    } catch {
      setState({ status: 'error', error: { kind: 'error', code: 'temporarily_unavailable' } });
    }
  }, []);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { state, reload: load };
}
