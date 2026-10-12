'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getHumanVerifier } from '@/lib/api/browser';

type ChallengeState = 'running' | 'failed' | 'unavailable';

interface HumanVerificationProps {
  /** Called once with the widget's opaque response; the caller retries the request with it. */
  readonly onPassed: (response: string) => void;
}

/**
 * Human-verification challenge shown when sign-in throttling escalates (identity §12).
 * Provider-neutral: the widget renders into the container through `HumanVerifierClient`.
 * It fails closed: if the check cannot load, sign-in stays paused and a retry is offered.
 */
export function HumanVerification({ onPassed }: HumanVerificationProps) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ChallengeState>('running');
  const [attempt, setAttempt] = useState(0);
  const passed = useRef(onPassed);

  useEffect(() => {
    passed.current = onPassed;
  }, [onPassed]);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let active = true;
    void (async () => {
      try {
        const result = await (await getHumanVerifier()).challenge(target);
        if (!active) return;
        if (result.kind === 'passed') passed.current(result.response);
        else setState(result.kind);
      } catch {
        if (active) setState('unavailable');
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setState('running');
    setAttempt((n) => n + 1);
  }

  return (
    <section
      aria-labelledby="human-verification-title"
      className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface-2 p-4"
    >
      <h2 id="human-verification-title" className="font-medium text-text">
        Confirm you’re a person
      </h2>
      <p className="text-sm text-muted">
        There have been several sign-in attempts. Complete this check to continue. Your email and password
        stay in the form.
      </p>
      <div ref={container} />
      <div role="status" aria-live="polite" className="text-sm">
        {state === 'running' ? (
          <p className="flex items-center gap-2 text-text">
            <Spinner size="sm" />
            Waiting for the check to finish…
          </p>
        ) : state === 'failed' ? (
          <p className="text-text">The check didn’t succeed. Try again.</p>
        ) : (
          <p className="text-text">
            The check can’t load right now, so sign-in is paused. Try again in a few minutes.
          </p>
        )}
      </div>
      {state !== 'running' ? (
        <Button type="button" variant="secondary" onClick={retry}>
          Try the check again
        </Button>
      ) : null}
    </section>
  );
}
