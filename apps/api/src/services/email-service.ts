/**
 * Email service — graceful degradation when SMTP is not configured.
 *
 * Reads SMTP config from env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *
 * If SMTP is not configured, logs a warning and returns (no-op).
 */
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;
let smtpConfigured = false;
let smtpChecked = false;

function getTransporter(): Transporter | null {
  if (smtpChecked) {
    return transporter;
  }
  smtpChecked = true;

  const host = process.env['SMTP_HOST'];
  const port = process.env['SMTP_PORT'];
  const user = process.env['SMTP_USER'];
  const password = process.env['SMTP_PASSWORD'];

  if (!host || !port) {
    smtpConfigured = false;
    return null;
  }

  smtpConfigured = true;
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: user && password ? { user, pass: password } : undefined,
  });

  return transporter;
}

function getFromAddress(): string {
  return process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? 'no-reply@avesia.local';
}

/**
 * Send a generic email. If SMTP is not configured, logs a warning and returns.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<void> {
  const transport = getTransporter();

  if (!transport || !smtpConfigured) {
    // eslint-disable-next-line no-console
    console.warn('[email-service] SMTP not configured — skipping email send to:', to);
    return;
  }

  try {
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]*>/g, ''),
    });
  } catch (err) {
    // Graceful degradation — log but don't throw.
    // eslint-disable-next-line no-console
    console.error('[email-service] Failed to send email:', err);
  }
}

/**
 * Send a transcription notification email summarizing how many sessions
 * have pending or completed transcriptions.
 */
export async function sendTranscriptionNotification(
  email: string,
  sessionCount: number,
): Promise<void> {
  const subject = `[Avesia] ${sessionCount} sessão(ões) com transcrição disponível`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Avesia — Notificação de Transcrição</h2>
      <p>Olá,</p>
      <p>Você tem <strong>${sessionCount}</strong> sessão(ões) com transcrições disponíveis ou em processamento no Avesia.</p>
      <p>Acesse a plataforma para revisar as transcrições e análises clínicas.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #6b7280; font-size: 12px;">
        Este é um email automático enviado pelo Avesia. Não responda a esta mensagem.
      </p>
    </div>
  `;
  const text = `Avesia — Notificação de Transcrição\n\nOlá,\n\nVocê tem ${sessionCount} sessão(ões) com transcrições disponíveis ou em processamento no Avesia.\n\nAcesse a plataforma para revisar as transcrições e análises clínicas.\n\n-- \nEste é um email automático enviado pelo Avesia.`;

  await sendEmail(email, subject, html, text);
}
