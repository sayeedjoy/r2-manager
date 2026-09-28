import type { OutgoingMail } from "./mailer";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** A plain, single-column layout that renders the same in Gmail, Outlook and text-only clients. */
function layout(paragraphs: string[], action?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;color:#71717a;font-size:13px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  const foot = footer ? `<p style="margin:24px 0 0;color:#71717a;font-size:13px">${escapeHtml(footer)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px">${body}${button}${foot}</div>
</body></html>`;
}

export function passwordResetEmail(to: string, name: string, url: string, expiresMinutes: number): OutgoingMail {
  const intro = `Hi ${name},`;
  const ask = "Someone asked to reset the password for your R2 Manager account. Use the button below to choose a new one.";
  const expiry = `The link works once and expires in ${expiresMinutes} minutes.`;
  const footer = "If you didn't ask for this, ignore this email. Your password stays the same.";
  return {
    to,
    subject: "Reset your R2 Manager password",
    text: `${intro}\n\n${ask}\n\n${url}\n\n${expiry}\n\n${footer}\n`,
    html: layout([intro, ask, expiry], { label: "Reset password", url }, footer),
  };
}

export function inviteEmail(to: string, name: string, invitedBy: string, url: string, expiresHours: number): OutgoingMail {
  const intro = `Hi ${name},`;
  const ask = `${invitedBy} added you to R2 Manager. Choose a password to finish setting up your account.`;
  const expiry = `The link works once and expires in ${expiresHours} hours.`;
  return {
    to,
    subject: "You've been invited to R2 Manager",
    text: `${intro}\n\n${ask}\n\n${url}\n\n${expiry}\n`,
    html: layout([intro, ask, expiry], { label: "Set your password", url }),
  };
}

export function passwordChangedEmail(to: string, name: string): OutgoingMail {
  const intro = `Hi ${name},`;
  const note = "The password for your R2 Manager account was just changed, and every other signed-in session was signed out.";
  const footer = "If this wasn't you, reset your password straight away and tell your administrator.";
  return {
    to,
    subject: "Your R2 Manager password was changed",
    text: `${intro}\n\n${note}\n\n${footer}\n`,
    html: layout([intro, note], undefined, footer),
  };
}

export function testEmail(to: string, appUrl: string): OutgoingMail {
  const note = "This is a test message from R2 Manager. If you can read it, email delivery works.";
  return {
    to,
    subject: "R2 Manager test email",
    text: `${note}\n\n${appUrl}\n`,
    html: layout([note, appUrl]),
  };
}
