import nodemailer from 'nodemailer';
import type { WorkerConfig } from '@blacklist/config';
import type { SecurityMailer } from '@blacklist/domain';
export function smtpMailer(config: WorkerConfig): SecurityMailer {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
    requireTLS: config.NODE_ENV === 'production',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      try {
        const result = await transport.sendMail({
          from: config.EMAIL_FROM,
          to: message.recipient,
          subject: message.subject,
          text: message.text,
        });
        // Resolves after final DATA response, rather than after message construction.
        if (
          !result.accepted.some(
            (recipient) => String(recipient).toLowerCase() === message.recipient.toLowerCase(),
          ) ||
          !/^250\b/u.test(result.response)
        )
          return { outcome: 'permanent_failure', code: 'rejected' };
        return { outcome: 'accepted_for_delivery', providerMessageId: result.messageId };
      } catch (error) {
        const status =
          typeof error === 'object' &&
          error &&
          'responseCode' in error &&
          typeof error.responseCode === 'number'
            ? error.responseCode
            : undefined;
        return {
          outcome: status && status >= 500 ? 'permanent_failure' : 'retryable_failure',
          code: status ? 'rejected' : 'transport',
          providerStatus: status,
        };
      }
    },
  };
}
