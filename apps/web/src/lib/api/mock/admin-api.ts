/**
 * Mock administrator console (development and tests only; never in production builds).
 *
 * It enforces, by itself, the rules the UI shows (identity §10; ARCHITECTURE §9.2, §9.4):
 * 1. the caller is an active administrator (otherwise `forbidden`);
 * 2. privilege increases need a second, different administrator (invitations for the
 *    admin role, role grants, revoking another admin's role, recovery approval);
 * 3. reductions take effect at once (removing moderator or appeal-reviewer roles,
 *    suspension, offboarding);
 * 4. consequential actions consume a fresh, single-use, action-bound step-up grant.
 * Effects reach the rest of the demo: a suspended or offboarded staff member loses
 * staff access in the moderation service, a suspended member cannot submit, labels and
 * suppressions change public address pages. All state is the shared demo store.
 * This is NOT production authorization.
 */
import {
  invitationRequestSchema,
  labelRequestSchema,
  reasonRequestSchema,
  roleChangeRequestSchema,
  suppressionRequestSchema,
  type AuditEntry,
  type PasskeyResult,
  type RecoveryCase,
  type StaffRef,
} from '@blacklist/contracts';
import type { AdminApi, ModerationResult } from '../types';
import { consumeGrant, issueGrant } from './step-up';
import { KNOWN_ACCOUNT_EMAILS } from './fixtures/admin';
import { STAFF } from './fixtures/moderation';
import { applySuppression, liftSuppression, syncLabel } from './public-effects';
import { currentPasskeyResult, currentScenario, currentViewerKey, type MockViewerKey } from './scenario';
import { addRecoveryVerification } from './recovery';
import { createStore, nextId, type MockStore } from './store';

export interface MockAdminOptions {
  readonly cookies: () => string;
  readonly now?: () => Date;
  readonly latencyMs?: number;
  readonly store?: MockStore;
}

const STEP_UP_TTL_MS = 5 * 60 * 1000;
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const OBJECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

const ADMINS: Partial<Record<MockViewerKey, StaffRef>> = { admin: STAFF.admin, admin_b: STAFF.adminB };

const clone = <T>(value: T): T => structuredClone(value);
const ok = <T>(data: T): ModerationResult<T> => ({ kind: 'ok', data });
const notFound = { kind: 'error', code: 'not_found' } as const;
const stepUp = { kind: 'error', code: 'stepup_required' } as const;

function err<T>(
  code: 'forbidden' | 'invalid_transition' | 'not_eligible',
  detail: string,
): ModerationResult<T> {
  return { kind: 'error', code, detail };
}

/** Masks an email for display: first letter, then the domain. */
function mask(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** A fictional one-time enrollment code (10 characters, as identity §10.4 specifies). */
function demoCode(seq: number): string {
  return `DEMO${String(seq).padStart(6, '0')}`;
}

export function createMockAdminApi(options: MockAdminOptions): AdminApi {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 300;
  const wait = () => (latency > 0 ? new Promise<void>((r) => setTimeout(r, latency)) : Promise.resolve());
  const store = options.store ?? createStore();
  const at = () => now().toISOString();

  /** The calling administrator, only while their account is active and holds the admin role. */
  function admin(): StaffRef | null {
    const ref = ADMINS[currentViewerKey(options.cookies())];
    if (!ref || currentScenario(options.cookies()) === 'session_expired') return null;
    const member = store.staff.find((m) => m.id === ref.id);
    return member?.status === 'active' && member.roles.includes('admin') ? ref : null;
  }

  function record(
    actor: StaffRef,
    action: AuditEntry['action'],
    reason: string | null,
    changes: AuditEntry['changes'],
  ) {
    store.seq += 1;
    store.audit.push({ id: `audit-${store.seq}`, at: at(), actor, action, caseId: null, reason, changes });
  }

  function consume(action: string, target: string, parameters: readonly unknown[]): boolean {
    const me = admin();
    return (
      me !== null &&
      consumeGrant(store, me.id, options.cookies(), action, target, parameters, now().getTime())
    );
  }

  const activeAdmins = () => store.staff.filter((s) => s.status === 'active' && s.roles.includes('admin'));
  const forbidden = <T>() =>
    err<T>('forbidden', 'The administrator console needs an active administrator account.');

  function applyRole(
    target: string,
    role: (typeof store.staff)[number]['roles'][number],
    action: 'grant' | 'revoke',
  ) {
    const m = store.staff.find((s) => s.id === target);
    if (!m) return;
    store.grants.clear();
    m.roles = action === 'grant' ? [...new Set([...m.roles, role])] : m.roles.filter((r) => r !== role);
  }

  /** Releases a departing reviewer's open cases so nothing waits on them. */
  function releaseCases(staffId: string) {
    for (const c of store.cases.values()) if (c.assignedTo?.id === staffId) c.assignedTo = null;
  }

  return {
    async verifyStepUp(action, targetId, parameters = []): Promise<PasskeyResult> {
      await wait();
      const me = admin();
      if (!me || currentScenario(options.cookies()) === 'session_expired') return { kind: 'session_expired' };
      const kind = currentPasskeyResult(options.cookies());
      if (kind === 'verified')
        issueGrant(
          store,
          me.id,
          options.cookies(),
          action,
          targetId,
          parameters,
          now().getTime() + STEP_UP_TTL_MS,
        );
      return { kind };
    },

    async getOverview() {
      await wait();
      if (!admin()) return forbidden();
      return ok({
        activeStaff: store.staff.filter((s) => s.status === 'active').length,
        pendingInvitations: store.invitations.filter((i) => i.state === 'pending_approval').length,
        pendingRoleRequests: store.roleRequests.filter((r) => r.state === 'pending').length,
        openRecoveryCases: store.recoveries.filter((r) => r.state !== 'completed').length,
        suspendedMembers: store.members.filter((m) => m.status === 'suspended').length,
        activeLabels: store.labels.filter((l) => l.status === 'active').length,
        activeSuppressions: store.suppressions.filter((s) => s.liftedAt === null).length,
        alerts: clone(store.alerts),
      });
    },

    async listStaff() {
      await wait();
      return admin() ? ok(clone(store.staff)) : forbidden();
    },

    async listInvitations() {
      await wait();
      return admin() ? ok(clone(store.invitations)) : forbidden();
    },

    async createInvitation(request) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = invitationRequestSchema.safeParse(request);
      if (!parsed.success) return err('invalid_transition', 'Enter a valid email address and role.');
      const masked = mask(parsed.data.email);
      if (KNOWN_ACCOUNT_EMAILS.includes(parsed.data.email.toLowerCase())) {
        return err(
          'invalid_transition',
          'This email may already belong to an account. Invitations are for new accounts only.',
        );
      }
      if (!consume('staff.invite', 'new', [parsed.data])) return stepUp;
      const needsSecond = parsed.data.role === 'admin';
      const invitation = {
        id: nextId(store, 'INV'),
        emailMasked: masked,
        role: parsed.data.role,
        state: needsSecond ? ('pending_approval' as const) : ('issued' as const),
        invitedBy: me,
        approvedBy: null,
        requiresSecondApproval: needsSecond,
        createdAt: at(),
        expiresAt: new Date(now().getTime() + INVITATION_TTL_MS).toISOString(),
      };
      store.invitations.unshift(invitation);
      record(me, 'staff_invitation_created', null, [
        { field: 'invitation', from: null, to: `${invitation.id} (${invitation.role})` },
      ]);
      return ok({ invitation: clone(invitation), enrollmentCode: demoCode(store.seq) });
    },

    async approveInvitation(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const inv = store.invitations.find((i) => i.id === id);
      if (!inv) return notFound;
      if (inv.state !== 'pending_approval')
        return err('invalid_transition', 'This invitation is not waiting for approval.');
      if (inv.invitedBy.id === me.id) {
        return err('not_eligible', 'A second, different administrator must approve an admin invitation.');
      }
      if (!consume('staff.invitation.approve', id, [id])) return stepUp;
      inv.state = 'issued';
      inv.approvedBy = me;
      record(me, 'staff_invitation_approved', null, [
        { field: 'invitation', from: 'pending_approval', to: 'issued' },
      ]);
      return ok(clone(inv));
    },

    async revokeInvitation(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const inv = store.invitations.find((i) => i.id === id);
      if (!inv) return notFound;
      if (inv.state !== 'pending_approval' && inv.state !== 'issued') {
        return err('invalid_transition', 'Only pending or issued invitations can be revoked.');
      }
      if (!consume('staff.invitation.revoke', id, [id])) return stepUp;
      const from = inv.state;
      inv.state = 'revoked';
      record(me, 'staff_invitation_revoked', null, [{ field: 'invitation', from, to: 'revoked' }]);
      return ok(clone(inv));
    },

    async listRoleRequests() {
      await wait();
      return admin() ? ok(clone(store.roleRequests)) : forbidden();
    },

    async requestRoleChange(request) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = roleChangeRequestSchema.safeParse(request);
      if (!parsed.success) return err('invalid_transition', 'Choose a staff member, a role and an action.');
      const { targetId, role, action } = parsed.data;
      const target = store.staff.find((s) => s.id === targetId);
      if (!target || target.status === 'deactivated') return notFound;
      if (action === 'grant' && target.roles.includes(role))
        return err('invalid_transition', 'They already hold this role.');
      if (action === 'revoke' && !target.roles.includes(role))
        return err('invalid_transition', 'They do not hold this role.');
      if (
        store.roleRequests.some((r) => r.state === 'pending' && r.target.id === targetId && r.role === role)
      ) {
        return err('invalid_transition', 'A request for this role change is already waiting for approval.');
      }
      if (!consume('staff.role', targetId, [parsed.data])) return stepUp;
      const ref = { id: target.id, handle: target.handle };
      // Reductions take effect at once; removing another admin's role is an exception (identity §10.8).
      const immediate = action === 'revoke' && (role !== 'admin' || targetId === me.id);
      if (immediate) {
        if (role === 'admin' && activeAdmins().length <= 1) {
          return err('invalid_transition', 'At least one active administrator must remain.');
        }
        applyRole(targetId, role, 'revoke');
        record(me, 'staff_role_revoked', null, [{ field: `${ref.handle} role`, from: role, to: null }]);
      } else {
        store.roleRequests.unshift({
          id: nextId(store, 'ROLE'),
          target: ref,
          role,
          action,
          proposedBy: me,
          approvedBy: null,
          state: 'pending',
          createdAt: at(),
        });
        record(me, 'staff_role_requested', null, [
          {
            field: `${ref.handle} role`,
            from: null,
            to: `${action} ${role} (waiting for a second administrator)`,
          },
        ]);
      }
      return ok(clone(store.roleRequests));
    },

    async approveRoleRequest(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const req = store.roleRequests.find((r) => r.id === id);
      if (!req) return notFound;
      if (req.state !== 'pending')
        return err('invalid_transition', 'This request is not waiting for approval.');
      if (req.proposedBy.id === me.id) {
        return err(
          'not_eligible',
          'A different administrator from the proposer must approve this role change.',
        );
      }
      if (req.target.id === me.id)
        return err('not_eligible', 'You cannot approve a role change for yourself.');
      if (!consume('staff.role.approve', id, [id])) return stepUp;
      req.state = 'approved';
      req.approvedBy = me;
      applyRole(req.target.id, req.role, req.action);
      record(me, 'staff_role_approved', null, [
        { field: `${req.target.handle} role`, from: null, to: `${req.action} ${req.role}` },
      ]);
      return ok(clone(store.roleRequests));
    },

    async cancelRoleRequest(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const req = store.roleRequests.find((r) => r.id === id);
      if (!req) return notFound;
      if (req.state !== 'pending')
        return err('invalid_transition', 'This request is not waiting for approval.');
      req.state = 'cancelled';
      record(me, 'staff_role_requested', null, [
        { field: `${req.target.handle} role`, from: 'pending', to: 'cancelled' },
      ]);
      return ok(clone(store.roleRequests));
    },

    async suspendStaff(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const target = store.staff.find((s) => s.id === id);
      if (!target) return notFound;
      if (target.status !== 'active')
        return err('invalid_transition', 'Only an active staff account can be suspended.');
      if (target.roles.includes('admin') && activeAdmins().length <= 1) {
        return err(
          'invalid_transition',
          'The last active administrator cannot be suspended here. Use the operator procedure.',
        );
      }
      if (!consume('staff.suspend', id, [id, parsed.data.reason])) return stepUp;
      store.grants.clear();
      target.status = 'suspended';
      releaseCases(id);
      record(me, 'staff_suspended', parsed.data.reason, [
        { field: target.handle, from: 'active', to: 'suspended' },
      ]);
      return ok(clone(store.staff));
    },

    async offboardStaff(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const target = store.staff.find((s) => s.id === id);
      if (!target) return notFound;
      if (target.status === 'deactivated')
        return err('invalid_transition', 'This account is already offboarded.');
      if (target.id === me.id) return err('not_eligible', 'Another administrator must offboard you.');
      if (target.roles.includes('admin') && activeAdmins().length <= 1) {
        return err('invalid_transition', 'At least one active administrator must remain.');
      }
      if (!consume('staff.offboard', id, [id, parsed.data.reason])) return stepUp;
      const from = target.status;
      store.grants.clear();
      target.status = 'deactivated';
      target.roles = [];
      target.authenticators = 0;
      releaseCases(id);
      for (const inv of store.invitations) {
        if (inv.invitedBy.id === id && (inv.state === 'pending_approval' || inv.state === 'issued'))
          inv.state = 'revoked';
      }
      record(me, 'staff_offboarded', parsed.data.reason, [{ field: target.handle, from, to: 'deactivated' }]);
      return ok(clone(store.staff));
    },

    async listRecoveries() {
      await wait();
      return admin() ? ok(clone(store.recoveries)) : forbidden();
    },

    async openRecovery(staffId) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const subject = store.staff.find((s) => s.id === staffId);
      if (!subject || subject.status === 'deactivated') return notFound;
      if (subject.id === me.id)
        return err('not_eligible', 'Another administrator must open your recovery case.');
      if (store.recoveries.some((r) => r.subject.id === staffId && r.state !== 'completed')) {
        return err('invalid_transition', 'A recovery case is already open for this person.');
      }
      if (!consume('staff.recovery.open', staffId, [staffId])) return stepUp;
      store.grants.clear();
      subject.status = 'suspended';
      subject.authenticators = 0;
      releaseCases(staffId);
      const recovery: RecoveryCase = {
        id: nextId(store, 'REC'),
        subject: { id: subject.id, handle: subject.handle },
        openedBy: me,
        verifications: [],
        approvedBy: null,
        objectionWindowEndsAt: null,
        state: 'verifying',
        createdAt: at(),
      };
      store.recoveries.unshift(recovery);
      record(me, 'staff_recovery_opened', null, [
        { field: subject.handle, from: 'active', to: 'recovery (suspended)' },
      ]);
      return ok(clone(recovery));
    },

    async verifyRecovery(id, method, rationale) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      return addRecoveryVerification(store, id, { ref: me, isAdmin: true }, method, rationale, at());
    },

    async approveRecovery(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const r = store.recoveries.find((x) => x.id === id);
      if (!r) return notFound;
      if (r.state !== 'awaiting_approval')
        return err('invalid_transition', 'Two verifications are needed before approval.');
      if (r.openedBy.id === me.id) {
        return err(
          'not_eligible',
          'Approval must come from a different administrator than the one who opened the case.',
        );
      }
      if (!consume('staff.recovery.approve', id, [id])) return stepUp;
      r.approvedBy = me;
      r.state = 'objection_window';
      r.objectionWindowEndsAt = new Date(now().getTime() + OBJECTION_WINDOW_MS).toISOString();
      record(me, 'staff_recovery_approved', null, [
        { field: r.subject.handle, from: 'awaiting approval', to: '24-hour objection window' },
      ]);
      return ok(clone(r));
    },

    async completeRecovery(id) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const r = store.recoveries.find((x) => x.id === id);
      if (!r) return notFound;
      if (r.state !== 'objection_window' || r.objectionWindowEndsAt === null) {
        return err('invalid_transition', 'The case is not in its objection window.');
      }
      if (r.objectionWindowEndsAt > at()) {
        return err('invalid_transition', 'The 24-hour objection window has not ended yet.');
      }
      r.state = 'fresh_enrollment';
      const subject = store.staff.find((s) => s.id === r.subject.id);
      store.invitations.unshift({
        id: nextId(store, 'INV'),
        emailMasked: subject?.emailMasked ?? 'unknown',
        role: subject?.roles[0] ?? 'moderator',
        state: 'issued',
        invitedBy: me,
        approvedBy: r.approvedBy,
        requiresSecondApproval: false,
        createdAt: at(),
        expiresAt: new Date(now().getTime() + INVITATION_TTL_MS).toISOString(),
      });
      record(me, 'staff_recovery_completed', null, [
        { field: r.subject.handle, from: 'objection window', to: 're-enrollment invitation issued' },
      ]);
      return ok({ ...clone(r), enrollmentCode: 'RECOVER234' });
    },

    async listMembers() {
      await wait();
      if (!admin()) return forbidden();
      return ok(
        store.members.map((m) => ({
          ...m,
          openSubmissions: [...store.cases.values()].filter(
            (c) =>
              store.owners.get(c.id) === m.handle &&
              ['submitted', 'screening', 'queued', 'in_review', 'needs_info', 'needs_information'].includes(
                c.status,
              ),
          ).length,
        })),
      );
    },

    async suspendMember(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const m = store.members.find((x) => x.id === id);
      if (!m) return notFound;
      if (m.status === 'suspended') return err('invalid_transition', 'This member is already suspended.');
      if (!consume('user.suspend', id, [id, parsed.data.reason])) return stepUp;
      m.status = 'suspended';
      m.suspensionReason = parsed.data.reason;
      record(me, 'user_suspended', parsed.data.reason, [
        { field: m.handle, from: 'active', to: 'suspended' },
      ]);
      return ok(clone(store.members));
    },

    async restoreMember(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const m = store.members.find((x) => x.id === id);
      if (!m) return notFound;
      if (m.status !== 'suspended') return err('invalid_transition', 'This member is not suspended.');
      if (!consume('user.restore', id, [id, parsed.data.reason])) return stepUp;
      m.status = 'active';
      m.suspensionReason = null;
      record(me, 'user_restored', parsed.data.reason, [{ field: m.handle, from: 'suspended', to: 'active' }]);
      return ok(clone(store.members));
    },

    async listLabels() {
      await wait();
      return admin() ? ok(clone(store.labels)) : forbidden();
    },

    async addLabel(request) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = labelRequestSchema.safeParse(request);
      if (!parsed.success)
        return err('invalid_transition', parsed.error.issues[0]?.message ?? 'Check the label.');
      const l = parsed.data;
      const value = l.chain === 'ethereum' ? l.address.toLowerCase() : l.address;
      const address = store.addresses.find((a) => a.chain === l.chain && a.address === value);
      if (!address)
        return err('invalid_transition', 'Blacklist has no record of this address on the selected network.');
      const label = {
        id: nextId(store, 'LBL'),
        subject: { chain: address.chain, address: address.address, displayAddress: address.displayAddress },
        text: l.text,
        provenance: l.provenance,
        sourceName: l.provenance === 'external_source' ? (l.sourceName ?? null) : null,
        basisNote: l.basisNote,
        status: 'active' as const,
        createdBy: me,
        createdAt: at(),
        retiredAt: null,
      };
      store.labels.unshift(label);
      syncLabel(store, label);
      record(me, 'label_added', l.basisNote, [{ field: `label ${label.id}`, from: null, to: l.text }]);
      return ok(clone(store.labels));
    },

    async retireLabel(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const label = store.labels.find((l) => l.id === id);
      if (!label) return notFound;
      if (label.status !== 'active') return err('invalid_transition', 'This label is already retired.');
      label.status = 'retired';
      label.retiredAt = at();
      syncLabel(store, label);
      record(me, 'label_retired', parsed.data.reason, [
        { field: `label ${id}`, from: 'active', to: 'retired' },
      ]);
      return ok(clone(store.labels));
    },

    async listSuppressions() {
      await wait();
      if (!admin()) return forbidden();
      return ok(store.suppressions.map(({ removed: _r, ...s }) => clone(s)));
    },

    async suppressSignal(request) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = suppressionRequestSchema.safeParse(request);
      if (!parsed.success)
        return err('invalid_transition', parsed.error.issues[0]?.message ?? 'Check the suppression.');
      const r = parsed.data;
      const value = r.chain === 'ethereum' ? r.address.toLowerCase() : r.address;
      const address = store.addresses.find((a) => a.chain === r.chain && a.address === value);
      if (!address)
        return err('invalid_transition', 'Blacklist has no record of this address on the selected network.');
      if (!address.assessment.factors.some((f) => f.code === r.factorCode)) {
        return err('invalid_transition', 'This address has no active indicator with that code to suppress.');
      }
      if (!consume('signal.suppress', 'new', [parsed.data])) return stepUp;
      const removed = applySuppression(
        store,
        address.chain,
        address.address,
        r.factorCode,
        r.publicReason,
        at(),
      );
      store.suppressions.unshift({
        id: nextId(store, 'SUP'),
        subject: { chain: address.chain, address: address.address, displayAddress: address.displayAddress },
        factorCode: r.factorCode,
        publicReason: r.publicReason,
        internalRationale: r.internalRationale,
        createdBy: me,
        createdAt: at(),
        liftedAt: null,
        liftedBy: null,
        removed,
      });
      record(me, 'signal_suppressed', r.internalRationale, [
        { field: `${address.displayAddress} ${r.factorCode}`, from: 'active', to: 'suppressed' },
      ]);
      return ok(store.suppressions.map(({ removed: _r, ...s }) => clone(s)));
    },

    async liftSuppression(id, reason) {
      await wait();
      const me = admin();
      if (!me) return forbidden();
      const parsed = reasonRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const s = store.suppressions.find((x) => x.id === id);
      if (!s) return notFound;
      if (s.liftedAt !== null) return err('invalid_transition', 'This suppression was already lifted.');
      if (!consume('signal.suppression.lift', id, [id, parsed.data.reason])) return stepUp;
      if (s.removed) liftSuppression(store, s.subject.chain, s.subject.address, s.removed, at());
      s.liftedAt = at();
      s.liftedBy = me;
      record(me, 'suppression_lifted', parsed.data.reason, [
        { field: `${s.subject.displayAddress} ${s.factorCode}`, from: 'suppressed', to: 'active' },
      ]);
      return ok(store.suppressions.map(({ removed: _r, ...x }) => clone(x)));
    },
  };
}
