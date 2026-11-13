/**
 * End-to-end check of the built site in a real browser.
 * Builds nothing itself: run `npm run build` first. Starts `astro preview`, drives every tool with real files,
 * and fails on console errors, horizontal overflow, or any request that leaves the site's own origin.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is resolved with require() so a globally installed copy (and its matching browser) is found.
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4391;
// E2E_BASE_URL runs the same checks against a deployed site instead of a local preview.
const REMOTE = process.env.E2E_BASE_URL;
const BASE = REMOTE ? REMOTE.replace(/\/$/, '') : `http://localhost:${PORT}`;
const work = join(tmpdir(), `trackmend-e2e-${process.pid}`);
const shots = process.env.E2E_SHOTS;
mkdirSync(work, { recursive: true });
if (shots) mkdirSync(shots, { recursive: true });

function gpx(startIso, seconds, lat0) {
  const start = Date.parse(startIso);
  let pts = '';
  for (let i = 0; i < seconds; i++) {
    const lat = lat0 + i * 0.000027;
    const lon = -93 + Math.sin(i / 60) * 0.002;
    pts += `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>250</ele><time>${new Date(start + i * 1000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${130 + (i % 20)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`;
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="e2e"><trk><name>e2e</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

const failures = [];
const check = (cond, label) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failures.push(label);
};

const server = REMOTE ? null : spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'pipe' });
if (server) await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('localhost')) {
      clearTimeout(t);
      resolve();
    }
  });
});

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const offsite = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:')) offsite.push(u);
  });

  const save = async (trigger, name) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
    const path = join(work, name);
    await download.saveAs(path);
    return path;
  };
  const result = () => page.locator('[data-result]');

  // GPX -> FIT (two consecutive parts)
  const gpxA = join(work, 'part-a.gpx');
  const gpxB = join(work, 'part-b.gpx');
  writeFileSync(gpxA, gpx('2026-05-02T14:00:00Z', 600, 45));
  writeFileSync(gpxB, gpx('2026-05-02T14:20:00Z', 300, 45 + 600 * 0.000027));

  await page.goto(`${BASE}/gpx-to-fit/`);
  await page.selectOption('[data-sport]', '2');
  await page.setInputFiles('input[type=file]', gpxA);
  await result().getByText('Converted: 600 records').waitFor();
  check((await result().innerText()).includes('Cycling'), 'gpx2fit: shows chosen activity type');
  const fitA = await save(() => result().locator('a[download]').click(), 'part-a.fit');
  await page.setInputFiles('input[type=file]', gpxB);
  await result().getByText('Converted: 300 records').waitFor();
  const fitB = await save(() => result().locator('a[download]').click(), 'part-b.fit');
  check(readFileSync(fitA).subarray(8, 12).toString() === '.FIT', 'gpx2fit: download is a FIT file');

  // Route without timestamps is refused with a reason.
  const route = join(work, 'route.gpx');
  writeFileSync(route, '<gpx><trk><trkseg><trkpt lat="45" lon="-93"/><trkpt lat="45.1" lon="-93"/></trkseg></trk></gpx>');
  await page.setInputFiles('input[type=file]', route);
  await page.locator('[data-error]').getByText('no timestamps').waitFor();
  check(true, 'gpx2fit: refuses a route without times');

  // Repair: intact file
  await page.goto(`${BASE}/repair-fit-file/`);
  await page.setInputFiles('input[type=file]', fitA);
  await result().getByText('This file is not damaged').waitFor();
  check((await result().locator('a[download]').count()) === 0, 'repair: no download offered for an intact file');

  // Repair: truncated file, sport lost -> asks, re-runs on choice
  const broken = join(work, 'broken.fit');
  const full = readFileSync(fitA);
  writeFileSync(broken, full.subarray(0, Math.floor(full.length * 0.55)));
  await page.setInputFiles('input[type=file]', broken);
  await result().getByText(/Repaired: \d+ records recovered/).waitFor();
  const text1 = await result().innerText();
  check(/The file ends in the middle of a record|cut short/.test(text1), 'repair: explains what was wrong');
  check(text1.includes('Rebuilt the missing lap, session, activity messages'), 'repair: says what it rebuilt');
  check(await page.locator('[data-sport-row]').isVisible(), 'repair: asks for the lost activity type');
  await page.selectOption('#sport-repair', '2');
  await result().getByText('Cycling').waitFor();
  check((await result().locator('svg.trace path').count()) === 1, 'repair: draws the recovered route');
  const repaired = await save(() => result().locator('a[download]').click(), 'broken-repaired.fit');
  check(readFileSync(repaired).length > 1000, 'repair: repaired file downloads');
  if (shots) await page.screenshot({ path: join(shots, 'repair-desktop.png'), fullPage: true });

  // Repair: not a FIT file
  await page.setInputFiles('input[type=file]', gpxA);
  await page.locator('[data-error]').getByText('signature is missing').waitFor();
  check(await result().isHidden(), 'repair: error replaces the previous result');

  // Merge FIT
  await page.goto(`${BASE}/merge-fit-files/`);
  await page.setInputFiles('input[type=file]', [fitB, fitA]);
  check((await page.locator('.queue li').count()) === 2, 'merge: lists queued files');
  await page.click('[data-run]');
  await result().getByText('Joined 2 files into one activity').waitFor();
  const mergeText = await result().innerText();
  check(mergeText.indexOf('part-a.fit') < mergeText.indexOf('part-b.fit'), 'merge: orders by start time');
  check(mergeText.includes('0:24:59'), 'merge: elapsed time spans both parts and the break');
  check(mergeText.includes('0:14:58'), 'merge: moving time is the sum of the parts');
  const joined = await save(() => result().locator('a[download]').click(), 'joined.fit');
  if (shots) await page.screenshot({ path: join(shots, 'merge-desktop.png'), fullPage: true });

  // Merge: mixed types and too few files
  await page.click('[data-clear]');
  await page.setInputFiles('input[type=file]', [fitA, gpxB]);
  await page.click('[data-run]');
  await page.locator('[data-error]').getByText('mix of FIT and GPX').waitFor();
  await page.locator('.queue li button').first().click();
  await page.click('[data-run]');
  await page.locator('[data-error]').getByText('at least two').waitFor();
  check(true, 'merge: clear errors for mixed types and a single file');

  // Merge GPX
  await page.click('[data-clear]');
  await page.setInputFiles('input[type=file]', [gpxB, gpxA]);
  await page.click('[data-run]');
  await result().getByText('Joined 2 files: 900 track points').waitFor();
  check(true, 'merge: joins GPX files');

  // FIT -> GPX on the joined file
  await page.goto(`${BASE}/fit-to-gpx/`);
  await page.setInputFiles('input[type=file]', joined);
  await result().getByText('Converted: 900 track points').waitFor();
  const outGpx = await save(() => result().locator('a[download]').click(), 'joined.gpx');
  const gpxText = readFileSync(outGpx, 'utf8');
  check((gpxText.match(/<trkpt /g) || []).length === 900 && gpxText.includes('<gpxtpx:hr>'), 'fit2gpx: GPX has every point and heart rate');

  // Keyboard: the file control is reachable and labelled.
  await page.goto(`${BASE}/repair-fit-file/`);
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.matches('input[type=file]') ?? false);
  }
  check(reached, 'a11y: file input reachable by keyboard');
  check((await page.locator('input[type=file]').evaluate((el) => el.labels?.[0]?.textContent?.trim())) === 'Choose a .fit file', 'a11y: file input has a label');

  // Every page: loads, one h1, title + description, no overflow at phone width, internal links resolve.
  const paths = ['/', '/repair-fit-file/', '/merge-fit-files/', '/fit-to-gpx/', '/gpx-to-fit/', '/guides/', '/guides/export-original-activity-files/', '/guides/combine-two-activities/', '/guides/why-fit-files-get-corrupted/', '/guides/fit-file-already-uploaded/', '/guides/fit-file-zero-bytes-or-empty/', '/guides/fit-file-wont-upload-to-strava/', '/about/', '/privacy/'];
  const links = new Set();
  await page.setViewportSize({ width: 360, height: 740 });
  for (const p of paths) {
    const res = await page.goto(BASE + p);
    const h1 = await page.locator('h1').count();
    const desc = await page.locator('meta[name=description]').getAttribute('content');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(res.status() === 200 && h1 === 1 && desc && desc.length > 40 && overflow <= 0, `page ${p}: 200, one h1, description, no overflow at 360px (overflow ${overflow})`);
    for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) links.add(href);
  }
  for (const href of links) {
    const res = await page.request.get(BASE + href);
    if (res.status() !== 200) check(false, `internal link ${href} -> ${res.status()}`);
  }
  check(true, `internal links checked: ${links.size}`);
  if (shots) {
    await page.goto(BASE + '/');
    await page.screenshot({ path: join(shots, 'home-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: join(shots, 'home-desktop.png'), fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(BASE + '/merge-fit-files/');
    await page.screenshot({ path: join(shots, 'merge-dark.png'), fullPage: true });
  }

  check(consoleErrors.length === 0, `no console errors ${consoleErrors.join(' | ')}`);
  check(offsite.length === 0, `no requests left the site's origin ${offsite.join(' | ')}`);
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
