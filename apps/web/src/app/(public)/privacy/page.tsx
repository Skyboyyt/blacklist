import type { Metadata } from 'next';
import { PolicyPage } from '@/components/policy/policy-page';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy"
      description="What Blacklist keeps private, what becomes public, and why."
      sections={[
        {
          title: 'Private by default',
          points: [
            'Your email address, account details, sessions and security events.',
            'Draft and pending reports, your identity as a reporter, unpublished evidence and all original files.',
            'Standing claims you make in an appeal, and staff internal notes and individual staff identities.',
            'Your research activity. Looking up a public address does not make your research public.',
          ],
        },
        {
          title: 'What becomes public',
          points: [
            'Only reviewed outcomes: published findings, project profiles and their revision history, appeal outcomes and responses.',
            'An unreviewed report has no public effect: no counts, indicators or changes to an assessment.',
            'Public pages never show who reported something.',
          ],
        },
        {
          title: 'Data minimisation',
          points: [
            'Network details are kept as summaries (for example, an IP prefix and a device summary), not as a full record.',
            'No third-party analytics on account or sign-in pages. Search terms are not stored with your identity.',
            'Retention will follow a schedule approved by counsel. Removing a name is not treated as erasure.',
          ],
        },
        {
          title: 'Evidence you upload',
          points: [
            'Only PNG, JPEG and WebP images are accepted. Files are checked and re-encoded before staff see them, and active content is never opened.',
            'Never include seed phrases, private keys or passwords in a screenshot.',
          ],
        },
      ]}
    />
  );
}
