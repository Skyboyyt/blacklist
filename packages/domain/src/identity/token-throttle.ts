import type { IdentityContext } from './types.ts';
import { digest } from '../shared/crypto.ts';
export function admitTokenAction(ctx: IdentityContext, purpose: string, token: string, prefix: string) {
  return ctx.runtime.transaction((tx) =>
    ctx.throttle.requestLimit(tx, purpose, digest(token), prefix, 20, 900),
  );
}
