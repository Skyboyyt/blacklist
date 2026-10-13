export type StaffRole = 'moderator' | 'admin' | 'appeal_reviewer';
export interface UserActor {
  readonly kind: 'user';
  readonly userId: string;
  readonly sessionId: string;
  readonly actorRef: string;
  readonly accountKind: 'member' | 'staff';
  readonly roles: readonly StaffRole[];
  readonly staffAssured: boolean;
  readonly securityVersion: number;
  readonly staffPermissionsActive: boolean;
}
export interface OperatorActor {
  readonly kind: 'cli';
  readonly actorRef: string;
  readonly operator: string;
}
export interface SystemActor {
  readonly kind: 'system';
  readonly actorRef: string;
  readonly jobKind: string;
}
export type Actor = UserActor | OperatorActor | SystemActor;
