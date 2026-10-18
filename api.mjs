// Crown the Game API as a Netlify Function. Storage: Netlify Blobs. Email: Resend or SMTP (nodemailer).
// Environment variables (Netlify > Site configuration > Environment variables):
//   ADMIN_KEY        REQUIRED. A long random string (32+ characters). Also used to sign verification codes.
//   Email via Resend: RESEND_API_KEY, MAIL_FROM (e.g. "Crown the Game <noreply@yourdomain.com>", on a domain verified in Resend)
//   (or SMTP instead: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM)
//   OWNER_EMAIL      where cash-out requests are emailed to you
//   MAIL_HOURLY_CAP  optional, default 200. Circuit breaker on total emails sent per hour.
//   TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY   Cloudflare Turnstile bot check (free). Both must be set to turn it on.
//   ALLOW_MAIL_LOG=1 development only: print codes to the log instead of emailing them.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { BANK } from "./questions.mjs";

export const config = { path: "/api/*" };

// ---- Question pools ----
// Contest questions are NEVER shown in practice play (and never revealed), so practice answers can't be harvested to win the contest.
const isContestQ = i => i % 3 === 0;
const CONTEST_IDX = [...BANK.keys()].filter(isContestQ), PRACTICE_IDX = [...BANK.keys()].filter(i => !isContestQ(i));

// ---- Rules ----
const TOTAL = 10;                            // questions per game
const TIME_MS = 10000;                       // 10 seconds per question (measured by the SERVER, not the browser)
const GRACE_MS = 2500;                       // network allowance on top of TIME_MS
const LATENCY_CREDIT_MS = 600;               // subtracted from server-measured time when scoring speed
const PRIZES = [500, 300, 200];              // 1st $5, 2nd $3, 3rd $2 (cents)
const REST_POOL = 1000, MAX_PAID = 25;       // remaining $10 split equally among places 4 to 25
const CONTEST_HOUR = 21;                     // Tuesday 9:00 PM Eastern; the contest window is one hour (9:00 to 10:00 PM ET)
const REWARD_PER_DAY = 1;                    // outside the contest, one entry-earning play per account per day (Eastern)
const ENTRIES = { crowned: 10, duke: 3, knight: 1, squire: 0, peasant: 0 };
const TOKEN_DAYS = 14;
const MAIL_CAP = Number(process.env.MAIL_HOURLY_CAP) || 200;
const tierOf = r => r >= 10 ? "crowned" : r >= 8 ? "duke" : r >= 6 ? "knight" : r >= 3 ? "squire" : "peasant";
const sum = a => a.reduce((t, x) => t + x, 0);
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const norm = e => String(e || "").trim().toLowerCase();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Signing secret (verification codes). Fails closed if ADMIN_KEY is missing.
const secret = () => { const s = process.env.ADMIN_KEY || ""; if (s.length < 16) throw new Error("ADMIN_KEY must be set (16+ characters)"); return s; };
const hmac = s => crypto.createHmac("sha256", secret()).update(s).digest("hex");
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---- Email identity ----
// One person = one canonical address, so +tags, Gmail dots and throwaway inboxes can't mint extra accounts.
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "throwawaymail.com", "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.net", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mailnesia.com", "mintemail.com", "mohmal.com", "emailondeck.com", "burnermail.io", "spamgourmet.com", "mytemp.email", "tempail.com", "inboxkitten.com", "moakt.com", "discard.email", "tmpmail.org", "tmpmail.net", "mail.tm", "1secmail.com", "1secmail.net", "emailfake.com", "fakemail.net", "gettempmail.com"]);
const okEmail = e => e.length < 255 && /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e);
const allowedEmail = e => okEmail(e) && !DISPOSABLE.has(e.split("@")[1]);
function canon(e) {
  e = norm(e);
  const i = e.lastIndexOf("@");
  let l = e.slice(0, i), d = e.slice(i + 1);
  if (d === "googlemail.com") d = "gmail.com";
  const base = l.split("+")[0];
  if (base) l = base;
  if (d === "gmail.com") l = l.replace(/\./g, "");
  return `${l}@${d}`;
}
const ident = e => sha(canon(e));

// ---- Storage helpers ----
const store = n => getStore({ name: n, consistency: "strong" });
const get = (n, k) => store(n).get(k, { type: "json" });
const put = (n, k, v, o) => store(n).setJSON(k, v, o);
const del = (n, k) => store(n).delete(k);

// Atomic read-modify-write using conditional writes (etag compare-and-swap). fn(current) must be pure.
// fn returns { write?, result }. If `write` is present it is stored; the call retries if someone else wrote first.
async function update(name, key, fn) {
  const s = store(name);
  for (let i = 0; i < 12; i++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const out = await fn(cur ? cur.data : null);
    if (!out || out.write === undefined) return out ? out.result : undefined;
    const r = await s.setJSON(key, out.write, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!(r && r.modified === false)) return out.result;
    await new Promise(res => setTimeout(res, 10 + Math.random() * 40 * (i + 1)));
  }
  throw new Error("busy");
}
async function atomicWritesWork() {
  const s = store("selftest"), k = "cas";
  await s.setJSON(k, { v: 1 });
  const first = await s.getWithMetadata(k, { type: "json" });
  await s.setJSON(k, { v: 2 });
  const r = await s.setJSON(k, { v: 3 }, { onlyIfMatch: first.etag });
  return !!(r && r.modified === false);
}

// Hourly counters. Key starts with the hour bucket so the janitor can sweep old ones.
const bucketKey = (action, id) => `${Math.floor(Date.now() / 3600000)}:${action}:${sha(String(id))}`;
const bump = (action, id) => update("limits", bucketKey(action, id), n => ({ write: (n || 0) + 1, result: (n || 0) + 1 }));
const peek = async (action, id) => (await get("limits", bucketKey(action, id))) || 0;
// IPv6 clients get a whole /64 each, so rotating addresses inside one network doesn't dodge limits.
function ipKey(ip) {
  ip = String(ip);
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const [h, t = ""] = ip.split("::"), a = h ? h.split(":") : [], b = t ? t.split(":") : [];
  return [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b].map(x => x.padStart(4, "0")).slice(0, 4).join(":");
}
const limited = async (ip, action, max) => (await bump(action, ipKey(ip))) > max;

// Opportunistic cleanup so old counters, sessions, codes and tokens don't pile up forever.
async function firstKeys(name, n) {
  for await (const page of store(name).list({ paginate: true })) return page.blobs.slice(0, n).map(b => b.key);
  return [];
}
async function janitor() {
  const now = Date.now(), hr = Math.floor(now / 3600000);
  for (const k of await firstKeys("limits", 200)) if (Number(k.split(":")[0]) < hr - 2) await del("limits", k);
  const stale = { sessions: v => now - v.created > 2 * 86400000, codes: v => v.expires < now, tokens: v => v.expires < now };
  for (const name of Object.keys(stale)) for (const k of await firstKeys(name, 40)) { const v = await get(name, k); if (v && stale[name](v)) await del(name, k); }
}

const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const wrap = (title, body) => `<div style="background:#0b0f2a;padding:24px;font-family:Georgia,serif"><div style="max-width:480px;margin:0 auto;background:#151a45;border:1px solid #c9a84c;border-radius:6px;padding:28px;color:#f5efe0"><h2 style="margin:0 0 16px;color:#e6c76a;font-weight:normal">${esc(title)}</h2>${body}<p style="margin:24px 0 0;font-size:12px;color:#9aa0c8">Crown the Game. If you did not request this, you can ignore this email.</p></div></div>`;

let transport;
async function mail(to, subject, text, html) {
  if (process.env.RESEND_API_KEY) {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error("MAIL_FROM is not set");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`Resend error ${r.status}: ${await r.text()}`);
    return;
  }
  const host = process.env.SMTP_HOST;
  if (!host) {
    // Fail closed: never "succeed" without really sending, and never leave codes in production logs.
    if (process.env.ALLOW_MAIL_LOG === "1") { console.log(`[mail to ${to}] ${subject}\n${text}`); return; }
    throw new Error("No email provider configured (set RESEND_API_KEY or SMTP_HOST)");
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM is not set");
  const port = Number(process.env.SMTP_PORT) || 587;
  transport ||= nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
}

// ---- One-time email codes ----
async function sendCode(email, session) {
  const k = sha(email), who = ident(email);
  if ((await peek("sendcode", who)) >= 8) return;                       // max 8 codes per person per hour
  const code = String(crypto.randomInt(100000, 1000000));
  const sent = await update("codes", k, prev => (prev && prev.sent && Date.now() - prev.sent < 60000)
    ? { result: false }                                                  // one code per address per minute
    : { write: { hash: hmac(`${code}:${email}`), session, sent: Date.now(), expires: Date.now() + 600000, tries: 0, used: false }, result: true });
  if (!sent) return;
  if ((await bump("mail", "global")) > MAIL_CAP) throw new Error("Hourly email cap reached");
  await mail(email, "Your Crown the Game code",
    `Your verification code is ${code}. It expires in 10 minutes.`,
    wrap("Your verification code", `<p style="font-size:34px;letter-spacing:8px;margin:12px 0;color:#e6c76a">${code}</p><p>It expires in 10 minutes.</p>`));
  await bump("sendcode", who);
}
// Attempt counting and the code comparison happen in ONE atomic step, so parallel guesses can't exceed 5 tries
// and one code can't be used twice.
async function checkCode(email, code) {
  const guess = hmac(`${String(code || "").slice(0, 12)}:${email}`);
  return update("codes", sha(email), row => {
    if (!row || row.used || row.expires < Date.now() || row.tries >= 5) return { result: null };
    const ok = safeEq(guess, row.hash);
    return { write: { ...row, tries: row.tries + 1, used: ok, expires: ok ? 0 : row.expires }, result: ok ? row : null };
  });
}

// ---- HTTP helpers ----
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });
const fail = (status, error) => json({ error }, status);
const STATUS = { session_expired: 410, contest_closed: 410, bad_state: 409, busy: 503 };
const failOf = e => fail(STATUS[e] || 400, e);

// Bot check (Cloudflare Turnstile). Turns on only when BOTH keys are set. Every token is verified by Cloudflare's server and works once.
const botCheckOn = () => !!(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
async function botOk(b, ip) {
  if (!botCheckOn()) return true;
  const token = String(b.ts || "");
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => null);
    return !!(j && j.success === true);
  } catch (e) { console.error("turnstile verify failed", e); return false; }   // fail closed
}

// Admin auth: key is sent in the Authorization header (never in the URL, so it can't end up in logs or history).
function isAdmin(req) {
  const want = process.env.ADMIN_KEY || "", h = req.headers.get("authorization") || "";
  const got = h.startsWith("Bearer ") ? h.slice(7).trim() : (req.headers.get("x-admin-key") || "");
  if (want.length < 16 || !got) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(got), "hex"), Buffer.from(sha(want), "hex"));
}

// ---- Eastern-time contest schedule ----
const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function et(ts) {
  const p = Object.fromEntries(etFmt.formatToParts(ts).map(x => [x.type, x.value]));
  return { wd: p.weekday, date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const liveContest = ts => { const t = et(ts); return t.wd === "Tue" && t.hour === CONTEST_HOUR ? t.date : null; };
function contestTimes(now) {
  const nextHour = Math.ceil((now + 1) / 3600000) * 3600000;
  const live = liveContest(now);
  if (live) return { live, endsAt: nextHour, nextStart: null };
  for (let h = 0; h < 24 * 8; h++) if (liveContest(nextHour + h * 3600000)) return { live: null, nextStart: nextHour + h * 3600000 };
  return { live: null, nextStart: null };
}
let ctCache = { slot: -1, v: null };
function contestTimesCached(now) {
  const slot = Math.floor(now / 10000);
  if (ctCache.slot !== slot) ctCache = { slot, v: contestTimes(now) };
  return ctCache.v;
}
// A contest is settled only after a 1-minute buffer past 10:00 PM ET, after all in-flight answers have landed.
function endedContests(now) {
  const n = et(now), closed = n.hour > CONTEST_HOUR + 1 || (n.hour === CONTEST_HOUR + 1 && new Date(now).getUTCMinutes() >= 1), out = new Set();
  for (let d = 0; d <= 35; d++) {
    const t = et(now - d * 86400000);
    if (t.wd !== "Tue") continue;
    if (t.date < n.date || (t.date === n.date && closed)) out.add(t.date);
  }
  return [...out];
}

// ---- Prizes ----
// Full field (25): $5 / $3 / $2, then $10 split equally among places 4 to 25.
// Smaller field (4 to 24): places 4+ never get more than REST_CAP, and whatever that frees up is added to 1st/2nd/3rd (50/30/20),
// so the top three always win the most. With 3 or fewer players, only those places are paid their base prize.
const REST_CAP = 100; // most any place from 4th down can win, in cents
function prizeSchedule(n) {
  n = Math.min(n, MAX_PAID);
  if (n <= PRIZES.length) return PRIZES.slice(0, n);
  const m = n - PRIZES.length, top = PRIZES.slice(), rest = [];
  if (m * REST_CAP >= REST_POOL) {
    const base = Math.floor(REST_POOL / m), rem = REST_POOL - base * m;
    for (let i = 0; i < m; i++) rest.push(base + (i < rem ? 1 : 0));
  } else {
    for (let i = 0; i < m; i++) rest.push(REST_CAP);
    const extra = REST_POOL - REST_CAP * m, s = [Math.floor(extra * 0.5), Math.floor(extra * 0.3), Math.floor(extra * 0.2)];
    s[0] += extra - sum(s);
    for (let i = 0; i < 3; i++) top[i] += s[i];
  }
  return [...top, ...rest];
}
const money = c => `$${(c / 100).toFixed(2)}`;
async function contestRows(cid) {
  const { blobs } = await store("contest-scores").list({ prefix: cid + ":" });
  return (await Promise.all(blobs.map(b => get("contest-scores", b.key)))).filter(r => r && r.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at).slice(0, MAX_PAID);
}
// Credits winners once per contest. Each win is its own ledger row written only-if-new, so this is safe to run repeatedly.
async function settle(cid) {
  if (await get("settled", cid)) return;
  const rows = await contestRows(cid), amounts = prizeSchedule(rows.length);
  await Promise.all(rows.map((r, i) => put("ledger", `${r.ident}:win:${cid}`, { type: "win", email: r.email, cid, rank: i + 1, cents: amounts[i], score: r.score, at: Date.now() }, { onlyIfNew: true })));
  await put("settled", cid, { at: Date.now(), winners: rows.length, totalCents: sum(amounts) });
}
let lastSettleCheck = 0;
async function settleDue(force) {
  const now = Date.now();
  if (!force && now - lastSettleCheck < 60000) return;
  lastSettleCheck = now;
  for (const cid of endedContests(now)) await settle(cid);
}

// ---- Accounts, sessions, ledger ----
async function getAcct(email) { return (await get("accounts", ident(email))) || null; }
async function ensureAcct(email) {
  const a = await getAcct(email);
  if (a) return a;
  await put("accounts", ident(email), { email, entries: 0, created: Date.now(), rewardDay: null, rewardCount: 0 }, { onlyIfNew: true });
  return await getAcct(email);
}
async function newToken(email) {
  const t = crypto.randomBytes(24).toString("hex");
  await put("tokens", sha(t), { email, expires: Date.now() + TOKEN_DAYS * 86400000 });
  return t;
}
async function auth(b) {
  const t = String(b.token || "");
  if (t.length < 32 || t.length > 128) return null;
  const r = await get("tokens", sha(t));
  return r && r.expires > Date.now() ? r.email : null;
}
async function ledgerRows(email) {
  const { blobs } = await store("ledger").list({ prefix: ident(email) + ":" });
  return (await Promise.all(blobs.map(async x => { const v = await get("ledger", x.key); return v && { ...v, ref: x.key }; }))).filter(Boolean);
}
// Balance is computed from the ledger (wins minus cash-outs), so winnings stack and there is no balance field to race on.
async function me(email) {
  await settleDue();
  const a = (await getAcct(email)) || { entries: 0 }, rows = await ledgerRows(email);
  const wins = rows.filter(r => r.type === "win"), outs = rows.filter(r => r.type === "out");
  const today = et(Date.now()).date;
  return {
    email, entries: a.entries || 0,
    balanceCents: sum(wins.map(r => r.cents)) - sum(outs.map(r => r.cents)),
    pendingCents: sum(outs.filter(r => r.status !== "paid").map(r => r.cents)),
    paidCents: sum(outs.filter(r => r.status === "paid").map(r => r.cents)),
    wins: wins.sort((x, y) => y.at - x.at).slice(0, 5).map(r => ({ cid: r.cid, rank: r.rank, cents: r.cents })),
    rewardedToday: a.rewardDay === today && (a.rewardCount || 0) >= REWARD_PER_DAY
  };
}
// Outside the contest: add extra play entries for a finished session to an account (one per session, one rewarded play per day).
async function grant(email, sid) {
  const s = await get("sessions", sid), tier = s && tierOf(s.correct), n = s ? ENTRIES[tier] : 0;
  if (!s || !s.done || s.contest || !n) return { granted: 0, reason: "none" };
  const lock = await put("claims", sid, { email, at: Date.now() }, { onlyIfNew: true });
  if (lock && lock.modified === false) return { granted: 0, reason: "claimed" };
  await ensureAcct(email);
  const today = et(Date.now()).date;
  const res = await update("accounts", ident(email), a => {
    if (a.rewardDay === today && (a.rewardCount || 0) >= REWARD_PER_DAY) return { result: "daily" };
    return { write: { ...a, entries: (a.entries || 0) + n, rewardCount: a.rewardDay === today ? (a.rewardCount || 0) + 1 : 1, rewardDay: today }, result: "ok" };
  });
  if (res === "daily") { await del("claims", sid); return { granted: 0, reason: "daily" }; }
  return { granted: n, tier, reason: "ok" };
}

// ---- Game sessions ----
// The server serves ONE question at a time, starts the clock when it serves it, and measures the answer time itself.
// Answer options are shuffled per question on the server, so answer position in the bank leaks nothing.
const qView = (s, pos) => ({ n: pos + 1, total: TOTAL, q: BANK[s.ids[pos]][0], options: s.perms[pos].map(i => BANK[s.ids[pos]][1][i]) });
const guard = (s, now) => (s.contest && now > s.endsAt) ? "contest_closed" : now - s.created > (s.contest ? 10 : 30) * 60000 ? "session_expired" : null;
async function recordContest(s) {
  const key = `${s.contest}:${ident(s.email)}`, avgMs = Math.round(sum(s.times) / s.times.length), minMs = Math.min(...s.times);
  await update("contest-scores", key, prev => (!prev || s.score > prev.score)
    ? { write: { email: s.email, ident: ident(s.email), score: s.score, right: s.correct, at: Date.now(), avgMs, minMs, ip: s.ipHash }, result: s.score }
    : { result: prev.score });
  return (await get("contest-scores", key)) || { score: s.score };
}

export default async (req, context) => {
  const url = new URL(req.url), route = url.pathname.replace(/^\/api/, ""), ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const method = req.method;
  if (method !== "GET" && method !== "POST") return fail(405, "error");

  let b = {};
  if (method === "POST") {
    const origin = req.headers.get("origin");
    if (origin) { let h; try { h = new URL(origin).host; } catch { h = null; } if (h !== url.host) return fail(403, "error"); }
    if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return fail(415, "error");
    const raw = await req.text();
    if (raw.length > 4096) return fail(413, "error");
    try { b = JSON.parse(raw); } catch { return fail(400, "error"); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return fail(400, "error");
  }

  try {
    // ---------- Admin (header auth, failed attempts are throttled) ----------
    if (route.startsWith("/admin/")) {
      if ((await peek("adminfail", ipKey(ip))) >= 10) return fail(429, "rate_limited");
      if (!isAdmin(req)) { await bump("adminfail", ipKey(ip)); return fail(403, "error"); }

      if (method === "GET" && route === "/admin/status") {
        return json({
          mail: process.env.RESEND_API_KEY ? "resend" : process.env.SMTP_HOST ? "smtp" : process.env.ALLOW_MAIL_LOG === "1" ? "log-only (dev)" : "NOT CONFIGURED",
          ownerEmail: !!process.env.OWNER_EMAIL, botCheck: botCheckOn() ? "ON" : "OFF (set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY)", atomicWrites: await atomicWritesWork(),
          contestQuestions: CONTEST_IDX.length, practiceQuestions: PRACTICE_IDX.length
        });
      }
      if (method === "GET" && route === "/admin/contest") {
        // Results for a contest (default: most recent ended one) with the prize each place gets, plus review flags. Winnings are credited automatically.
        await settleDue(true);
        const cid = url.searchParams.get("cid") || endedContests(Date.now()).sort().pop() || contestTimes(Date.now()).live;
        if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(cid)) return json({ cid: null, results: [] });
        const rows = await contestRows(cid), amounts = prizeSchedule(rows.length), ips = {};
        rows.forEach(r => { ips[r.ip] = (ips[r.ip] || 0) + 1; });
        return json({
          cid, settled: !!(await get("settled", cid)), totalCents: sum(amounts),
          results: rows.map((r, i) => ({
            rank: i + 1, email: r.email, score: r.score, right: r.right, prize: money(amounts[i]), avgMs: r.avgMs, minMs: r.minMs,
            flags: [r.avgMs < 1500 ? "answers very fast" : null, ips[r.ip] > 1 ? "shares a network with another top player" : null].filter(Boolean)
          }))
        });
      }
      if (method === "GET" && route === "/admin/players") {
        // CSV of verified players (people who proved they own the address). Cells that could run as spreadsheet formulas are defused.
        const { blobs } = await store("accounts").list();
        const accts = (await Promise.all(blobs.map(x => get("accounts", x.key)))).filter(Boolean).sort((x, y) => x.created - y.created);
        const cell = v => { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
        const csv = ["email,joined,entries", ...accts.map(a => [a.email, new Date(a.created).toISOString(), a.entries || 0].map(cell).join(","))].join("\r\n") + "\r\n";
        return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="crown-players.csv"', "cache-control": "no-store", "x-content-type-options": "nosniff" } });
      }
      if (method === "GET" && route === "/admin/cashouts") {
        // Cash-out requests. Pay each in Cash App or Venmo, then mark it paid.
        const { blobs } = await store("ledger").list();
        const outs = (await Promise.all(blobs.filter(x => x.key.includes(":out:")).map(async x => { const v = await get("ledger", x.key); return v && { ref: x.key, email: v.email, amount: money(v.cents), method: v.method, handle: v.handle, status: v.status, requested: new Date(v.at).toISOString() }; }))).filter(Boolean);
        return json({ cashouts: outs.sort((x, y) => (x.status === "pending" ? -1 : 1) - (y.status === "pending" ? -1 : 1) || x.requested.localeCompare(y.requested)) });
      }
      if (method === "POST" && route === "/admin/cashouts/paid") {
        const ref = String(b.ref || "");
        if (!/^[0-9a-f]{64}:out:[0-9a-f-]{36}$/.test(ref)) return fail(400, "error");
        const prev = await update("ledger", ref, v => !v ? { result: null } : v.status === "paid" ? { result: { already: true } } : { write: { ...v, status: "paid", paidAt: Date.now() }, result: v });
        if (!prev) return fail(404, "error");
        if (prev.already) return json({ ok: true, already: true });
        try {
          await mail(prev.email, "Your Crown the Game payout was sent",
            `Your payout of ${money(prev.cents)} was sent to your ${prev.method === "venmo" ? "Venmo" : "Cash App"} (${prev.handle}).`,
            wrap("Payout sent", `<p>Your payout of <b>${money(prev.cents)}</b> was sent to your ${prev.method === "venmo" ? "Venmo" : "Cash App"} (${esc(prev.handle)}).</p>`));
        } catch (e) { console.error("paid email failed", e); }
        return json({ ok: true });
      }
      return fail(404, "error");
    }

    // ---------- Public GET ----------
    if (method === "GET") {
      if (route === "/health") return json({ ok: true });
      if (route === "/config") return json({ turnstileSiteKey: botCheckOn() ? process.env.TURNSTILE_SITE_KEY : null }, 200, { "cache-control": "public, max-age=60" });
      if (route === "/contest/status") {
        await settleDue();
        return json({ now: Date.now(), ...contestTimesCached(Date.now()) }, 200, { "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, max-age=10" });
      }
      return fail(404, "error");
    }

    // ---------- Game ----------
    if (route === "/start") {
      if (!(await botOk(b, ip))) return fail(403, "bot_check_failed");
      const now = Date.now(), contest = !!b.contest;
      let email = null, cid = null;
      if (contest) {
        secret();                                           // refuse to run contests without a configured ADMIN_KEY
        email = await auth(b); cid = liveContest(now);
        if (!email) return fail(401, "signin_required");
        if (!cid) return fail(400, "no_contest");
      } else {
        if (await limited(ip, "start", 10)) return fail(429, "rate_limited");
        if (Math.random() < 0.03) { const p = janitor().catch(e => console.error("janitor", e)); context.waitUntil ? context.waitUntil(p) : await p; }
      }
      const ids = shuffle((contest ? CONTEST_IDX : PRACTICE_IDX).slice()).slice(0, TOTAL), id = crypto.randomUUID();
      const s = { ids, perms: ids.map(() => shuffle([0, 1, 2, 3])), pos: 0, correct: 0, score: 0, done: false, created: now, sentAt: now, times: [], ipHash: sha(ipKey(ip)).slice(0, 12) };
      let spent = null;
      if (contest) {
        // First contest play is free; later plays each cost one entry. Both steps are atomic, so parallel requests can't get extra plays.
        const key = `${cid}:${ident(email)}`;
        const before = await update("contest-plays", key, p => ({ write: { used: ((p && p.used) || 0) + 1 }, result: (p && p.used) || 0 }));
        spent = { key, entry: false };
        if (before >= 1) {
          const ok = await update("accounts", ident(email), a => (a && a.entries > 0) ? { write: { ...a, entries: a.entries - 1 }, result: true } : { result: false });
          if (!ok) { await update("contest-plays", key, p => ({ write: { used: Math.max(0, p.used - 1) }, result: 0 })); return fail(400, "no_entries"); }
          spent.entry = true;
        }
        s.contest = cid; s.email = email; s.endsAt = contestTimes(now).endsAt;
      }
      try { await put("sessions", id, s); }
      catch (e) {
        if (spent) {                                         // don't charge the player for a game that never started
          await update("contest-plays", spent.key, p => ({ write: { used: Math.max(0, p.used - 1) }, result: 0 }));
          if (spent.entry) await update("accounts", ident(email), a => ({ write: { ...a, entries: a.entries + 1 }, result: 0 }));
        }
        throw e;
      }
      return json({ session: id, contest: s.contest || null, timeMs: TIME_MS, ...qView(s, 0) });
    }

    if (route === "/next") {
      const sid = String(b.session);
      if (!SID.test(sid)) return fail(400, "bad_session");
      // Serves the current question and starts its clock. Asking again returns the same question with the SAME clock.
      const r = await update("sessions", sid, s => {
        if (!s) return { result: { err: "bad_session" } };
        const now = Date.now(), e = guard(s, now);
        if (e) return { result: { err: e } };
        if (s.done) return { result: { err: "bad_state" } };
        if (s.sentAt) return { result: { s } };
        return { write: { ...s, sentAt: now }, result: { s: { ...s, sentAt: now } } };
      });
      if (r.err) return failOf(r.err);
      return json({ timeMs: TIME_MS, ...qView(r.s, r.s.pos) });
    }

    if (route === "/answer") {
      const sid = String(b.session), n = Number(b.n);
      if (!SID.test(sid) || !Number.isInteger(n)) return fail(400, "bad_session");
      const r = await update("sessions", sid, s => {
        if (!s) return { result: { err: "bad_session" } };
        const now = Date.now(), e = guard(s, now);
        if (e) return { result: { err: e } };
        if (s.done || !s.sentAt || s.pos + 1 !== n) return { result: { err: "bad_state" } };
        // The SERVER measures how long the answer took. Nothing the browser reports about timing is used.
        const elapsed = now - s.sentAt, id = s.ids[s.pos], perm = s.perms[s.pos], correctIdx = BANK[id][2];
        const valid = Number.isInteger(b.choice) && b.choice >= 0 && b.choice <= 3;
        const timedOut = !valid || elapsed > TIME_MS + GRACE_MS;      // blank, invalid or late is ALWAYS wrong
        const ok = !timedOut && perm[b.choice] === correctIdx;
        const secs = Math.max(0.3, Math.min(TIME_MS / 1000, (elapsed - LATENCY_CREDIT_MS) / 1000));
        const points = ok ? 100 + Math.round((TIME_MS / 1000 - secs) * 10) : 0;
        const ns = { ...s, sentAt: null, pos: s.pos + 1, correct: s.correct + (ok ? 1 : 0), score: s.score + points, times: [...s.times, Math.min(elapsed, 60000)] };
        if (ns.pos >= TOTAL) ns.done = true;
        return { write: ns, result: { s: ns, ok, points, timedOut, answerIndex: perm.indexOf(correctIdx) } };
      });
      if (r.err) return failOf(r.err);
      if (r.s.done && r.s.contest) await recordContest(r.s);          // score is locked in the moment the last answer lands
      const base = { done: r.s.done, timedOut: r.timedOut };
      // Contest play reveals NOTHING about right or wrong, so the contest questions can't be harvested.
      return json(r.s.contest ? { ...base, locked: true } : { ...base, correct: r.ok, answerIndex: r.answerIndex, points: r.points, score: r.s.score });
    }

    if (route === "/finish") {
      const sid = String(b.session);
      if (!SID.test(sid)) return fail(400, "bad_session");
      const s = await get("sessions", sid);
      if (!s || !s.done) return fail(400, "bad_state");
      const tier = tierOf(s.correct);
      if (s.contest) {
        const row = await recordContest(s);                            // idempotent: only ever keeps the best score
        return json({ right: s.correct, score: s.score, tier, entries: 0, contest: s.contest, best: Math.max(s.score, row.score) });
      }
      return json({ right: s.correct, score: s.score, tier, entries: ENTRIES[tier], contest: null });
    }

    if (route === "/claim") {
      // Signed in: add the entries straight away. Otherwise email a code first.
      const sid = String(b.session);
      if (!SID.test(sid)) return fail(400, "bad_session");
      const signed = await auth(b);
      if (signed) { const g = await grant(signed, sid); return json({ ...g, account: await me(signed) }); }
      const email = norm(b.email);
      if (!(await botOk(b, ip))) return fail(403, "bot_check_failed");
      if (await limited(ip, "claim", 6)) return fail(429, "rate_limited");
      if (!allowedEmail(email)) return fail(400, "bad_email");
      const s = await get("sessions", sid);
      if (!s || !s.done || s.contest || !ENTRIES[tierOf(s.correct)]) return fail(400, "error");
      await sendCode(email, sid);
      return json({ status: "verify" });
    }

    if (route === "/verify") {
      if (await limited(ip, "verify", 30)) return fail(429, "rate_limited");
      const email = norm(b.email), row = await checkCode(email, b.code);
      if (!row || row.session !== String(b.session)) return fail(400, "invalid_code");
      await ensureAcct(email);
      const g = await grant(email, row.session);
      return json({ ...g, token: await newToken(email), account: await me(email) });
    }

    if (route === "/signin") {
      const email = norm(b.email);
      if (!(await botOk(b, ip))) return fail(403, "bot_check_failed");
      if (await limited(ip, "signin", 6)) return fail(429, "rate_limited");
      if (!allowedEmail(email)) return fail(400, "bad_email");
      await sendCode(email, null);
      return json({ status: "verify" });
    }

    if (route === "/signin/verify") {
      if (await limited(ip, "verify", 30)) return fail(429, "rate_limited");
      const email = norm(b.email), row = await checkCode(email, b.code);
      if (!row) return fail(400, "invalid_code");
      await ensureAcct(email);
      return json({ token: await newToken(email), account: await me(email) });
    }

    if (route === "/signout") {
      const t = String(b.token || "");
      if (t.length >= 32 && t.length <= 128) await del("tokens", sha(t));   // really revoke it on the server
      return json({ ok: true });
    }

    if (route === "/me") {
      const email = await auth(b);
      if (!email) return fail(401, "signin_required");
      return json({ account: await me(email) });
    }

    if (route === "/cashout") {
      const email = await auth(b);
      if (!email) return fail(401, "signin_required");
      if (await limited(ip, "cashout", 6)) return fail(429, "rate_limited");
      const method = b.method === "venmo" ? "venmo" : b.method === "cashapp" ? "cashapp" : null;
      let handle = String(b.handle || "").trim();
      if (method === "cashapp" && !/^\$[A-Za-z][A-Za-z0-9_]{1,19}$/.test(handle)) return fail(400, "bad_cashapp");
      if (method === "venmo") { handle = handle.replace(/^@?/, "@"); if (!/^@[A-Za-z0-9_-]{5,30}$/.test(handle)) return fail(400, "bad_venmo"); }
      if (!method) return fail(400, "bad_method");
      const id = ident(email);
      // Per-account lock so two cash-outs can never be computed from the same balance.
      const locked = await update("locks", id, l => (l && l.until > Date.now()) ? { result: false } : { write: { until: Date.now() + 30000 }, result: true });
      if (!locked) return fail(409, "busy");
      let ref, cents;
      try {
        const rows = await ledgerRows(email);
        cents = sum(rows.filter(r => r.type === "win").map(r => r.cents)) - sum(rows.filter(r => r.type === "out").map(r => r.cents));
        if (cents <= 0) return fail(400, "no_balance");
        // A payout handle can belong to only ONE account, so many accounts can't funnel prizes into one wallet.
        const owner = await update("handles", sha(`${method}:${handle.toLowerCase()}`), h => h ? { result: h.ident } : { write: { ident: id, at: Date.now() }, result: id });
        if (owner !== id) return fail(409, "handle_taken");
        ref = `${id}:out:${crypto.randomUUID()}`;
        await put("ledger", ref, { type: "out", email, cents, method, handle, status: "pending", at: Date.now() }, { onlyIfNew: true });
      } finally { await del("locks", id).catch(() => {}); }
      const label = method === "venmo" ? "Venmo" : "Cash App";
      try {
        if (process.env.OWNER_EMAIL) await mail(process.env.OWNER_EMAIL, `Crown the Game cash-out: ${money(cents)} to ${label} ${handle}`,
          `${email} requested ${money(cents)} via ${label}: ${handle}\nReview the player's contest flags, pay them, then mark it paid in the admin page (/admin.html).\nRef: ${ref}`);
        await mail(email, "Your Crown the Game cash-out request",
          `We received your request for ${money(cents)} to your ${label} (${handle}). It will be reviewed and sent shortly.`,
          wrap("Cash-out requested", `<p>We received your request for <b>${money(cents)}</b> to your ${label} (${esc(handle)}). It will be reviewed and sent shortly.</p>`));
      } catch (e) { console.error("cashout email failed (request saved)", e); }
      return json({ ok: true, account: await me(email) });
    }
  } catch (e) {
    console.error(e);
    return e && e.message === "busy" ? fail(503, "busy") : fail(500, "error");
  }
  return fail(404, "error");
};
