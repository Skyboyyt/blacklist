'use client';

import {
  AUTHORITY_ROLES,
  type AuthorityRole,
  type EvidenceFile,
  type StandingProof,
} from '@blacklist/contracts';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EvidenceUpload } from './evidence-upload';

export type StandingSubjectKind = 'wallet' | 'contract' | 'token' | 'unknown' | 'project';
type Mechanism = StandingProof['mechanism'];

export interface StandingState {
  readonly mechanism: Mechanism;
  readonly challenge: string | null;
  readonly signed: boolean;
  readonly authorityRole: AuthorityRole;
  readonly domain: string;
  readonly checked: boolean;
  readonly explanation: string;
  readonly evidence: readonly EvidenceFile[];
}

export const INITIAL_STANDING: StandingState = {
  mechanism: 'documentary',
  challenge: null,
  signed: false,
  authorityRole: 'owner',
  domain: '',
  checked: false,
  explanation: '',
  evidence: [],
};

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

/** The proof to send, or the message explaining what is still missing. */
export function standingProof(
  s: StandingState,
): { readonly ok: true; readonly proof: unknown } | { readonly ok: false; readonly message: string } {
  switch (s.mechanism) {
    case 'signature':
      return s.signed
        ? { ok: true, proof: { mechanism: 'signature', simulated: true } }
        : { ok: false, message: 'Show the message and complete the simulated signature first.' };
    case 'authority_signature':
      return s.signed
        ? {
            ok: true,
            proof: { mechanism: 'authority_signature', authorityRole: s.authorityRole, simulated: true },
          }
        : { ok: false, message: 'Show the message and complete the simulated authority signature first.' };
    case 'dns_txt':
      return s.checked
        ? { ok: true, proof: { mechanism: 'dns_txt', domain: s.domain, simulated: true } }
        : { ok: false, message: 'Choose a domain and complete the simulated DNS check first.' };
    case 'documentary':
      return {
        ok: true,
        proof: { mechanism: 'documentary', explanation: s.explanation, evidence: [...s.evidence] },
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
  readonly loadChallenge: () => Promise<string | null>;
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
  errors,
}: StandingFieldsProps) {
  const set = (patch: Partial<StandingState>) => onChange((prev) => ({ ...prev, ...patch }));
  const onEvidence = useCallback(
    (files: readonly EvidenceFile[]) => onChange((prev) => ({ ...prev, evidence: files })),
    [onChange],
  );
  const options = mechanismsFor(subjectKind);
  const signing = value.mechanism === 'signature' || value.mechanism === 'authority_signature';

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

      {signing ? (
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
              onClick={() => void loadChallenge().then((text) => text && set({ challenge: text }))}
            >
              Show the message to sign
            </Button>
          )}
          {value.challenge ? (
            <Button
              variant="secondary"
              className="w-fit"
              disabled={value.signed}
              onClick={() => set({ signed: true })}
            >
              {value.signed ? 'Signature simulated' : 'Simulate signing (demo only)'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {value.mechanism === 'dns_txt' ? (
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
        </div>
      ) : null}
    </>
  );
}
