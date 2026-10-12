import { Icon } from '@/components/ui/icon';

/** Persistent reminder shown on auth pages and in the footer. */
export function SeedPhraseNotice({ className }: { readonly className?: string }) {
  return (
    <p className={className ?? 'flex items-start gap-2 text-xs text-muted'}>
      <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" />
      <span>Blacklist will never ask for your seed phrase or private key.</span>
    </p>
  );
}
