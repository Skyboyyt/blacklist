import type { EvidenceFile } from '@blacklist/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { createMockMemberApi } from '@/lib/api/mock/member-api';
import { createStore } from '@/lib/api/mock/store';
import type { MemberApi } from '@/lib/api/types';
import { AppealForm } from './appeal-form';
import { EvidenceUpload } from './evidence-upload';
import { ReportForm } from './report-form';
import { SubmissionStatus } from './submission-status';

let cookies = 'bl_mock_viewer=member';
let api: MemberApi;
const push = vi.fn();
vi.mock('@/lib/api/browser', () => ({ getMemberApi: async () => api }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/reports/new',
}));

beforeEach(() => {
  // These cases exercise the demo build; the live build is covered at the end.
  vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
  cookies = 'bl_mock_viewer=member';
  push.mockReset();
  api = createMockMemberApi({
    cookies: () => cookies,
    latencyMs: 0,
    now: () => new Date('2026-10-01T12:00:00Z'),
    store: createStore(),
  });
});

const file = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('evidence upload (image-only, simulated)', () => {
  it('refuses active content, wrong extensions, empty and oversized files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onChange = vi.fn();
    render(<EvidenceUpload label="Screenshots" onChange={onChange} />);
    await user.upload(screen.getByLabelText('Choose images'), [
      file('page.html', 'text/html', 10),
      file('fake.png.exe', 'image/png', 10),
      file('empty.png', 'image/png', 0),
      file('big.png', 'image/png', 11 * 1024 * 1024),
    ]);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/page\.html: only PNG, JPEG and WebP/)).toBeInTheDocument();
    expect(within(alert).getByText(/fake\.png\.exe: only PNG, JPEG and WebP/)).toBeInTheDocument();
    expect(within(alert).getByText(/empty\.png: the file is empty/)).toBeInTheDocument();
    expect(within(alert).getByText(/big\.png: larger than 10 MiB/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenLastCalledWith(expect.arrayContaining([expect.anything()]));
  });

  it('reports only finished files, and a failed simulated upload can be retried', async () => {
    const user = userEvent.setup();
    let latest: readonly EvidenceFile[] = [];
    render(<EvidenceUpload label="Screenshots" onChange={(f) => (latest = f)} />);
    expect(screen.getByText(/Demo/)).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose images'), [
      file('ok.png', 'image/png', 100),
      file('will-fail.png', 'image/png', 100),
    ]);
    expect(await screen.findByText('Simulated upload failed', {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(latest.map((f) => f.name)).toEqual(['ok.png']));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(latest).toHaveLength(2), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Remove ok.png' }));
    await waitFor(() => expect(latest.map((f) => f.name)).toEqual(['will-retried.png']));
  });
});

describe('report form', () => {
  it('validates per network before sending and sends nothing when invalid', async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(api, 'submitReport');
    render(<ReportForm />);
    await user.type(screen.getByLabelText('Short title'), 'Fake airdrop');
    await user.selectOptions(screen.getAllByLabelText('Network')[0] as HTMLElement, 'solana');
    await user.type(screen.getByLabelText('Address 1'), `0xb1ac${'1'.repeat(36)}`);
    await user.click(screen.getByRole('button', { name: 'Send private report' }));
    expect(await screen.findByText('Check the highlighted fields')).toBeInTheDocument();
    expect(screen.getByText('This is not a valid address for the selected network.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends a valid report and opens its private status page', async () => {
    const user = userEvent.setup();
    const view = render(<ReportForm />);
    await user.type(screen.getByLabelText('Short title'), 'Fake airdrop claim page');
    await user.type(screen.getByLabelText('Address 1'), `0xb1ac${'1'.repeat(36)}`);
    await user.type(screen.getByLabelText('When did it happen?'), '2026-09-01');
    await user.type(
      screen.getByLabelText('What happened?'),
      'A fake airdrop page asked me to approve a spender.',
    );
    await expectNoAxeViolations(view.container);
    await user.click(screen.getByRole('button', { name: 'Send private report' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/reports\/RPT-\d+$/)));
  });
});

describe('submission status', () => {
  it('shows the information request, accepts a reply and hides the form afterwards', async () => {
    const user = userEvent.setup();
    const view = render(<SubmissionStatus id="RPT-1003" />);
    expect(await screen.findByText('Message from staff')).toBeInTheDocument();
    expect(screen.getByText('Private: only you and Blacklist staff can see this.')).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your reply'), 'Here is the transaction hash you asked for.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('In review')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your reply')).toBeNull();
  });

  it("does not show another member's submission", async () => {
    render(<SubmissionStatus id="RPT-1001" />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
    expect(screen.queryByText('History')).toBeNull();
  });

  it('shows the fixed-list reason after a rejection, never the internal rationale', async () => {
    render(<SubmissionStatus id="COR-3003" />);
    expect(await screen.findByText(/Reason \(shown only to you\):/)).toBeInTheDocument();
    expect(screen.queryByText(/rationale/i)).toBeNull();
  });
});

describe('appeal form', () => {
  it('requires the simulated signature, which is labelled as a demo and never a transaction', async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(api, 'submitAppeal');
    render(<AppealForm findingId="demo-finding-301" />);
    await user.type(
      await screen.findByLabelText('Why is the finding wrong?'),
      'The payments were refunds I made.',
    );
    await user.click(screen.getByLabelText('Sign a message with the address'));
    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(
      screen.getByText('Show the message and complete the simulated signature first.'),
    ).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/never asks for seed phrases, private keys or transaction signatures/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show the message to sign' }));
    expect(await screen.findByText(/does not authorize any transaction/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate signing (demo only)' }));
    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/appeals\/APL-\d+$/)));
  });

  it('documentary standing needs at least one document image', async () => {
    const user = userEvent.setup();
    render(<AppealForm findingId="demo-finding-301" />);
    await user.type(
      await screen.findByLabelText('Why is the finding wrong?'),
      'The payments were refunds I made.',
    );
    await user.type(screen.getByLabelText('What do the documents show?'), 'Refund records for each payment.');
    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(await screen.findByText('Attach a document image, a link or a transaction.')).toBeInTheDocument();
  });

  it('explains when the finding cannot be appealed here', async () => {
    render(<AppealForm findingId="no-such-finding" />);
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});

describe('live build (Phase 9a slice 5)', () => {
  it('replaces image uploads with a notice until the evidence processor exists', () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    render(<EvidenceUpload label="Screenshots" onChange={() => undefined} />);
    expect(screen.getByText(/Image uploads are not available yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose images')).toBeNull();
  });

  it('offers real wallet signing instead of a simulated signature', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    const user = userEvent.setup();
    const submit = vi.spyOn(api, 'submitAppeal');
    render(<AppealForm findingId="demo-finding-301" />);
    await user.type(
      await screen.findByLabelText('Why is the finding wrong?'),
      'The payments were refunds I made.',
    );
    await user.click(screen.getByLabelText('Sign a message with the address'));
    await user.click(screen.getByRole('button', { name: 'Show the message to sign' }));
    expect(await screen.findByRole('button', { name: 'Sign with your wallet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulate signing (demo only)' })).toBeNull();
    // Without a wallet in the browser nothing is signed and nothing is sent.
    await user.click(screen.getByRole('button', { name: 'Sign with your wallet' }));
    expect(await screen.findByText('No Ethereum wallet was found in this browser.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(screen.getByText('Show the message and sign it with your wallet first.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});
