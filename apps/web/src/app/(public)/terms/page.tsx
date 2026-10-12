import type { Metadata } from 'next';
import { PolicyPage } from '@/components/policy/policy-page';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms"
      description="How to read Blacklist results and the rules for contributing."
      sections={[
        {
          title: 'How to read results',
          points: [
            'A risk band summarises the evidence Blacklist has reviewed. It is not a guarantee, and a low band never means “safe”.',
            'Interacting with or receiving funds from a flagged address is not evidence of wrongdoing.',
            'Information can be incomplete or out of date. Each page shows when it was last reviewed.',
          ],
        },
        {
          title: 'Contributing',
          points: [
            'Reports must be truthful and in good faith. Abusive or duplicate reports can be rejected.',
            'Submitting a project or contract address does not prove ownership, and connecting a wallet does not either.',
            'Do not upload other people’s personal data or anything you are not entitled to share.',
          ],
        },
        {
          title: 'Disagreeing with a result',
          points: [
            'Anyone affected can appeal a published finding. The finding stays visible as “Disputed — under appeal” while an independent reviewer decides.',
            'Anyone with an account can propose a correction to a project profile.',
          ],
        },
        {
          title: 'Not yet decided',
          points: [
            'Launch jurisdictions, liability, takedown handling and the full terms of service are open questions for qualified legal review.',
          ],
        },
      ]}
    />
  );
}
