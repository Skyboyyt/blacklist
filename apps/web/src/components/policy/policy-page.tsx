import type { ReactNode } from 'react';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';

export interface PolicySection {
  readonly title: string;
  readonly points: readonly ReactNode[];
}

/**
 * A transparency page drafted from approved product commitments (PRD §6). It makes no
 * legal conclusions and is labelled as a draft: qualified legal review is a pre-launch
 * blocker (PRD §6.7, P-8).
 */
export function PolicyPage({
  title,
  description,
  sections,
}: {
  readonly title: string;
  readonly description: string;
  readonly sections: readonly PolicySection[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <Notice tone="warning" title="Draft pending legal review">
        This page describes the product commitments Blacklist is built on. It is not a legal document yet:
        qualified legal review must be completed before Blacklist launches publicly.
      </Notice>
      {sections.map((s) => (
        <DataCard key={s.title} title={s.title}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
            {s.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </DataCard>
      ))}
    </div>
  );
}
