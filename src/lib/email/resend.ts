const DEFAULT_FROM = 'Elbaraka Epices <mail@elbarakaepices.com>';

export class EmailDeliveryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string
  ));
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailDeliveryError('RESEND_API_KEY is not configured.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM, ...message }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new EmailDeliveryError('Resend rejected the email.', response.status);
}
