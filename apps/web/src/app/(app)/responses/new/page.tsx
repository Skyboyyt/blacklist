import { chainSlugSchema, projectSlugSchema, type ResponseTargetRef } from '@blacklist/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { ResponseForm } from '@/components/submissions/response-form';

export const metadata: Metadata = { title: 'Respond as the subject' };

interface PageProps {
  readonly searchParams: Promise<{
    chain?: string | string[];
    address?: string | string[];
    project?: string | string[];
  }>;
}

function targetFrom(params: Awaited<PageProps['searchParams']>): ResponseTargetRef | null {
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const project = projectSlugSchema.safeParse(one(params.project));
  if (project.success) return { kind: 'project', slug: project.data };
  const chain = chainSlugSchema.safeParse(one(params.chain));
  const address = one(params.address);
  return chain.success && address && address.length <= 100
    ? { kind: 'address', chain: chain.data, address }
    : null;
}

/** Right of reply (moderation §9): a party with standing responds publicly after a safety check. */
export default async function NewResponsePage({ searchParams }: PageProps) {
  const target = targetFrom(await searchParams);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Respond as the subject"
        description="If you control an address or represent a project, you can publish a plain-text response next to its findings. Staff check it for safety, not viewpoint. A response does not hide or change a finding; to dispute one, appeal it."
      />
      {target ? (
        <ResponseForm target={target} />
      ) : (
        <Notice tone="info" title="Choose what you are responding about">
          Open the address or project page and choose “Respond as the subject” or “Respond as the project”. To
          dispute a finding, use{' '}
          <Link href="/appeals/new" className="font-medium text-accent hover:underline">
            Appeals & responses
          </Link>
          .
        </Notice>
      )}
    </div>
  );
}
