#!/usr/bin/env node
// Live checks on the waseemilyas.uk domain itself, which no build of the site can see.
// Changes nothing; exits 1 listing every failure. Run after each release and daily
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
//   https-rr  the apex publishes a DNSSEC-signed HTTPS record (RFC 9460) in service mode for
//           the apex itself, advertising only protocols GitHub Pages serves. GitHub Pages sends
//           no Strict-Transport-Security header, so without it a visit to http://waseemilyas.uk
//           goes out in plaintext and someone on the network can answer it instead of GitHub.
//           Browsers that read the record (Chromium, and Firefox with DNS over HTTPS, 21 Nov
//           2026) switch to https:// before sending anything and must not fall back. Address
//           hints are refused: they would go stale when GitHub changes its addresses.
//   ingest  the error-reporting DSN on the live home page belongs to a Sentry project that
//           accepts error events sent from the site's own origin and refuses them from any
//           other website. The DSN is public in every page, and the Sentry organisation's
//           quota is shared with other projects, so a project that allows every origin lets
//           any site flood it. The probe is a real error event, since that is what costs
//           quota, sent from the site first and then from another origin. It carries an ordinary
//           browser's user agent. A web crawler's user agent is not a fair probe: Sentry's
//           web-crawler filter answers 200 to it before the origin rule, on about 1 in 3 requests
//           from another website (21 Nov 2026), so a run of those 200s looks like the origin rule
//           is off. Once the relay has loaded the project, an ordinary browser gets 403 every
//           time the origin is not allowed. A cold relay answers 200 first, with an event id that
//           is never stored (Sentry counts it as an intentional CORS drop). A burst sent together
//           can all land in that window, and so can a quick sequence sent one at a time (CI run
//           44954078081 got 200 on all 8). The check sends them one at a time, stops at the first
//           403, and, if a whole sequence is accepted, waits once for the relay to load and tries
//           again. The site's own copy is stored as
//           one issue named "domain-check origin probe"; that is the probe, not a visitor's error.
//           An empty client report is not a fair probe either: the same day Sentry answered 200
//           to 5 of 154 from another origin while refusing 114 of 114 events from it. A visit that
//           sends no Origin (a script, not a browser) is still accepted; Sentry's organisation-wide
//           spike protection is the backstop for that.
//   security-txt  /.well-known/security.txt follows RFC 9116 and does not expire within
//           MIN_DAYS. Each release renews it (scripts/security-txt.mjs).
//
// The www name is a CNAME to GitHub, so GitHub's own CAA records govern it; its
// certificate is the apex's (one certificate covers both names).
//
// Usage: node scripts/domain-check.mjs [--domain waseemilyas.uk]

import { randomUUID } from "node:crypto";
import { connect } from "node:tls";
import { parseArgs } from "node:util";

import { PATH as SECURITY_TXT, securityTxtProblems } from "./security-txt.mjs";

/** CAA issuer domain → the certificate issuer organisation it signs as. */
export const ALLOWED_CAS = { "letsencrypt.org": "Let's Encrypt" };
export const MIN_DAYS = 21;
/** An origin that no page can be served from (RFC 6761), for the refused-report probe. */
export const FOREIGN_ORIGIN = "https://origin-probe.invalid";
/** An ordinary browser. A crawler user agent is filtered before the origin rule and answers 200. */
export const PROBE_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/** ALPN protocols GitHub Pages answers on 443 (no HTTP/3: it sends no Alt-Svc). */
export const SERVED_ALPN = ["h2", "http/1.1"];
const RESOLVERS = {
  cloudflare: "https://cloudflare-dns.com/dns-query",
  google: "https://dns.google/resolve",
};

/**
 * @typedef {{ flags: number, tag: string, value: string }} Caa
 * @typedef {{ resolver: string, ad: boolean, caa: string[], caaAd: boolean, https: string[], httpsAd: boolean }} DnsFacts
 * @typedef {{ priority: number, target: string, params: Map<string, string> }} HttpsRecord
 * @typedef {{ host: string, issuer: string, validTo: Date }} CertFacts
 * @typedef {{ url: string, status: number, location: string }} RedirectFacts
 * @typedef {{ page: string, dsn: boolean, own?: number, foreign?: number, refused?: number, sent?: number }} IngestFacts
 * @typedef {{ url: string, status: number, text: string }} SecurityTxtFacts
 * @typedef {{ domain: string, now: Date, dns: DnsFacts[], certs: CertFacts[], redirects: RedirectFacts[], ingest: IngestFacts, securityTxt: SecurityTxtFacts }} Facts
 */

/** Parses one CAA answer as resolvers print it: `0 issue "letsencrypt.org"`. */
export function parseCaa(/** @type {string} */ data) {
  const m = /^(\d+)\s+([A-Za-z0-9]+)\s+"(.*)"$/.exec(data.trim());
  if (!m) throw new Error(`unreadable CAA record: ${data}`);
  return { flags: Number(m[1]), tag: m[2].toLowerCase(), value: m[3] };
}

/** Parses one HTTPS record as resolvers print it: `1 . alpn=h2` or `1 . alpn="h2,http/1.1"`. */
export function parseHttps(/** @type {string} */ data) {
  const m = /^(\d+)\s+(\S+)((?:\s+[a-z0-9-]+(?:=(?:"[^"]*"|\S*))?)*)\s*$/.exec(data.trim());
  if (!m) throw new Error(`unreadable HTTPS record: ${data}`);
  /** @type {Map<string, string>} */
  const params = new Map();
  for (const [, key, value = ""] of m[3].matchAll(/([a-z0-9-]+)(?:=("[^"]*"|\S*))?/g)) params.set(key, value.replace(/^"|"$/g, ""));
  return { priority: Number(m[1]), target: m[2], params };
}

/** Every reason the apex's HTTPS records fail to send browsers straight to https://. */
function httpsRecordProblems(/** @type {string} */ domain, /** @type {string[]} */ data) {
  if (!data.length) return ["publishes no HTTPS record, so a visit to http:// goes out in plaintext before GitHub redirects it"];
  /** @type {HttpsRecord[]} */
  let records;
  try {
    records = data.map(parseHttps);
  } catch (error) {
    return [/** @type {Error} */ (error).message];
  }
  const problems = [];
  if (records.some((r) => r.priority === 0)) problems.push("has an alias-mode HTTPS record; publish a service-mode one (priority 1) for the apex itself");
  const self = [".", domain, `${domain}.`];
  for (const r of records.filter((x) => x.priority > 0)) {
    const at = `"${r.priority} ${r.target}"`;
    if (!self.includes(r.target)) problems.push(`HTTPS record ${at} sends browsers to ${r.target}; use "." so they connect to the apex as now`);
    const extra = [...r.params.keys()].filter((k) => k !== "alpn");
    if (extra.length) problems.push(`HTTPS record ${at} carries ${extra.join(", ")}; keep only alpn, since hints and ECH keys go stale when GitHub changes its servers`);
    const alpn = (r.params.get("alpn") ?? "").split(",").filter(Boolean);
    const unserved = alpn.filter((p) => !SERVED_ALPN.includes(p));
    if (unserved.length) problems.push(`HTTPS record ${at} advertises ${unserved.join(", ")}, which GitHub Pages does not serve`);
  }
  return problems;
}

/** The CA named by an issue/issuewild value ("" when it forbids issuance). */
const caOf = (/** @type {string} */ value) => value.split(";")[0].trim().toLowerCase();

/** Every rule broken by the observed facts, as plain sentences. */
export function evaluate(/** @type {Facts} */ facts) {
  const failures = [];
  const allowed = Object.keys(ALLOWED_CAS);
  for (const { resolver, ad, caa, caaAd, https, httpsAd } of facts.dns) {
    const at = `${facts.domain} (${resolver})`;
    if (!ad) failures.push(`dnssec: ${at} answer is not DNSSEC-authenticated`);
    for (const problem of httpsRecordProblems(facts.domain, https)) failures.push(`https-rr: ${at} ${problem}`);
    if (https.length && !httpsAd) failures.push(`dnssec: ${at} HTTPS record answer is not DNSSEC-authenticated`);
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
  const { page, dsn, own, foreign } = facts.ingest;
  if (!dsn) {
    failures.push(`ingest: ${page} carries no Sentry DSN, so browser errors on the live site are not reported`);
  } else {
    if (own !== 200) failures.push(`ingest: Sentry answered ${own} to a report from https://${facts.domain}, so the site's own error reports are refused`);
    // A cold relay answers 200 and an event id before the project's origin rule has loaded, then
    // drops the event (Sentry counts it as an intentional CORS drop; the id is never stored). A
    // warm relay answers 403, and keeps answering 403. One 403 is the rule; a project that allows
    // every origin answers 200 to all of them.
    const refused = facts.ingest.refused ?? (foreign === 403 ? 1 : 0);
    const sent = facts.ingest.sent ?? 1;
    if (refused < 1) {
      failures.push(`ingest: Sentry refused ${refused} of ${sent} reports from another website; set the project's Allowed Domains to ${facts.domain} only`);
    }
  }
  const { url, status, text } = facts.securityTxt;
  if (status !== 200) {
    failures.push(`security-txt: ${url} answered ${status}, so there is no published way to report a security problem`);
  } else {
    for (const problem of securityTxtProblems(text, { url, now: facts.now, minDays: MIN_DAYS })) failures.push(`security-txt: ${url} ${problem}`);
  }
  return failures;
}

/** The Sentry DSN the page's error loader carries, or null. */
export function findDsn(/** @type {string} */ html) {
  const m = /"(https:\/\/[0-9a-f]{32}@[a-z0-9.-]+\.ingest(?:\.[a-z]+)?\.sentry\.io\/\d+)"/.exec(html);
  return m ? new URL(m[1]) : null;
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

/**
 * The probe envelope: one error event as the site's error loader would send it, from an
 * ordinary browser. A crawler's user agent is filtered before the origin rule is applied.
 */
export function probeEnvelope(/** @type {string} */ domain, /** @type {Date} */ now = new Date()) {
  const eventId = randomUUID().replaceAll("-", "");
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    environment: "domain-check",
    message: { formatted: "domain-check origin probe" },
    request: { url: `https://${domain}/`, headers: { "User-Agent": PROBE_USER_AGENT } },
  };
  return `${JSON.stringify({ event_id: eventId, sent_at: now.toISOString() })}\n{"type":"event"}\n${JSON.stringify(event)}\n`;
}

/** Posts the probe event to the DSN's envelope endpoint as a browser on `origin` would. */
function report(/** @type {URL} */ dsn, /** @type {string} */ domain, /** @type {string} */ origin) {
  const url = `${dsn.origin}/api${dsn.pathname}/envelope/?sentry_key=${dsn.username}&sentry_version=7`;
  return twice(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { origin, "user-agent": PROBE_USER_AGENT, "content-type": "text/plain;charset=UTF-8" },
      body: probeEnvelope(domain),
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    if (res.status >= 500) throw new Error(`Sentry ingest answered ${res.status}`);
    return res.status;
  });
}

const FOREIGN_TRIES = 8;
/** A cold relay can accept a whole quick sequence. One wait, then one more sequence. */
const COLD_PAUSE_MS = 5_000;

/**
 * Foreign-origin probes, one at a time, stopping at the first 403. If a whole sequence is
 * accepted, waits once so a cold relay can load the project, then sends one more sequence.
 * @returns {Promise<number[]>}
 */
async function foreignProbes(/** @type {URL} */ dsn, /** @type {string} */ domain) {
  /** @type {number[]} */
  const statuses = [];
  for (let round = 0; round < 2 && !statuses.includes(403); round++) {
    if (round === 1) await new Promise((resolve) => setTimeout(resolve, COLD_PAUSE_MS));
    for (let i = 0; i < FOREIGN_TRIES && !statuses.includes(403); i++) {
      statuses.push(await report(dsn, domain, FOREIGN_ORIGIN));
    }
  }
  return statuses;
}

/** @returns {Promise<IngestFacts>} */
async function ingest(/** @type {string} */ domain) {
  const page = `https://${domain}/`;
  const html = await twice(async () => {
    const res = await fetch(page, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${page} answered ${res.status}`);
    return res.text();
  });
  const dsn = findDsn(html);
  if (!dsn) return { page, dsn: false };
  // The site's own report first. Sentry's own origin is always accepted. A foreign origin is
  // refused with 403 once the relay has the project, but a cold relay answers 200 (with an event
  // id that is never stored) until it has. Measured on 21 Nov 2026 against waseemilyas-portfolio,
  // whose allowedDomains is waseemilyas.uk only: eight probes sent together all got 200 (CI run
  // 44948674924), and eight sent one at a time still all got 200 (CI run 44954078081). One 403
  // is the rule. A project that allows every origin answers 200 to both sequences and still fails.
  const own = await report(dsn, domain, `https://${domain}`);
  const statuses = await foreignProbes(dsn, domain);
  const refused = statuses.filter((status) => status === 403).length;
  return { page, dsn: true, own, foreign: statuses.at(-1), refused, sent: statuses.length };
}

/** @returns {Promise<SecurityTxtFacts>} */
function securityTxt(/** @type {string} */ domain) {
  const url = `https://${domain}/${SECURITY_TXT}`;
  return twice(async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { url, status: res.status, text: await res.text() };
  });
}

/** Reads the live facts for `domain`. */
export async function gather(/** @type {string} */ domain) {
  const dnsFacts = await Promise.all(Object.keys(RESOLVERS).map(async (resolver) => {
    const [a, caa, https] = await Promise.all([dns(resolver, domain, "A"), dns(resolver, domain, "CAA"), dns(resolver, domain, "HTTPS")]);
    /** @type {(body: any, type: number) => string[]} */
    const data = (body, type) => (body.Answer ?? []).filter((/** @type {{ type: number }} */ r) => r.type === type).map((/** @type {{ data: string }} */ r) => r.data);
    return { resolver, ad: a.AD === true, caaAd: caa.AD === true, caa: data(caa, 257), httpsAd: https.AD === true, https: data(https, 65) };
  }));
  const hosts = [domain, `www.${domain}`];
  return {
    domain,
    now: new Date(),
    dns: dnsFacts,
    certs: await Promise.all(hosts.map(certificate)),
    redirects: await Promise.all(hosts.map((host) => redirect(`http://${host}/`))),
    ingest: await ingest(domain),
    securityTxt: await securityTxt(domain),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { domain: { type: "string", default: "waseemilyas.uk" } } });
  const facts = await gather(String(values.domain));
  const failures = evaluate(facts);
  for (const { resolver, caa, https } of facts.dns) {
    console.log(`[domain] ${resolver} CAA: ${caa.join(" | ") || "none"}; HTTPS: ${https.join(" | ") || "none"}`);
  }
  for (const { host, issuer, validTo } of facts.certs) console.log(`[domain] ${host}: ${issuer}, valid to ${validTo.toISOString().slice(0, 10)}`);
  const { own, foreign } = facts.ingest;
  if (facts.ingest.dsn) {
    const { refused, sent } = facts.ingest;
    console.log(`[domain] Sentry ingest: own origin ${own}, another website ${refused ?? (foreign === 403 ? 1 : 0)} of ${sent ?? 1} refused`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    process.exit(1);
  }
  console.log(`[domain] ${values.domain}: CAA, certificates, DNSSEC, HTTPS redirects and record, error-report origins and security.txt all pass`);
}
