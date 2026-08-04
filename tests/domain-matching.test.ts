/**
 * Pure-function tests for email-domain parsing.
 *
 *   pnpm test
 *
 * The database-touching half of domain matching (provisional org creation,
 * founding-member limits) is covered by integration tests that need a live
 * Postgres; these cover the parsing rules that are easiest to get subtly wrong.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  domainOf,
  isFreeEmailDomain,
  inferOrgType,
  normaliseEmail,
  organisationNameFromDomain,
  registrableDomain,
} from "../src/lib/domain-parse";

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(normaliseEmail("  Vala@Adelaide.EDU.AU "), "vala@adelaide.edu.au");
  });
});

describe("domainOf", () => {
  it("extracts the domain", () => {
    assert.equal(domainOf("v.reyhani@adelaide.edu.au"), "adelaide.edu.au");
  });

  it("uses the last @ so plus-addressing and quoted locals are safe", () => {
    assert.equal(domainOf("odd@name@company.com.au"), "company.com.au");
  });

  it("returns empty string for a malformed address", () => {
    assert.equal(domainOf("not-an-email"), "");
  });
});

describe("isFreeEmailDomain", () => {
  it("rejects consumer providers", () => {
    for (const d of ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "proton.me"]) {
      assert.equal(isFreeEmailDomain(d), true, `${d} should be a free domain`);
    }
  });

  it("accepts organisation domains", () => {
    for (const d of ["adelaide.edu.au", "meridian.com.au", "company.co.uk"]) {
      assert.equal(isFreeEmailDomain(d), false, `${d} should not be a free domain`);
    }
  });

  it("is case-insensitive", () => {
    assert.equal(isFreeEmailDomain("GMAIL.COM"), true);
  });
});

describe("registrableDomain", () => {
  it("keeps a plain two-label domain", () => {
    assert.equal(registrableDomain("example.com"), "example.com");
  });

  it("strips an ordinary subdomain", () => {
    assert.equal(registrableDomain("mail.example.com"), "example.com");
  });

  it("does NOT over-strip multi-part public suffixes", () => {
    // The bug this guards against: naive stripping yields "edu.au".
    assert.equal(registrableDomain("adelaide.edu.au"), "adelaide.edu.au");
    assert.equal(registrableDomain("company.co.uk"), "company.co.uk");
    assert.equal(registrableDomain("business.com.au"), "business.com.au");
  });

  it("rolls a subdomain up to the registrable parent", () => {
    assert.equal(registrableDomain("student.adelaide.edu.au"), "adelaide.edu.au");
    assert.equal(registrableDomain("mail.company.co.uk"), "company.co.uk");
    assert.equal(registrableDomain("staff.mq.edu.au"), "mq.edu.au");
  });

  it("handles deep subdomains", () => {
    assert.equal(registrableDomain("a.b.c.adelaide.edu.au"), "adelaide.edu.au");
  });
});

describe("organisationNameFromDomain", () => {
  it("title-cases the registrable label", () => {
    assert.equal(organisationNameFromDomain("adelaide.edu.au"), "Adelaide");
    assert.equal(organisationNameFromDomain("student.adelaide.edu.au"), "Adelaide");
  });

  it("expands hyphenated names", () => {
    assert.equal(organisationNameFromDomain("meridian-group.com.au"), "Meridian Group");
  });
});

describe("inferOrgType", () => {
  it("detects education domains", () => {
    assert.equal(inferOrgType("adelaide.edu.au"), "university");
    assert.equal(inferOrgType("ox.ac.uk"), "university");
    assert.equal(inferOrgType("stanford.edu"), "university");
  });

  it("defaults to company", () => {
    assert.equal(inferOrgType("meridian.com.au"), "company");
    assert.equal(inferOrgType("acme.com"), "company");
  });

  it("does not treat a company name containing 'edu' as a university", () => {
    assert.equal(inferOrgType("education-partners.com"), "company");
  });
});
