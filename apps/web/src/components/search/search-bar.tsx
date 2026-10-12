'use client';

import { SEARCH_QUERY_MAX_LENGTH } from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useReducer, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { initialSearchInputState, searchHref, searchInputReducer } from '@/lib/search/search-input-state';
import { DetectionStatus } from './detection-status';

/** Delay before format detection runs, so the status does not flicker while typing. */
export const DETECT_DEBOUNCE_MS = 250;

interface SearchBarProps {
  readonly initialValue?: string;
  readonly size?: 'md' | 'lg';
}

/**
 * Universal search input. Detects the identifier format while typing (a hint only;
 * the API validates again) and navigates to /search, which renders the results.
 */
export function SearchBar({ initialValue = '', size = 'md' }: SearchBarProps) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(
    searchInputReducer,
    initialValue.trim()
      ? searchInputReducer({ status: 'typing', value: initialValue }, { type: 'detect' })
      : initialSearchInputState,
  );

  useEffect(() => {
    if (state.status !== 'typing') return;
    const timer = setTimeout(() => dispatch({ type: 'detect' }), DETECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  function go(chain?: string) {
    if (!state.value.trim()) return;
    startTransition(() => router.push(searchHref(state.value, chain)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go();
  }

  const statusId = `${id}-status`;
  return (
    <form role="search" onSubmit={onSubmit} className="flex flex-col gap-2" aria-busy={pending || undefined}>
      <label htmlFor={`${id}-input`} className="sr-only">
        Address or transaction hash
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            name="search"
            className={cn(
              'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle',
              size === 'lg' ? 'size-5' : 'size-4',
            )}
          />
          <input
            id={`${id}-input`}
            type="search"
            value={state.value}
            onChange={(e) => dispatch({ type: 'input', value: e.target.value })}
            aria-describedby={statusId}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder="Paste an address or transaction hash"
            className={cn(
              'identifier w-full rounded-lg border border-border-strong bg-surface text-text shadow-sm placeholder:font-sans placeholder:text-subtle',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              size === 'lg' ? 'h-14 pr-4 pl-11 text-base' : 'h-11 pr-3 pl-10 text-sm',
            )}
          />
        </div>
        <Button
          type="submit"
          size={size === 'lg' ? 'lg' : 'md'}
          loading={pending}
          loadingLabel="Searching…"
          disabled={state.status === 'idle'}
          className={size === 'lg' ? 'h-14 px-6' : undefined}
        >
          Search
        </Button>
      </div>
      <DetectionStatus id={statusId} state={state} onChooseNetwork={go} />
    </form>
  );
}
