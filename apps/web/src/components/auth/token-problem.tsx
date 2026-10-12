import type { TokenStatus } from '@blacklist/contracts';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

const COPY: Record<Exclude<TokenStatus, 'valid'> | 'missing', { title: string; body: string }> = {
  invalid: {
    title: 'This link is not valid',
    body: 'The link may be incomplete or already replaced by a newer one.',
  },
  missing: { title: 'This link is incomplete', body: 'Open the link exactly as it appears in the email.' },
  expired: { title: 'This link has expired', body: 'For your security, links work for a short time only.' },
  used: { title: 'This link was already used', body: 'Each link works once.' },
  superseded: {
    title: 'A newer link was sent',
    body: 'Only the most recent link works. Use the newest email, or request a new link.',
  },
};

interface TokenProblemProps {
  readonly status: Exclude<TokenStatus, 'valid'> | 'missing';
  readonly retryHref: string;
  readonly retryLabel: string;
}

/** Shared invalid / expired / used state for token pages. */
export function TokenProblem({ status, retryHref, retryLabel }: TokenProblemProps) {
  const copy = COPY[status];
  return (
    <div role="alert" className="flex flex-col items-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Icon name="alert" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold text-text">{copy.title}</h2>
      <p className="text-sm text-muted">{copy.body}</p>
      <ButtonLink href={retryHref} variant="secondary">
        {retryLabel}
      </ButtonLink>
    </div>
  );
}

export function FlowSuccess({
  title,
  body,
  href,
  cta,
}: {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-positive-soft text-positive">
        <Icon name="check" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      <ButtonLink href={href}>{cta}</ButtonLink>
    </div>
  );
}
