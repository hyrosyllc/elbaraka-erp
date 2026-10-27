import { escapeHtml, sendEmail } from './resend';

type CustomerEmailKind = 'invite' | 'existing' | 'recovery';

const content = {
  invite: {
    subject: 'Set up your Elbaraka store account | إعداد حساب متجرك في البركة',
    en: { title: 'Set up your store account', body: 'Elbaraka Epices invited you to order for your store online. Verify your email and choose a password to get started.', action: 'Set up account' },
    ar: { title: 'إعداد حساب متجرك', body: 'دعتك البركة للتوابل لتقديم طلبات متجرك عبر الإنترنت. أكد بريدك الإلكتروني واختر كلمة مرور للبدء.', action: 'إعداد الحساب' },
  },
  existing: {
    subject: 'Link your store to your Elbaraka account | ربط متجرك بحسابك في البركة',
    en: { title: 'Link your store', body: 'Elbaraka Epices invited your existing account to order for another store. Verify your email to link it.', action: 'Link store' },
    ar: { title: 'ربط المتجر بحسابك', body: 'دعتك البركة للتوابل لربط حسابك الحالي بمتجر آخر. أكد بريدك الإلكتروني لإكمال الربط.', action: 'ربط المتجر' },
  },
  recovery: {
    subject: 'Reset your Elbaraka password | إعادة تعيين كلمة مرور البركة',
    en: { title: 'Reset your password', body: 'An Elbaraka manager sent you a link to choose a new password. If you did not expect this, you can ignore this email.', action: 'Choose new password' },
    ar: { title: 'إعادة تعيين كلمة المرور', body: 'أرسل لك مدير البركة رابطا لاختيار كلمة مرور جديدة. إذا لم تتوقع ذلك فتجاهل هذه الرسالة.', action: 'اختيار كلمة مرور جديدة' },
  },
} as const;

export async function sendCustomerAuthEmail(kind: CustomerEmailKind, to: string, link: string) {
  const copy = content[kind];
  const url = escapeHtml(link);
  const section = (lang: 'en' | 'ar') => {
    const text = copy[lang];
    return `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="margin:0 0 28px">
<h2 style="margin:0 0 8px;font-size:20px;color:#1f2937">${text.title}</h2>
<p style="margin:0 0 16px;line-height:1.6;color:#4b5563">${text.body}</p>
<a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#8a3b12;color:#fff;text-decoration:none;font-weight:600">${text.action}</a>
</div>`;
  };

  await sendEmail({
    to,
    subject: copy.subject,
    html: `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">${section('en')}<hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 28px">${section('ar')}<p style="font-size:12px;color:#6b7280">Elbaraka Epices · البركة للتوابل</p></div>`,
    text: `${copy.en.title}\n${copy.en.body}\n${link}\n\n${copy.ar.title}\n${copy.ar.body}\n${link}`,
  });
}
