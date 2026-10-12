import { Icon } from '@/components/ui/icon';

/**
 * Attacker-controllable text (token names, self-reported labels). Rendered as
 * plain text, visibly marked as unverified, and never styled as a verified name.
 */
export function UntrustedText({
  value,
  kind = 'Self-reported name',
}: {
  readonly value: string;
  readonly kind?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded border border-dashed border-warning/60 px-1.5 py-0.5 text-sm text-text">
        “{value}”
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-warning">
        <Icon name="alert" className="size-3.5" />
        {kind} — unverified
      </span>
    </span>
  );
}
