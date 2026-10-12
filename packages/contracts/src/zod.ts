/**
 * The single Zod entry point for every contract module.
 *
 * The CSP forbids eval (no 'unsafe-eval', ARCHITECTURE §26.1). Zod 4 otherwise probes
 * `Function('')` when the first object schema is built, to enable its JIT; the browser
 * blocks that and reports a CSP violation. Jitless parsing is the supported, eval-free
 * mode. Every contract module imports `z` from here, so this configuration always runs
 * before any schema is created.
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
