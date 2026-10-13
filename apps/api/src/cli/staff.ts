import { parseArgs } from 'node:util';
import { z } from 'zod';
import { readApiConfig } from '@blacklist/config';
import {
  createIdentity,
  bootstrapStaff,
  operatorApproveInvitation,
  operatorApproveRole,
  operatorApproveRecovery,
  breakGlass,
  objectRecovery,
} from '@blacklist/domain';
const args = parseArgs({
  options: {
    command: { type: 'string' },
    email: { type: 'string' },
    id: { type: 'string' },
    operator: { type: 'string' },
    incident: { type: 'string' },
  },
  strict: true,
});
const operator = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[\p{L}\p{N} ._-]+$/u)
  .parse(args.values.operator);
const command = z
  .enum([
    'bootstrap',
    'approve-invitation',
    'approve-role',
    'approve-recovery',
    'object-recovery',
    'break-glass',
  ])
  .parse(args.values.command);
const config = readApiConfig();
const ctx = createIdentity(config.DATABASE_URL, {
  secret: config.BETTER_AUTH_SECRET,
  origin: config.APP_ORIGIN,
  rpId: config.WEBAUTHN_RP_ID,
  rpName: config.WEBAUTHN_RP_NAME,
  breakGlassEnabled: config.BREAK_GLASS_ENABLED === 'true',
});
const actor = { kind: 'cli' as const, operator, actorRef: `cli:${operator}` };
try {
  await ctx.runtime.start();
  if (command === 'bootstrap' || command === 'break-glass') {
    const email = z
      .email()
      .transform((v) => v.trim().toLowerCase())
      .parse(args.values.email);
    const result =
      command === 'bootstrap'
        ? await bootstrapStaff(ctx, actor, email)
        : await breakGlass(
            ctx,
            actor,
            email,
            z
              .string()
              .regex(/^INC-[A-Za-z0-9_-]{1,60}$/)
              .parse(args.values.incident),
          );
    // Explicit CLI contract: only the enrollment code is printed, never the token.
    process.stdout.write(
      `Invitation ${result.invitationId}\nEnrollment code (deliver through verified separate channel): ${result.enrollmentCode}\n`,
    );
    if (command === 'break-glass')
      process.stdout.write('Unset BREAK_GLASS_ENABLED and record post-incident review.\n');
  } else {
    const id = z.uuid().parse(args.values.id);
    if (command === 'approve-invitation') await operatorApproveInvitation(ctx, actor, id);
    else if (command === 'approve-role') await operatorApproveRole(ctx, actor, id);
    else if (command === 'approve-recovery') await operatorApproveRecovery(ctx, actor, id);
    else await objectRecovery(ctx, actor, id);
    process.stdout.write('Audited operator action complete.\n');
  }
} catch {
  console.error('Operator action rejected or unavailable; no secret details exported.');
  process.exitCode = 1;
} finally {
  await ctx.runtime.close();
}
