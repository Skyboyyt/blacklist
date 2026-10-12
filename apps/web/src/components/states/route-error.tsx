'use client';

import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';

interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Route-level error boundary. Shows a generic message and the opaque digest only —
 * never the error message or stack, which may contain internals.
 */
export function RouteError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorState
      title="Something went wrong"
      description="We could not load this page. This is not a statement about any address or transaction. Try again in a moment."
      reference={error.digest}
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
