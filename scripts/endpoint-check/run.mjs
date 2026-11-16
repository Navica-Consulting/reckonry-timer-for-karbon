#!/usr/bin/env node
// Daily Karbon endpoint check, run by Playwright instead of a Claude browser tab.
// It keeps its own Chromium profile outside the repo, signs Karbon back in through SSO when the
// session has expired, runs the bundle that bundle.sh builds, logs to out/history.jsonl, and alerts.
// See docs/ENDPOINT-CHECK.md.
//   node run.mjs --login       open a visible browser so Max can sign in once
//   node run.mjs               the daily check (headless): reads and writes, alerts on failure
//   Options: --read (reads only), --src (test src/ instead of the newest tag), --headed,
//            --no-alert (log only), --history <file> (append somewhere else)
import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ARGS = process.argv.slice(2);
const flag = (f) => ARGS.includes(f);
const arg = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };

const KARBON = 'https://app2.karbonhq.com/';
const DATA = process.env.KT_CHECK_HOME || path.join(os.homedir(), '.local/share/reckonry-endpoint-check');
const PROFILE = path.join(DATA, 'profile');
const SSO_FILE = path.join(DATA, 'sso.json');
const OUT = path.join(HERE, 'out');
const HISTORY = arg('--history') || path.join(OUT, 'history.jsonl');
const KEYRING = 'reckonry-endpoint-check';
const LABEL = 'endpoint-check';
// Karbon's SSO buttons, and the sign-in host each one leads to.
const IDPS = [
  { name: 'Office 365', button: 'Continue with Office 365', host: /login\.microsoftonline\.com|login\.live\.com/ },
  { name: 'Google', button: 'Continue with Google', host: /accounts\.google\.com/ },
];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const localIso = (d = new Date()) => {
  const off = -d.getTimezoneOffset(); const p = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 19) + (off >= 0 ? '+' : '-') + p(off / 60) + ':' + p(off % 60);
};

class SignInNeeded extends Error {}

// ---- Browser ----
async function open(headless) {
  fs.mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
  fs.chmodSync(DATA, 0o700);
  // The full Chromium build in both modes, so the headless run reads the cookies the visible login
  // wrote. password-store=basic keeps cookies readable when the GNOME keyring is locked (systemd).
  return chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless, viewport: { width: 1400, height: 900 },
    args: ['--password-store=basic'],
  });
}

// True once Karbon's Ember app reports a signed-in session (the same check check.js starts with).
const appReady = (page, timeout) => page.waitForFunction(() => {
  const app = window.StagingApp;
  const inst = app && (app.__deprecatedInstance__ || (app._applicationInstances && [...app._applicationInstances][0]));
  const s = inst && inst.lookup && inst.lookup('service:session');
  return !!(s && s.isLoggedIn === true && s.tenantPermaKey);
}, null, { timeout, polling: 500 }).then(() => true, () => false);

const onSignin = (page) => /\/signin/.test(new URL(page.url()).pathname) && new URL(page.url()).host === 'app2.karbonhq.com';

// ---- Login (Max, once, in a visible window) ----
async function login() {
  const ctx = await open(false);
  const page = ctx.pages()[0] || (await ctx.newPage());
  let idp = null;
  ctx.on('request', (r) => { const h = new URL(r.url()).host; const m = IDPS.find((x) => x.host.test(h)); if (m) idp = m.name; });
  await page.goto(KARBON);
  log('Sign in to Karbon in the window that opened. Tick "Stay signed in" if Microsoft asks. Waiting up to 10 minutes.');
  const ok = await appReady(page, 10 * 60 * 1000);
  if (ok && idp) fs.writeFileSync(SSO_FILE, JSON.stringify({ provider: idp, at: localIso() }, null, 2) + '\n', { mode: 0o600 });
  await sleep(3000); // let Karbon write its cookies
  await ctx.close();
  if (!ok) { log('Not signed in after 10 minutes. Run npm run login again.'); process.exit(2); }
  log(`Signed in${idp ? ` through ${idp}` : ''}. The profile is in ${PROFILE}.`);
}

// ---- Sign-in during a check, with no person present ----
// Clicks the SSO button Max used. The identity provider's own cookie usually signs Karbon back in
// with no prompt. If it asks for something, the optional keyring entries answer; otherwise it stops.
async function ensureSignedIn(page) {
  await page.goto(KARBON, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60 && !onSignin(page); i++) {
    if (await appReady(page, 1000)) return 'session';
  }
  if (!onSignin(page)) throw new Error(`Karbon did not load: ${redact(page.url())}`);
  const why = new URL(page.url()).searchParams.get('autologout') ? 'autologout' : 'expired';
  const sso = readJson(SSO_FILE);
  const idp = IDPS.find((x) => x.name === (sso && sso.provider));
  if (!idp) throw new SignInNeeded(`Karbon is signed out (${why}) and no SSO provider is recorded. Run npm run login.`);
  log(`Karbon is signed out (${why}); continuing with ${idp.name}`);
  await page.getByRole('button', { name: idp.button }).click();
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (new URL(page.url()).host === 'app2.karbonhq.com' && !onSignin(page) && (await appReady(page, 2000))) return `sso:${why}`;
    if (idp.host.test(new URL(page.url()).host) && idp.name === 'Office 365') await microsoftStep(page);
    else await sleep(1000);
  }
  throw new SignInNeeded(`${idp.name} did not sign Karbon back in (stopped at ${redact(page.url())}). Run npm run login.`);
}

// One step of Microsoft's sign-in pages. Only the account picker and "Stay signed in?" are answered
// without the keyring; a password or code prompt needs Max's keyring entries.
async function microsoftStep(page) {
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const submit = () => page.locator('#idSIButton9, button[type=submit], input[type=submit], [data-testid="primaryButton"]').first().click();
  await sleep(1500);
  if (await visible('input[type=password]')) {
    const pw = keyring('password');
    if (!pw) throw new SignInNeeded('Microsoft asked for the password, and none is in the keyring. Run npm run login.');
    await page.locator('input[type=password]').first().fill(pw);
    return submit();
  }
  if (await visible('input[name=otc], input[autocomplete=one-time-code]')) {
    const secret = keyring('totp');
    if (!secret) throw new SignInNeeded('Microsoft asked for a sign-in code, and no TOTP secret is in the keyring. Run npm run login.');
    await page.locator('input[name=otc], input[autocomplete=one-time-code]').first().fill(totp(secret));
    return submit();
  }
  if (await visible('#KmsiCheckboxField, #kmsiTitle, [data-testid="kmsiVideo"]')) {
    await page.locator('#KmsiCheckboxField').check().catch(() => {});
    return submit();
  }
  // Pick an account: one remembered account is safe to click; anything else needs Max.
  const tiles = page.locator('#tilesHolder [role=button], [data-test-id] [role=button]').filter({ hasText: '@' });
  const n = await tiles.count().catch(() => 0);
  if (n === 1) return tiles.first().click();
  if (n > 1) throw new SignInNeeded('Microsoft showed more than one account. Run npm run login.');
  if (await visible('input[name=loginfmt], input[type=email]')) throw new SignInNeeded('Microsoft asked for the account name. Run npm run login.');
  if (/Approve sign in|Enter code|Verify your identity/i.test(await page.locator('body').innerText().catch(() => ''))) {
    throw new SignInNeeded('Microsoft asked for multi-factor approval. Run npm run login.');
  }
}

// Reads an optional secret that Max stored with: keyring set reckonry-endpoint-check <password|totp>
function keyring(name) {
  const r = spawnSync('keyring', ['get', KEYRING, name], { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null;
}

// RFC 6238 code from a base32 secret, for an account whose MFA is an authenticator app.
function totp(secret, t = Date.now()) {
  const b32 = secret.replace(/[\s=-]/g, '').toUpperCase(); let bits = '';
  for (const c of b32) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', key).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

// ---- The check ----
function bundle() {
  const flags = ['--read', '--src'].filter(flag);
  const out = execFileSync(path.join(HERE, 'bundle.sh'), flags, { encoding: 'utf8' });
  log(out.trim());
  const ref = (out.match(/karbon\.js from (\S+?),/) || [])[1] || null;
  // run.full.js is "await (async () => {...})();". Without the leading await it is one expression,
  // a promise, which page.evaluate awaits. This is the same code that was pasted before, as is.
  const src = fs.readFileSync(path.join(OUT, 'run.full.js'), 'utf8').replace(/^(\/\/.*\n)*await /, '').replace(/;\s*$/, '');
  return { src, ref };
}

async function runOnce(page, src) {
  if (!(await appReady(page, 30000))) await ensureSignedIn(page);
  const timeout = sleep(6 * 60 * 1000).then(() => { throw new Error('the check did not finish in 6 minutes'); });
  return Promise.race([page.evaluate(src), timeout]);
}

const summary = (r) => ({
  ok: r.ok, signedOut: !!r.signedOut, counts: r.counts,
  failed: r.checks.filter((c) => c.status === 'fail').map((c) => ({ id: c.id, detail: c.detail })),
});

async function check() {
  const { src, ref } = bundle();
  const ctx = await open(!flag('--headed'));
  const page = ctx.pages()[0] || (await ctx.newPage());
  const entry = { at: localIso(), runner: 'playwright', ref, writes: !flag('--read') };
  let first = null; let report = null;
  try {
    entry.signin = await ensureSignedIn(page);
    log(`Signed in (${entry.signin}). Running the check.`);
    report = first = await runOnce(page, src);
    if (!report.ok && !report.signedOut) {
      log(`Failed: ${summary(report).failed.map((f) => f.id).join(', ')}. Running it once more.`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      report = await runOnce(page, src);
      if (report.ok) entry.blip = summary(first).failed;
    }
    Object.assign(entry, summary(report), { seconds: report.seconds });
    if (report.signedOut) entry.failed.unshift({ id: 'signin', detail: 'Karbon reported signed out during the check' });
  } catch (e) {
    const signin = e instanceof SignInNeeded;
    Object.assign(entry, { ok: false, signedOut: signin, counts: null, failed: [{ id: signin ? 'signin' : 'run', detail: String(e.message || e).slice(0, 300) }] });
    if (!signin) await page.screenshot({ path: path.join(OUT, 'last-error.png') }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.appendFileSync(HISTORY, JSON.stringify(entry) + '\n');
  if (report) fs.writeFileSync(path.join(OUT, 'last-report.json'), JSON.stringify(report, null, 2) + '\n');
  log(`${entry.ok ? 'Pass' : 'FAIL'}${entry.blip ? ' (after a blip)' : ''}: ${JSON.stringify(entry.counts)} ${entry.failed.map((f) => `${f.id}: ${f.detail}`).join('; ')}`);
  log(`Logged to ${HISTORY}`);
  if (!flag('--no-alert')) alert(entry);
  process.exit(entry.ok ? 0 : entry.signedOut ? 2 : 1);
}

// ---- Alerts: a desktop notification and one open GitHub issue, closed by the next pass ----
function alert(e) {
  const gh = (...a) => spawnSync('gh', a, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  const open = () => { const r = gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--jq', '.[0].number'); return r.status === 0 ? r.stdout.trim() : null; };
  if (e.ok) {
    const n = open();
    if (n) gh('issue', 'close', n, '--comment', `The check passed again at ${e.at} (karbon.js ${e.ref}).`);
    return;
  }
  const title = e.signedOut ? 'Karbon endpoint check: sign-in needed' : `Karbon endpoint check failed: ${e.failed.map((f) => f.id).join(', ')}`;
  const fix = e.signedOut
    ? 'Karbon could not be signed back in without a person. On Max\'s computer, run `npm run login` in `scripts/endpoint-check`, sign in, then `npm run check`.'
    : 'A check failed twice in a row. Follow "When a check fails" in docs/ENDPOINT-CHECK.md.';
  const body = [`${fix}`, '', `Run at ${e.at}, karbon.js ${e.ref}, writes ${e.writes}.`, '',
    ...e.failed.map((f) => `- \`${f.id}\`: ${f.detail}`), '', 'Full report: `scripts/endpoint-check/out/last-report.json` on Max\'s computer.'].join('\n');
  spawnSync('notify-send', ['--app-name=Reckonry endpoint check', '--urgency=critical', title, fix.replace(/`/g, '')], { timeout: 10000 });
  gh('label', 'create', LABEL, '--color', 'D93F0B', '--description', 'Daily Karbon endpoint check');
  const n = open();
  const r = n ? gh('issue', 'comment', n, '--body', `**${title}**\n\n${body}`) : gh('issue', 'create', '--title', title, '--label', LABEL, '--body', body);
  if (r.status !== 0) log(`Could not post the GitHub alert: ${(r.stderr || '').trim().slice(0, 200)}`);
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// Sign-in URLs can carry tokens and email addresses in the query, so log only the host and path.
const redact = (u) => { try { const x = new URL(u); return x.host + x.pathname; } catch { return '(no url)'; } };

if (flag('--login')) await login();
else await check();
