import type { Metadata } from 'next';
import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { NotAvailableYet } from '@/components/states/not-available';

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
    text: `If a published finding that affects you is wrong. ${STANDING} The finding stays visible as “Disputed — under appeal” while someone who did not write or approve it reviews your appeal.`,
  },
  {
    title: 'Respond as the subject',
    text: 'Add a public response to a finding without disputing it. The same standing routes apply.',
  },
  {
    title: 'Request a correction',
    text: 'Anyone with an account can point out a factual error, such as a wrong date, amount or subject. No standing is needed.',
  },
] as const;

export default function AppealsPage() {
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
      <NotAvailableYet feature="Filing appeals and responses" icon="appeals" />
    </div>
  );
}
