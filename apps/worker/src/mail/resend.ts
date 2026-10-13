import { z } from 'zod';
import type { WorkerConfig } from '@blacklist/config';
import type { SecurityMailer } from '@blacklist/domain';

const receipt = z.object({ id: z.uuid() }).strict();
const endpoint = 'https://api.resend.com/emails';

async function boundedReceipt(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('provider_receipt_missing');
  let bytes = 0,
    text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        throw new Error('provider_receipt_too_large');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

/** Resend's synchronous POST returns an accepted email UUID; no SDK callback is trusted. */
export function resendMailer(config: WorkerConfig): SecurityMailer {
  if (config.EMAIL_PROVIDER !== 'resend' || !config.RESEND_API_KEY)
    throw new Error('resend_mailer_configuration_invalid');
  const key = config.RESEND_API_KEY;
  return {
    async send(message) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: config.EMAIL_FROM,
            to: [message.recipient],
            subject: message.subject,
            text: message.text,
          }),
        });
        if (response.status !== 200 && response.status !== 201) {
          await response.body?.cancel();
          return {
            outcome:
              response.status === 408 || response.status === 429 || response.status >= 500
                ? 'retryable_failure'
                : 'permanent_failure',
            code: 'rejected',
            providerStatus: response.status,
          };
        }
        const accepted = receipt.safeParse(await boundedReceipt(response));
        if (!accepted.success) return { outcome: 'retryable_failure', code: 'rejected' };
        return { outcome: 'accepted_for_delivery', providerMessageId: accepted.data.id };
      } catch {
        // Never expose provider bodies, bearer keys, recipients, subjects or token-bearing text.
        return { outcome: 'retryable_failure', code: 'transport' };
      }
    },
  };
}
