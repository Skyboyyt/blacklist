import type { Viewer } from '@blacklist/contracts';
import { ButtonLink } from '@/components/ui/button';

/**
 * Entry points to the approved redress and reporting flows (built in Phase 4).
 * Signed-out viewers are sent to sign in first, returning here afterwards. This only
 * chooses a link: the API decides who may file what (Phase 7).
 */
export function ProjectActions({ viewer, slug }: { readonly viewer: Viewer; readonly slug: string }) {
  if (viewer.kind !== 'signed_in') {
    const next = encodeURIComponent(`/project/${slug}`);
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <ButtonLink href={`/login?next=${next}`} variant="secondary" size="sm">
          Sign in to respond, correct or appeal
        </ButtonLink>
        <p className="max-w-xs text-xs text-muted sm:text-right">
          Reports, corrections and appeals need an account.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink href="/appeals/new" variant="secondary" size="sm">
        Respond, correct or appeal
      </ButtonLink>
      <ButtonLink href="/reports/new" variant="ghost" size="sm">
        Report a concern
      </ButtonLink>
    </div>
  );
}
