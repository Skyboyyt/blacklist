'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getEvidenceLink } from '@/lib/api/live/evidence';

/**
 * Downloads the sanitized copy of an image through a five-minute link the API issues and
 * records (ARCHITECTURE §14.4). The file comes from the storage domain as an attachment;
 * it is never embedded in this page, and originals have no link at all.
 */
export function DerivativeDownload({
  evidenceId,
  size,
}: {
  readonly evidenceId: string;
  readonly size: { readonly width: number; readonly height: number } | null;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  async function download() {
    setState('busy');
    const url = await getEvidenceLink(evidenceId);
    if (!url) {
      setState('failed');
      return;
    }
    setState('idle');
    window.location.assign(url);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Icon name="image" className="size-4 text-muted" />
      <span className="text-muted">
        Cleaned image{size ? ` ${size.width}×${size.height}` : ''}. Metadata removed; the original is never
        shown.
      </span>
      <Button size="sm" variant="secondary" onClick={() => void download()} disabled={state === 'busy'}>
        {state === 'busy' ? 'Preparing…' : 'Download cleaned image'}
      </Button>
      {state === 'failed' ? (
        <span role="alert" className="text-xs text-danger">
          The download link could not be created. Reload the case and try again.
        </span>
      ) : null}
    </div>
  );
}
