// Test helpers for email.ts — allow injecting env and transport for unit tests.
// Only imported by test files; never imported by production code.

import nodemailer from 'nodemailer';
import type { EmailPayload } from './email.js';

interface EnvOverride {
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  emailEnabled: boolean;
}

interface MockTransport {
  sendMail: (opts: object) => Promise<unknown>;
}

/**
 * Versión testeable de sendEmail con env inyectado.
 * Usa un transporter real de nodemailer (que fallará si el env está vacío).
 */
export async function _testSendEmail(envOverride: EnvOverride, payload: EmailPayload): Promise<boolean> {
  if (!envOverride.emailEnabled || !envOverride.smtpHost) {
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: envOverride.smtpHost,
      port: envOverride.smtpPort ?? 587,
      secure: envOverride.smtpSecure ?? false,
      auth: { user: envOverride.smtpUser ?? '', pass: envOverride.smtpPass ?? '' },
    });
    await transporter.sendMail({
      from: envOverride.smtpFrom ?? '',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Versión testeable de sendEmail con transport mock inyectado.
 */
export async function _testSendEmailWithTransport(transport: MockTransport, payload: EmailPayload): Promise<boolean> {
  try {
    await transport.sendMail({
      from: '',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    return true;
  } catch {
    return false;
  }
}
