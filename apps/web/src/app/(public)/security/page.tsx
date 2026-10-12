import type { Metadata } from 'next';
import { PolicyPage } from '@/components/policy/policy-page';

export const metadata: Metadata = { title: 'Security' };

export default function SecurityPage() {
  return (
    <PolicyPage
      title="Security"
      description="How Blacklist protects your account and what it will never ask for."
      sections={[
        {
          title: 'What Blacklist never asks for',
          points: [
            'Seed phrases, recovery phrases or private keys.',
            'Transaction signatures, token approvals or typed-data signatures. Appeals that use a wallet ask you to sign a plain one-time message that authorizes nothing.',
            'Custody of your funds. Blacklist never holds or moves assets.',
          ],
        },
        {
          title: 'Your account',
          points: [
            'An account is created only after you prove you control the email address.',
            'You can see your active sessions and sign out of other devices from the security settings.',
            'Sensitive changes ask for your password again; security emails tell you what changed.',
          ],
        },
        {
          title: 'Staff accounts',
          points: [
            'Staff powers need a security key or passkey (WebAuthn). Consequential decisions ask for it again for that specific action.',
            'Severe findings need a second, independent reviewer, and appeals are reviewed by someone who did not take part in the original decision.',
            'Staff actions are recorded in an append-only audit history.',
          ],
        },
        {
          title: 'Links and files',
          points: [
            'Blacklist never opens links that people submit. They are shown as inert text.',
            'Uploaded images are kept in isolation and re-encoded before staff view them.',
          ],
        },
        {
          title: 'Reporting a vulnerability',
          points: [
            'A disclosure contact and process will be published before launch. Until then, do not test against systems you do not own.',
          ],
        },
      ]}
    />
  );
}
