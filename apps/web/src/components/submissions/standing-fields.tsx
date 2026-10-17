'use client';

import {
  AUTHORITY_ROLES,
  type AuthorityRole,
  type EvidenceFile,
  type StandingProof,
} from '@blacklist/contracts';
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { Notice } from '@/components/app/notice';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isMockApi } from '@/lib/api/mode';
import type { StandingChallengeView } from '@/lib/api/types';
import { signStandingMessage } from '@/lib/submissions/wallet-sign';
import { EvidenceUpload } from './evidence-upload';

export type StandingSubjectKind = 'wallet' | 'contract' | 'token' | 'unknown' | 'project';
type Mechanism = StandingProof['mechanism'];

export interface StandingState {
  readonly mechanism: Mechanism;
  readonly challenge: string | null;
  /** Live API: the challenge the signature is bound to, and the wallet's signature. */
  readonly challengeId: string | null;
  readonly signature: string | null;
  readonly signed: boolean;
  readonly authorityRole: AuthorityRole;
  readonly domain: string;
  readonly checked: boolean;
  readonly explanation: string;
  readonly evidence: readonly EvidenceFile[];
  /** Documentary standing without uploads: links (stored as text, never opened) and transactions. */
  readonly links: string;
  readonly txHashes: string;
}

export const INITIAL_STANDING: StandingState = {
  mechanism: 'documentary',
  challenge: null,
  challengeId: null,
  signature: null,
  signed: false,
  authorityRole: 'owner',
  domain: '',
  checked: false,
  explanation: '',
  evidence: [],
  links: '',
  txHashes: '',
};

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const AUTHORITY_LABEL: Readonly<Record<AuthorityRole, string>> = {
  owner: 'Owner',
  admin: 'Admin',
  upgrade_authority: 'Upgrade authority',
  mint_authority: 'Mint authority',
  deployer: 'Deployer',
};

const COPY: Readonly<Record<Mechanism, { label: string; hint: string }>> = {
  signature: {
    label: 'Sign a message with the address',
    hint: 'Shows you control the address now. It does not prove who you are or what happened in the past.',
  },
  authority_signature: {
    label: 'Sign with the on-chain authority',
    hint: 'For contracts and tokens: the owner, admin, upgrade or mint authority, or deployer signs, and a finalized chain read confirms that address holds the authority.',
  },
  dns_txt: {
    label: 'Add a DNS record',
    hint: 'For one of the profile’s official domains. Shows control of the domain at check time.',
  },
  documentary: {
    label: 'Documents reviewed by staff',
    hint: 'For lost keys, drained wallets, former team members, migrations and organisation representatives.',
  },
};

/** Which standing mechanisms fit a subject (moderation §6.2). Documents always fit. */
export function mechanismsFor(kind: StandingSubjectKind): readonly Mechanism[] {
  if (kind === 'contract' || kind === 'token') return ['authority_signature', 'documentary'];
  if (kind === 'project') return ['dns_txt', 'documentary'];
  return ['signature', 'documentary'];
}

const AUTHORITY_UNAVAILABLE =
  'Authority checks need verified chain data, which is not enabled yet. Use documents instead.';
const DNS_UNAVAILABLE = 'DNS standing arrives with project profiles. Use documents instead.';

/** The proof to send, or the message explaining what is still missing. */
export function standingProof(
  s: StandingState,
  chain?: string,
): { readonly ok: true; readonly proof: unknown } | { readonly ok: false; readonly message: string } {
  switch (s.mechanism) {
    case 'signature':
      if (s.challengeId && s.signature)
        return {
          ok: true,
          proof: { mechanism: 'signature', challengeId: s.challengeId, signature: s.signature },
        };
      if (!isMockApi()) return { ok: false, message: 'Show the message and sign it with your wallet first.' };
      return s.signed
        ? { ok: true, proof: { mechanism: 'signature', simulated: true } }
        : { ok: false, message: 'Show the message and complete the simulated signature first.' };
    case 'authority_signature':
      if (!isMockApi()) return { ok: false, message: AUTHORITY_UNAVAILABLE };
      return s.signed
        ? {
            ok: true,
            proof: { mechanism: 'authority_signature', authorityRole: s.authorityRole, simulated: true },
          }
        : { ok: false, message: 'Show the message and complete the simulated authority signature first.' };
    case 'dns_txt':
      if (!isMockApi()) return { ok: false, message: DNS_UNAVAILABLE };
      return s.checked
        ? { ok: true, proof: { mechanism: 'dns_txt', domain: s.domain, simulated: true } }
        : { ok: false, message: 'Choose a domain and complete the simulated DNS check first.' };
    case 'documentary':
      return {
        ok: true,
        proof: {
          mechanism: 'documentary',
          explanation: s.explanation,
          evidence: [...s.evidence],
          ...(lines(s.links).length ? { urls: lines(s.links) } : {}),
          ...(lines(s.txHashes).length && chain
            ? { txRefs: lines(s.txHashes).map((hash) => ({ chain, hash })) }
            : {}),
        },
      };
  }
}

interface StandingFieldsProps {
  readonly idPrefix: string;
  readonly subjectKind: StandingSubjectKind;
  /** Official domains for DNS standing on a project. */
  readonly domains: readonly string[];
  readonly value: StandingState;
  /** A state setter, so the evidence callback stays stable across renders. */
  readonly onChange: Dispatch<SetStateAction<StandingState>>;
  /** Loads the exact text to sign, built by the service (moderation §6.4). */
  readonly loadChallenge: () => Promise<StandingChallengeView | null>;
  /** The address whose control a signature proves. */
  readonly subject: { readonly chain: string; readonly address: string } | null;
  readonly errors: Readonly<Record<string, string>>;
}

/**
 * Standing controls shared by appeals and responses. Signature, authority-signature and
 * DNS checks are SIMULATED in the demo and say so; documentary standing goes to a staff
 * standing reviewer. Never asks for seed phrases, private keys or transaction signatures.
 */
export function StandingFields({
  idPrefix,
  subjectKind,
  domains,
  value,
  onChange,
  loadChallenge,
  subject,
  errors,
}: StandingFieldsProps) {
  const mock = isMockApi();
  const [signError, setSignError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const set = (patch: Partial<StandingState>) => onChange((prev) => ({ ...prev, ...patch }));
  const onEvidence = useCallback(
    (files: readonly EvidenceFile[]) => onChange((prev) => ({ ...prev, evidence: files })),
    [onChange],
  );
  const options = mechanismsFor(subjectKind);
  const signable = value.mechanism === 'signature' || value.mechanism === 'authority_signature';

  async function sign() {
    if (!subject || !value.challenge) return;
    setSigning(true);
    setSignError(null);
    const outcome = await signStandingMessage(subject.chain, subject.address, value.challenge);
    setSigning(false);
    if (outcome.kind === 'signed') set({ signature: outcome.signature });
    else setSignError(outcome.message);
  }

  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-text">How will you show standing?</legend>
        {options.map((m) => (
          <div key={m} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              id={`${idPrefix}-standing-${m}`}
              type="radio"
              name={`${idPrefix}-mechanism`}
              value={m}
              checked={value.mechanism === m}
              aria-describedby={`${idPrefix}-standing-${m}-hint`}
              onChange={() =>
                onChange((prev) => ({ ...INITIAL_STANDING, mechanism: m, explanation: prev.explanation }))
              }
              className="mt-1"
            />
            <div>
              <label htmlFor={`${idPrefix}-standing-${m}`} className="font-medium text-text">
                {COPY[m].label}
              </label>
              <p id={`${idPrefix}-standing-${m}-hint`} className="text-muted">
                {COPY[m].hint}
              </p>
            </div>
          </div>
        ))}
        {errors['standing'] ? (
          <p className="text-sm text-danger" role="alert">
            {errors['standing']}
          </p>
        ) : null}
      </fieldset>

      {!mock && (value.mechanism === 'authority_signature' || value.mechanism === 'dns_txt') ? (
        <Notice tone="info" title="Not available yet">
          {value.mechanism === 'dns_txt' ? DNS_UNAVAILABLE : AUTHORITY_UNAVAILABLE}
        </Notice>
      ) : null}

      {signable && (mock || value.mechanism === 'signature') ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          {value.mechanism === 'authority_signature' ? (
            <Field id={`${idPrefix}-authority`} label="Which authority will sign?">
              {(control) => (
                <Select
                  {...control}
                  value={value.authorityRole}
                  onChange={(e) => set({ authorityRole: e.target.value as AuthorityRole, signed: false })}
                >
                  {AUTHORITY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {AUTHORITY_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <p className="text-sm text-muted">
            You would sign this exact text. It authorizes no transaction or token approval and costs nothing.
            Blacklist never asks for seed phrases, private keys or transaction signatures.
          </p>
          {value.challenge ? (
            <pre className="identifier overflow-x-auto rounded bg-surface-2 p-3 text-xs whitespace-pre-wrap">
              {value.challenge}
            </pre>
          ) : (
            <Button
              variant="secondary"
              className="w-fit"
              onClick={() =>
                void loadChallenge().then(
                  (c) =>
                    c && set({ challenge: c.message, challengeId: c.challengeId ?? null, signature: null }),
                )
              }
            >
              Show the message to sign
            </Button>
          )}
          {value.challenge && mock ? (
            <Button
              variant="secondary"
              className="w-fit"
              disabled={value.signed}
              onClick={() => set({ signed: true })}
            >
              {value.signed ? 'Signature simulated' : 'Simulate signing (demo only)'}
            </Button>
          ) : null}
          {value.challenge && !mock ? (
            <>
              <p className="text-sm text-muted">
                Your wallet will show this text and ask you to sign a message. Only sign if it matches. The
                message expires 10 minutes after it was shown; get a new one if it does.
              </p>
              <Button
                variant="secondary"
                className="w-fit"
                loading={signing}
                loadingLabel="Waiting for your wallet…"
                disabled={!!value.signature}
                onClick={() => void sign()}
              >
                {value.signature ? 'Signed' : 'Sign with your wallet'}
              </Button>
              {signError ? (
                <p className="text-sm text-danger" role="alert">
                  {signError}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {value.mechanism === 'dns_txt' && mock ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Field id={`${idPrefix}-domain`} label="Official domain" error={errors['standing.domain']}>
            {(control) => (
              <Select
                {...control}
                value={value.domain}
                onChange={(e) => set({ domain: e.target.value, checked: false })}
              >
                <option value="">Choose a domain</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="text-sm text-muted">
            Add a TXT record at{' '}
            <span className="identifier break-all">_blacklist-standing.{value.domain || 'your-domain'}</span>{' '}
            with the case token the service shows you. Blacklist reads DNS only; it never opens your website.
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={value.checked || value.domain === ''}
            onClick={() => set({ checked: true })}
          >
            {value.checked ? 'DNS check simulated' : 'Simulate DNS check (demo only)'}
          </Button>
        </div>
      ) : null}

      {value.mechanism === 'documentary' ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Field
            id={`${idPrefix}-explanation`}
            label="What do the documents show?"
            hint="A staff standing reviewer records what was and was not established."
            error={errors['standing.explanation']}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={value.explanation}
                onChange={(e) => set({ explanation: e.target.value })}
              />
            )}
          </Field>
          <EvidenceUpload label="Document images" onChange={onEvidence} error={errors['standing.evidence']} />
          {mock ? null : (
            <>
              <Field
                id={`${idPrefix}-links`}
                label="Links to documents (one per line)"
                hint="Stored as text. Blacklist never opens them; a reviewer checks them by hand."
                error={errors['standing.urls']}
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={2}
                    value={value.links}
                    onChange={(e) => set({ links: e.target.value })}
                  />
                )}
              </Field>
              <Field
                id={`${idPrefix}-txs`}
                label="Transaction hashes that support your claim (one per line)"
                error={errors['standing.txRefs']}
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={2}
                    value={value.txHashes}
                    onChange={(e) => set({ txHashes: e.target.value })}
                  />
                )}
              </Field>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
