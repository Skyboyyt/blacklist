import { EmptyState } from '@/components/app/empty-state';
import { ButtonLink } from '@/components/ui/button';

/**
 * Shown instead of signed-in pages for anonymous viewers. This is a UX boundary
 * only: the API refuses the underlying data regardless of what the UI renders.
 */
export function SignInRequired() {
  return (
    <EmptyState
      icon="lock"
      titleAs="h1"
      title="Sign in to continue"
      description="This page shows your own reports, appeals and settings."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/login">Sign in</ButtonLink>
          <ButtonLink href="/register" variant="secondary">
            Create account
          </ButtonLink>
        </div>
      }
    />
  );
}

/**
 * Shown on staff routes to non-staff viewers. Not access control: staff data is
 * only ever returned by the API to a staff session with WebAuthn assurance.
 */
export function StaffOnly() {
  return (
    <EmptyState
      icon="shield"
      titleAs="h1"
      title="Staff access required"
      description="This area is for Blacklist moderators and administrators. Staff sign-in requires a passkey."
      action={
        <ButtonLink href="/" variant="secondary">
          Back to research
        </ButtonLink>
      }
    />
  );
}
