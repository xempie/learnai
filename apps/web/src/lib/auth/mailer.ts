/**
 * Verification email delivery, isolated behind a single function so T19
 * (SES integration) can swap the implementation without touching
 * `provider.ts` or any route. Dev/V1-pre-T19 implementation: log the link
 * to the server console — there is no SES wiring yet.
 */
export async function sendVerificationEmail(email: string, verifyUrl: string): Promise<void> {
  console.log(`[dev email] Verification link for ${email}: ${verifyUrl}`);
}
