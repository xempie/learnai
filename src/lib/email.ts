import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { BRAND } from "@/lib/brand";
import { config } from "@/lib/config";

/**
 * Transactional email over the data-corner.com.au mail server.
 *
 * SES is the eventual target (TECHNICAL_SPEC §4.2) but production access takes
 * days to approve, so the pilot sends through the existing mailbox - the same
 * approach the RoniDoc API uses. Swapping to SES later means replacing `send()`
 * and nothing else.
 *
 * With no SMTP password configured the message is written to the server log
 * instead, so local development works without credentials.
 *
 * Marketing sends are deliberately NOT implemented here: the 17,000-contact
 * list needs its consent basis confirmed first (§9.3), and mixing marketing
 * into the transactional stream would pollute bounce/complaint metrics.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    // Shared hosting still presents older certificates.
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

interface Message {
  to: string;
  subject: string;
  /** Plain text is always provided - some clients and screen readers prefer it. */
  text: string;
  html: string;
}

async function send(message: Message): Promise<void> {
  if (!isEmailConfigured()) {
    console.info(
      `\n[email:not-configured] would send to ${message.to}\n  subject: ${message.subject}\n  ${message.text.replace(/\n/g, "\n  ")}\n`,
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.from}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (err) {
    // A failed send must not fail the request that triggered it - the user can
    // always ask for a new code. Log the address only, never the code itself.
    console.error("[email] send failed", { to: message.to, subject: message.subject, err });
  }
}

/* ---------------- templates ---------------- */

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#efefef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#202020">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e8e8e8;border-radius:8px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:600">${BRAND.name}</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3">${heading}</h1>
      ${bodyHtml}
      <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e8e8e8;font-size:12px;color:#828282">
        If you did not request this, you can ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function codeBlock(code: string): string {
  return `<p style="margin:0 0 8px;font-size:15px;color:#4d4d4d">Enter this code to continue:</p>
    <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,monospace">${code}</p>
    <p style="margin:0;font-size:13px;color:#828282">The code expires in 15 minutes.</p>`;
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await send({
    to,
    subject: `${code} is your ${BRAND.name} verification code`,
    text: `Welcome to ${BRAND.name}.\n\nYour verification code is ${code}\nIt expires in 15 minutes.\n\nIf you did not sign up, you can ignore this email.`,
    html: layout("Verify your email address", codeBlock(code)),
  });
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  await send({
    to,
    subject: `${code} is your ${BRAND.name} password reset code`,
    text: `Someone asked to reset the password for this ${BRAND.name} account.\n\nYour reset code is ${code}\nIt expires in 15 minutes.\n\nIf this was not you, you can ignore this email - the password has not changed.`,
    html: layout(
      "Reset your password",
      `${codeBlock(code)}<p style="margin:16px 0 0;font-size:13px;color:#828282">If this was not you, the password has not changed.</p>`,
    ),
  });
}

export async function sendWelcomeEmail(to: string, nickname: string): Promise<void> {
  await send({
    to,
    subject: `Welcome to ${BRAND.name}`,
    text: `Hi ${nickname},\n\nYour ${BRAND.name} account is ready. Pick three topics and your feed builds itself.\n\n${config.appUrl}/feed`,
    html: layout(
      `Welcome, ${nickname}`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4d4d4d">Your account is ready. Pick three topics and your feed builds itself.</p>
       <a href="${config.appUrl}/feed" style="display:inline-block;background:#202020;color:#ffffff;text-decoration:none;padding:12px 24px;font-weight:600;font-size:15px">Start learning</a>`,
    ),
  });
}

/** Escapes the minimal set of characters needed to safely interpolate user text into HTML. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface LeadNotification {
  name: string;
  email: string;
  orgName: string | null;
  service: string;
  teamSize: number | null;
  message: string | null;
  isTeam: boolean;
}

/** New-enquiry alert to the founders. */
export async function sendLeadNotificationEmail(lead: LeadNotification): Promise<void> {
  const kind = lead.isTeam ? "TEAM enquiry" : "enquiry";
  const lines = [
    `Service: ${lead.service}`,
    `From: ${lead.name} <${lead.email}>`,
    lead.orgName ? `Organisation: ${lead.orgName}` : null,
    lead.teamSize ? `Team size: ${lead.teamSize}` : null,
    lead.message ? `\n${lead.message}` : null,
    `\nManage: ${config.appUrl}/admin/leads`,
  ].filter((v): v is string => Boolean(v));

  const htmlLines = [
    `Service: ${esc(lead.service)}`,
    `From: ${esc(lead.name)} &lt;${esc(lead.email)}&gt;`,
    lead.orgName ? `Organisation: ${esc(lead.orgName)}` : null,
    lead.teamSize ? `Team size: ${lead.teamSize}` : null,
    lead.message ? `\n${esc(lead.message)}` : null,
    `\nManage: ${config.appUrl}/admin/leads`,
  ].filter((v): v is string => Boolean(v));

  await send({
    to: config.leads.notifyEmail,
    subject: `New ${kind}: ${lead.service} — ${lead.name}`,
    text: lines.join("\n"),
    html: layout(
      `New ${kind}`,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d4d4d">${htmlLines
        .join("<br>")
        .replace(/\n/g, "<br>")}</p>`,
    ),
  });
}
