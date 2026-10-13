export type DeliveryOutcome =
  | { outcome: 'accepted_for_delivery'; providerMessageId: string }
  | {
      outcome: 'retryable_failure' | 'permanent_failure';
      code: 'timeout' | 'transport' | 'rejected';
      providerStatus?: number;
    };
export interface SecurityMailer {
  send(message: { recipient: string; subject: string; text: string }): Promise<DeliveryOutcome>;
}
export class RetryableDeliveryError extends Error {
  constructor() {
    super('security_delivery_retryable');
  }
}
export async function sendSecurityMail(
  mailer: SecurityMailer,
  message: Parameters<SecurityMailer['send']>[0],
  timeoutMs = 20_000,
): Promise<DeliveryOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      mailer.send(message).catch(() => ({ outcome: 'retryable_failure', code: 'transport' }) as const),
      new Promise<DeliveryOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: 'retryable_failure', code: 'timeout' }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
