import { ButtonLink } from '@/components/ui/button';

/**
 * Chooses between the newest block or slot (fresh, may still change) and the finalized one
 * (settled, older: about 13 minutes on Ethereum). The page labels whichever it shows.
 */
export function FinalityToggle({ href, final }: { readonly href: string; readonly final: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="text-muted">
        {final
          ? 'Showing finalized data: settled, but a few minutes older than the newest block.'
          : 'Showing the newest data: fresh, but not yet final and could still change.'}
      </p>
      <ButtonLink href={final ? href : `${href}?finality=final`} variant="secondary" size="sm">
        {final ? 'Show newest data' : 'Show finalized data'}
      </ButtonLink>
    </div>
  );
}
