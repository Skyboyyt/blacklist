import type { Metadata } from 'next';
import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { AppealForm } from '@/components/submissions/appeal-form';

export const metadata: Metadata = { title: 'Appeals & responses' };

/**
 * Standing is decided per case (moderation design §6). Present wallet control is only
 * one route; documentary standing covers people who cannot sign today.
 */
const STANDING =
  'You can show standing by signing a one-time message with the address, by a DNS record for a domain, or with documents reviewed by staff. Documents cover lost keys, compromised or drained wallets, victims, former team members, ownership transfers, contract migrations and organization representatives.';

const OPTIONS = [
  {
    title: 'Appeal a finding',
    text: `If a published finding that affects you is wrong, open it on its address or project page and choose “Appeal this finding”. ${STANDING} The finding stays visible as “Disputed — under appeal” while someone who did not write or approve it reviews your appeal.`,
  },
  {
    title: 'Respond as the subject',
    text: 'Add a public, plain-text response without disputing a finding: open the address or project page and choose “Respond as the subject”. The same standing routes apply, and staff check it for safety before it is published.',
  },
  {
    title: 'Request a correction',
    text: 'Anyone with an account can point out an error in a project profile from its page, using “Propose a correction”. No standing is needed.',
  },
] as const;

interface PageProps {
  readonly searchParams: Promise<{ finding?: string | string[] }>;
}

const FINDING_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function AppealsPage({ searchParams }: PageProps) {
  const { finding } = await searchParams;
  if (typeof finding === 'string' && FINDING_ID.test(finding)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Appeal a finding"
          description="Someone who did not write or approve the finding reviews your appeal. The finding stays visible as “Disputed — under appeal” meanwhile."
        />
        <AppealForm findingId={finding} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Appeals & responses"
        description="Disagree with something Blacklist published? Choose the option that fits."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {OPTIONS.map((o) => (
          <DataCard key={o.title} title={o.title}>
            <p className="text-sm text-muted">{o.text}</p>
          </DataCard>
        ))}
      </div>
    </div>
  );
}
