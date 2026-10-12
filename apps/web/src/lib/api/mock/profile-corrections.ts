/**
 * DEMONSTRATION of how an accepted project-profile correction changes the public profile
 * (a new append-only staff revision; data-model §4). A rejected correction leaves the
 * profile untouched. Internal rationale never enters the profile: only the fields below
 * and a public history label do.
 */
import type { ProfileChange } from '@blacklist/contracts';
import type { ProfileState } from '../types';

export function applyCorrection(profile: ProfileState, changes: readonly ProfileChange[]): ProfileState {
  let description = profile.description;
  let domains = [...profile.domains];
  for (const change of changes) {
    if (change.field === 'description' && change.proposed !== null) description = change.proposed;
    if (change.field === 'domain_added' && change.proposed !== null && !domains.includes(change.proposed)) {
      domains = [...domains, change.proposed];
    }
    if (change.field === 'domain_retired' && change.current !== null) {
      domains = domains.filter((d) => d !== change.current);
    }
  }
  return { slug: profile.slug, revision: profile.revision + 1, description, domains };
}
