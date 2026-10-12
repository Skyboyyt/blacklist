import { EmptyState } from '@/components/app/empty-state';
import { ErrorState } from '@/components/app/error-state';
import { Button, ButtonLink } from '@/components/ui/button';

/** Shown when the service refuses the caller's role. The service decided; the page only explains. */
export function AccessDenied({ detail }: { readonly detail: string }) {
  return (
    <EmptyState
      icon="lock"
      titleAs="h2"
      title="Access denied"
      description={detail}
      action={
        <ButtonLink href="/mod" variant="secondary">
          Back to the review dashboard
        </ButtonLink>
      }
    />
  );
}

export function StaffLoadError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <ErrorState
      title="The review data couldn’t be loaded"
      description="Nothing was changed. Try again."
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
