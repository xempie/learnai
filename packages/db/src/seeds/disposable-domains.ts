// §4.1 step 5 needs a disposable-domain rejection list. Not enumerated in
// the spec itself; seeded here with a dozen well-known disposable/temporary
// mail providers so signup rejection (§4.1 step 5) has real data to work
// against. Vala can extend this table without a deploy, same as
// free_mail_domains.
export const DISPOSABLE_DOMAINS: readonly string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "mintemail.com",
  "dispostable.com",
];
