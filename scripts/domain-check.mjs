#!/usr/bin/env node
// Live checks on the waseemilyas.uk domain itself, which no build of the site can see.
// Read-only; exits 1 listing every failure. Run after each release and daily
// (.github/workflows/domain.yml).
//
//   caa     the apex publishes CAA records that let exactly the CAs in ALLOWED_CAS issue
//           certificates for it and its subdomains, and no CA issue a wildcard. Without
//           them any publicly trusted CA may issue. Cloudflare adds its own CAs to any
//           CAA set while the zone's Universal SSL is on, so that stays off: no record in
//           the zone is proxied, so nothing uses Cloudflare's certificate.
//   cert    the apex and www serve a certificate from a CA the CAA allows, with at least
//           MIN_DAYS left. If GitHub Pages moved to another CA, the CAA would block its next
//           renewal; this fails weeks before visitors would see an expired certificate.
//   dnssec  Cloudflare's and Google's validating resolvers both mark the apex answer as
//           authenticated (AD), so a forged DNS answer cannot redirect the site.
//   https   plain http:// on the apex and www answers with a permanent redirect to https://.
//
// The www name is a CNAME to GitHub, so GitHub's own CAA records govern it; its
// certificate is the apex's (one certificate covers both names).
//
// Usage: node scripts/domain-check.mjs [--domain waseemilyas.uk]

import { connect } from "node:tls";
import { parseArgs } from "node:util";

/** CAA issuer domain → the certificate issuer organisation it signs as. */
export const ALLOWED_CAS = { "letsencrypt.org": "Let's Encrypt" };
export const MIN_DAYS = 21;
const RESOLVERS = {
  cloudflare: "https://cloudflare-dns.com/dns-query",
  google: "https://dns.google/resolve",
};

/**
 * @typedef {{ flags: number, tag: string, value: string }} Caa
 * @typedef {{ resolver: string, ad: boolean, caa: string[], caaAd: boolean }} DnsFacts
 * @typedef {{ host: string, issuer: string, validTo: Date }} CertFacts
 * @typedef {{ url: string, status: number, location: string }} RedirectFacts
 * @typedef {{ domain: string, now: Date, dns: DnsFacts[], certs: CertFacts[], redirects: RedirectFacts[] }} Facts
 */

/** Parses one CAA answer as resolvers print it: `0 issue "letsencrypt.org"`. */
export function parseCaa(/** @type {string} */ data) {
  const m = /^(\d+)\s+([A-Za-z0-9]+)\s+"(.*)"$/.exec(data.trim());
  if (!m) throw new Error(`unreadable CAA record: ${data}`);
  return { flags: Number(m[1]), tag: m[2].toLowerCase(), value: m[3] };
}

/** The CA named by an issue/issuewild value ("" when it forbids issuance). */
const caOf = (/** @type {string} */ value) => value.split(";")[0].trim().toLowerCase();

/** Every rule broken by the observed facts, as plain sentences. */
export function evaluate(/** @type {Facts} */ facts) {
  const failures = [];
  const allowed = Object.keys(ALLOWED_CAS);
  for (const { resolver, ad, caa, caaAd } of facts.dns) {
    const at = `${facts.domain} (${resolver})`;
    if (!ad) failures.push(`dnssec: ${at} answer is not DNSSEC-authenticated`);
    if (!caa.length) {
      failures.push(`caa: ${at} publishes no CAA records, so any CA may issue certificates for it`);
      continue;
    }
    if (!caaAd) failures.push(`dnssec: ${at} CAA answer is not DNSSEC-authenticated`);
    /** @type {Caa[]} */
    let records;
    try {
      records = caa.map(parseCaa);
    } catch (error) {
      failures.push(`caa: ${at} ${/** @type {Error} */ (error).message}`);
      continue;
    }
    const issue = new Set(records.filter((r) => r.tag === "issue").map((r) => caOf(r.value)).filter(Boolean));
    const extra = [...issue].filter((ca) => !allowed.includes(ca));
    const missing = allowed.filter((ca) => !issue.has(ca));
    if (extra.length) failures.push(`caa: ${at} also lets ${extra.join(", ")} issue; allow only ${allowed.join(", ")}`);
    if (missing.length) failures.push(`caa: ${at} does not let ${missing.join(", ")} issue, so GitHub Pages cannot renew its certificate`);
    const wild = records.filter((r) => r.tag === "issuewild");
    if (!wild.length || wild.some((r) => caOf(r.value))) {
      failures.push(`caa: ${at} must forbid wildcard certificates with a single issuewild ";" record`);
    }
    const unknownCritical = records.filter((r) => r.flags & 128 && !["issue", "issuewild", "iodef"].includes(r.tag));
    if (unknownCritical.length) failures.push(`caa: ${at} has a critical ${unknownCritical[0].tag} record no CA may ignore`);
  }
  const issuers = Object.values(ALLOWED_CAS);
  for (const { host, issuer, validTo } of facts.certs) {
    if (!issuers.includes(issuer)) {
      failures.push(`cert: ${host} certificate is from ${issuer || "an unnamed issuer"}, which the CAA does not allow; its renewal will fail until ALLOWED_CAS and the CAA records name that CA`);
    }
    const days = Math.floor((validTo.getTime() - facts.now.getTime()) / 86_400_000);
    if (days < MIN_DAYS) failures.push(`cert: ${host} certificate expires in ${days} days (renewal is overdue; check CAA and GitHub Pages' certificate status)`);
  }
  for (const { url, status, location } of facts.redirects) {
    if (![301, 308].includes(status) || !location.startsWith("https://")) {
      failures.push(`https: ${url} answered ${status}${location ? ` → ${location}` : ""}, not a permanent redirect to https://`);
    }
  }
  return failures;
}

/** Retries a network read once, so one dropped packet does not fail a release. */
async function twice(/** @type {() => Promise<any>} */ read) {
  try {
    return await read();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return read();
  }
}

async function dns(/** @type {string} */ resolver, /** @type {string} */ name, /** @type {string} */ type) {
  const url = `${RESOLVERS[/** @type {keyof typeof RESOLVERS} */ (resolver)]}?name=${encodeURIComponent(name)}&type=${type}&do=1`;
  return twice(async () => {
    const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${resolver} answered ${res.status} for ${name} ${type}`);
    const body = await res.json();
    if (body.Status !== 0) throw new Error(`${resolver} answered DNS status ${body.Status} for ${name} ${type}`);
    return body;
  });
}

/** @returns {Promise<CertFacts>} */
function certificate(/** @type {string} */ host) {
  return twice(() => new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!socket.authorized) return reject(new Error(`${host}: certificate not trusted (${socket.authorizationError})`));
      resolve({ host, issuer: String(cert.issuer?.O ?? ""), validTo: new Date(cert.valid_to) });
    });
    socket.on("timeout", () => socket.destroy(new Error(`${host}: TLS timeout`)));
    socket.on("error", reject);
  }));
}

/** @returns {Promise<RedirectFacts>} */
function redirect(/** @type {string} */ url) {
  return twice(async () => {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return { url, status: res.status, location: res.headers.get("location") ?? "" };
  });
}

/** Reads the live facts for `domain`. */
export async function gather(/** @type {string} */ domain) {
  const dnsFacts = await Promise.all(Object.keys(RESOLVERS).map(async (resolver) => {
    const [a, caa] = await Promise.all([dns(resolver, domain, "A"), dns(resolver, domain, "CAA")]);
    /** @type {{ type: number, data: string }[]} */
    const answers = caa.Answer ?? [];
    return { resolver, ad: a.AD === true, caaAd: caa.AD === true, caa: answers.filter((r) => r.type === 257).map((r) => r.data) };
  }));
  const hosts = [domain, `www.${domain}`];
  return {
    domain,
    now: new Date(),
    dns: dnsFacts,
    certs: await Promise.all(hosts.map(certificate)),
    redirects: await Promise.all(hosts.map((host) => redirect(`http://${host}/`))),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { domain: { type: "string", default: "waseemilyas.uk" } } });
  const facts = await gather(String(values.domain));
  const failures = evaluate(facts);
  for (const { resolver, caa } of facts.dns) console.log(`[domain] ${resolver} CAA: ${caa.join(" | ") || "none"}`);
  for (const { host, issuer, validTo } of facts.certs) console.log(`[domain] ${host}: ${issuer}, valid to ${validTo.toISOString().slice(0, 10)}`);
  if (failures.length) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    process.exit(1);
  }
  console.log(`[domain] ${values.domain}: CAA, certificates, DNSSEC and HTTPS redirects all pass`);
}
