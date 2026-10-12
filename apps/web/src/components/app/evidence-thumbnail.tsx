import type { EvidenceItem } from '@blacklist/contracts';
import { Icon } from '@/components/ui/icon';

const STATUS_LABEL: Record<EvidenceItem['status'], string> = {
  processing: 'Processing — not yet available',
  available: 'Redacted image',
  redacted: 'Redacted by moderators',
  removed: 'Removed',
};

/**
 * Evidence image placeholder (shell). Real thumbnails are re-encoded, redacted
 * derivatives served from a separate download origin (ADR 0004); this shell
 * never loads user-supplied images.
 */
export function EvidenceThumbnail({ item }: { readonly item: EvidenceItem }) {
  return (
    <figure className="flex w-40 flex-col gap-1.5">
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-surface-2 text-subtle">
        <Icon name="image" className="size-6" />
      </div>
      <figcaption className="text-xs">
        <span className="block text-text">{item.caption}</span>
        <span className="text-muted">{STATUS_LABEL[item.status]}</span>
      </figcaption>
    </figure>
  );
}
