'use client';

import { profileUpdateSchema, type Profile } from '@blacklist/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { LoadingStatus } from '@/components/states/skeletons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getMemberApi } from '@/lib/api/browser';
import { formatDateTimeUtc } from '@/lib/format/date';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly profile: Profile }
  | { readonly kind: 'problem'; readonly alert: FormAlertState };

/**
 * The minimal private profile (PRD §5.3): a fixed handle and an optional display name.
 * Neither is shown publicly in V1, and neither is shown on anything the member submits.
 */
export function ProfileForm() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await (await getMemberApi()).getProfile();
        if (!active) return;
        if (result.kind === 'ok') {
          setLoad({ kind: 'ready', profile: result.data });
          setDisplayName(result.data.displayName ?? '');
        } else {
          setLoad({ kind: 'problem', alert: memberErrorAlert(result) });
        }
      } catch {
        if (active)
          setLoad({ kind: 'problem', alert: { kind: 'error', title: 'Your profile couldn’t be loaded' } });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = profileUpdateSchema.safeParse({ displayName });
    if (!parsed.success) {
      setError(issuesToErrors(parsed.error.issues)['displayName']);
      return;
    }
    setError(undefined);
    setSaved(false);
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const result = await (await getMemberApi()).updateProfile(parsed.data);
      if (result.kind === 'ok') {
        setLoad({ kind: 'ready', profile: result.data });
        setSaved(true);
      } else {
        if (result.code === 'invalid') setError(result.fieldErrors['displayName']);
        setAlert(memberErrorAlert(result));
      }
    } catch {
      setAlert({
        kind: 'error',
        title: 'Your profile couldn’t be saved',
        message: 'Nothing was changed. Try again.',
      });
    }
    setPending(false);
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading your profile…" />;
  if (load.kind === 'problem') return <FormAlert state={load.alert} />;
  const { profile } = load;

  return (
    <form noValidate onSubmit={save} className="flex max-w-lg flex-col gap-5">
      <FormAlert state={alert} />
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Handle</span>
        <span className="identifier break-all text-text">{profile.handle}</span>
        <span className="text-xs text-muted">Chosen at registration. Handles can’t be changed in V1.</span>
      </div>
      <Field
        id="profile-display-name"
        label="Display name (optional)"
        hint="Private. Shown only to you in V1. Leave it empty to remove it."
        error={error}
      >
        {(control) => (
          <Input
            {...control}
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
      </Field>
      <p className="text-xs text-muted">
        Last updated <time dateTime={profile.updatedAt}>{formatDateTimeUtc(profile.updatedAt)}</time>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} loadingLabel="Saving…" className="w-fit">
          Save profile
        </Button>
        <p role="status" className="text-sm text-positive">
          {saved ? 'Profile saved.' : ''}
        </p>
      </div>
    </form>
  );
}
