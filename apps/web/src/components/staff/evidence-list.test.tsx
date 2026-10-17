import type { StaffEvidence } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvidenceList } from './evidence-list';

const id = '0192f0d0-0000-7000-8000-00000000beef';
const image = (state: StaffEvidence['state'], stateNote: string | null): StaffEvidence => ({
  id,
  kind: 'image',
  description: 'Image from the reporter',
  submittedBy: 'reporter',
  submittedAt: '2026-10-17T12:00:00Z',
  state,
  visibility: 'staff_only',
  stateNote,
  derivative: state === 'available' ? { width: 40, height: 30 } : null,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('staff evidence images (Phase 9b, live)', () => {
  it('offers only a download of the cleaned copy, through a link the API issues', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    const link = 'https://s3.example.test/derivatives/derivative/x/y?X-Amz-Signature=abc';
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ kind: 'ok', data: { url: link, expiresAt: '2026-10-17T12:05:00Z' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = userEvent.setup();
    const { container } = render(<EvidenceList evidence={[image('available', null)]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/Cleaned image 40×30/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download cleaned image' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(link));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/mod/evidence/${id}/link`);
    expect(init.method).toBe('POST');
  });

  it('explains a rejected image and offers no download', () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    render(<EvidenceList evidence={[image('rejected', 'Animated images are not accepted.')]} />);
    expect(screen.getByText(/Animated images are not accepted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download cleaned image' })).toBeNull();
  });

  it('shows an error when the link cannot be issued', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'about:blank',
              title: 'x',
              status: 404,
              code: 'not_found',
              requestId: 'r',
            }),
            {
              status: 404,
            },
          ),
      ),
    );
    const user = userEvent.setup();
    render(<EvidenceList evidence={[image('available', null)]} />);
    await user.click(screen.getByRole('button', { name: 'Download cleaned image' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be created');
  });
});
