import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyEnquiry } from "../src/lib/leads";

describe("classifyEnquiry", () => {
  it("routes team services to the workshop funnel", () => {
    for (const s of ["workshop", "advisory", "pilot_sprint", "team_platform"] as const) {
      assert.equal(classifyEnquiry({ serviceInterest: s, email: "a@corp.com.au" }).isTeam, true);
    }
  });
  it("keeps solo training in the hourly funnel", () => {
    const r = classifyEnquiry({ serviceInterest: "training", email: "a@gmail.com" });
    assert.equal(r.isTeam, false);
    assert.equal(r.orgDomain, null);
  });
  it("routes training out of the hourly funnel when a team size is given", () => {
    assert.equal(
      classifyEnquiry({ serviceInterest: "training", email: "a@corp.com.au", teamSize: 5 }).isTeam,
      true,
    );
  });
  it("derives the registrable org domain from a corporate address", () => {
    const r = classifyEnquiry({ serviceInterest: "workshop", email: "a@mail.hr.acme.com.au" });
    assert.equal(r.orgDomain, "acme.com.au");
  });
  it("never treats a consumer mailbox as an organisation", () => {
    assert.equal(classifyEnquiry({ serviceInterest: "workshop", email: "a@outlook.com" }).orgDomain, null);
  });
  it("returns null org domain for malformed email", () => {
    assert.equal(classifyEnquiry({ serviceInterest: "other", email: "not-an-email" }).orgDomain, null);
  });
});
