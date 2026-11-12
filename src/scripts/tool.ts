/**
 * Browser glue for the four tools. All work happens in this tab: files are read with the File API,
 * processed by the library in src/lib, and handed back as a Blob download. Nothing is sent anywhere.
 */
import { decodeFit, FIT_EPOCH_OFFSET, FitError, scanFit, summarize, type Summary, type TrackPoint } from '../lib/fit/core';
import { mergeFit, repairFit } from '../lib/fit/ops';
import { fitToGpx, gpxToFit, mergeGpx, parseGpx } from '../lib/gpx';

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SPORTS: Record<number, string> = {
  0: 'Other',
  1: 'Running',
  2: 'Cycling',
  5: 'Swimming',
  11: 'Walking',
  17: 'Hiking',
};
const sportName = (n: number | null): string => (n === null ? 'Not stored' : (SPORTS[n] ?? `Sport #${n}`));

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const formatBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const formatDate = (fitTime: number): string =>
  new Date((fitTime + FIT_EPOCH_OFFSET) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function describeGap(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

const baseName = (name: string): string => name.replace(/\.[^.]+$/, '') || 'activity';

function stat(label: string, value: string, small?: string): HTMLElement {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value, small ? h('small', {}, ` ${small}`) : null));
}

function readout(s: Summary, sport: number | null | undefined): HTMLElement {
  const dl = h('dl', { class: 'readout' });
  if (sport !== undefined) dl.append(stat('Activity type', sportName(sport)));
  dl.append(stat('Start', formatDate(s.startTime)));
  dl.append(stat('Elapsed', formatDuration(s.elapsed)));
  if (Math.abs(s.timer - s.elapsed) >= 1) dl.append(stat('Moving time', formatDuration(s.timer)));
  if (s.distance > 0) dl.append(stat('Distance', `${(s.distance / 1000).toFixed(2)} km`, `${(s.distance / 1609.344).toFixed(2)} mi`));
  if (s.avgHr !== null) dl.append(stat('Avg heart rate', `${s.avgHr}`, 'bpm'));
  dl.append(stat('Records', s.pointCount.toLocaleString()));
  return dl;
}

const SVG = 'http://www.w3.org/2000/svg';

/** Outline of the recorded track, drawn from the file's own positions. Returns null when there are none. */
function trace(points: TrackPoint[]): SVGSVGElement | null {
  const located = points.filter((p) => p.lat !== undefined && p.lon !== undefined);
  if (located.length < 2) return null;
  const step = Math.max(1, Math.floor(located.length / 800));
  const sampled = located.filter((_, i) => i % step === 0 || i === located.length - 1);
  const meanLat = sampled.reduce((a, p) => a + p.lat!, 0) / sampled.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const xs = sampled.map((p) => p.lon! * kx);
  const ys = sampled.map((p) => -p.lat!);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1e-9;
  const spanY = Math.max(...ys) - minY || 1e-9;
  const W = 320;
  const H = 180;
  const pad = 14;
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const px = (i: number) => (ox + (xs[i] - minX) * scale).toFixed(1);
  const py = (i: number) => (oy + (ys[i] - minY) * scale).toFixed(1);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'trace');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Outline of the recorded route');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', sampled.map((_, i) => `${i ? 'L' : 'M'}${px(i)} ${py(i)}`).join(''));
  svg.append(path);
  const dot = (i: number, cls: string) => {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', px(i));
    c.setAttribute('cy', py(i));
    c.setAttribute('r', '4');
    c.setAttribute('class', cls);
    svg.append(c);
  };
  dot(0, 'start');
  dot(sampled.length - 1, 'end');
  return svg;
}

function traceBlock(points: TrackPoint[]): Child[] {
  const svg = trace(points);
  return svg ? [svg, h('p', { class: 'trace-caption' }, 'Route as stored in the file. Filled dot: start. Ring: end.')] : [];
}

function downloadLink(data: Uint8Array | string, filename: string, mime: string): HTMLAnchorElement {
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = h('a', { class: 'primary', href: URL.createObjectURL(blob), download: filename }, `Download ${filename}`);
  a.append(h('small', {}, ` (${formatBytes(blob.size)})`));
  return a;
}

const isFit = (bytes: Uint8Array): boolean => {
  const limit = Math.min(bytes.length - 4, 4096);
  for (let i = 8; i <= limit; i++) {
    if (bytes[i] === 0x2e && bytes[i + 1] === 0x46 && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x54) return true;
  }
  return false;
};

function explain(err: unknown): string {
  if (err instanceof FitError) return err.message;
  console.error(err);
  return 'Something unexpected went wrong while reading this file. The file was not changed. If it keeps happening, the file may use a variant this tool does not handle yet.';
}

function setup(root: HTMLElement): void {
  const tool = root.dataset.tool as 'repair' | 'merge' | 'fit2gpx' | 'gpx2fit';
  const input = root.querySelector<HTMLInputElement>('input[type=file]')!;
  const drop = root.querySelector<HTMLElement>('[data-drop]')!;
  const errorEl = root.querySelector<HTMLElement>('[data-error]')!;
  const resultEl = root.querySelector<HTMLElement>('[data-result]')!;
  const sportSelect = root.querySelector<HTMLSelectElement>('[data-sport]');
  const sportRow = root.querySelector<HTMLElement>('[data-sport-row]');
  const queueEl = root.querySelector<HTMLElement>('[data-queue]');
  const queueList = root.querySelector<HTMLElement>('[data-queue-list]');

  let current: File | null = null;
  let queue: File[] = [];
  let lastUrl: string | null = null;

  const showError = (msg: string) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    resultEl.hidden = true;
  };
  const showResult = (...nodes: Child[]) => {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    errorEl.hidden = true;
    resultEl.replaceChildren(...nodes.filter((n): n is Node | string => Boolean(n)));
    resultEl.hidden = false;
    lastUrl = resultEl.querySelector<HTMLAnchorElement>('a[download]')?.href ?? null;
  };

  async function runSingle(file: File): Promise<void> {
    current = file;
    try {
      if (tool === 'repair') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const askSport = sportRow !== null && !sportRow.hidden;
        const { output, report } = repairFit(bytes, askSport ? { sport: Number(sportSelect!.value) } : {});
        const needsSport = report.added.includes('session') && (report.sportUnknown || askSport);
        if (sportRow) sportRow.hidden = !needsSport;

        if (report.alreadyValid) {
          const decoded = decodeFit(output, scanFit(output));
          showResult(
            h('h3', { class: 'status-ok' }, 'This file is not damaged'),
            h('p', { class: 'source' }, file.name),
            h(
              'p',
              {},
              'Its structure and checksum are correct and its summary is complete, so there is nothing to repair. If a platform still rejects it, the cause is something other than file damage, for example a duplicate of an activity that already exists there.',
            ),
            report.summary ? readout(report.summary, report.sport) : null,
            ...traceBlock(decoded.points),
          );
          return;
        }

        const decoded = decodeFit(output, scanFit(output));
        const findings = h('ul', { class: 'findings' });
        for (const issue of report.issues) findings.append(h('li', {}, issue.message));
        if (report.added.length) {
          const names = report.added.map((a) => a.replace('_', ' ')).join(', ');
          findings.append(h('li', {}, `Rebuilt the missing ${names} ${report.added.length > 1 ? 'messages' : 'message'} from the records that survived.`));
        }
        if (report.bytesDropped > 0) {
          findings.append(h('li', {}, `${formatBytes(report.bytesDropped)} after the damaged point could not be read and is not in the repaired file.`));
        }
        findings.append(h('li', {}, 'Wrote a correct header size and checksum.'));
        const out = `${baseName(file.name)}-repaired.fit`;
        showResult(
          h('h3', { class: 'status-ok' }, report.summary ? `Repaired: ${report.summary.pointCount.toLocaleString()} records recovered` : 'Repaired'),
          h('p', { class: 'source' }, file.name),
          findings,
          report.summary ? readout(report.summary, report.sport) : null,
          report.summary ? h('p', {}, `The recording now ends at ${formatDate(report.summary.endTime)}. Check that against what you remember before uploading.`) : null,
          ...traceBlock(decoded.points),
          h('p', {}, downloadLink(output, out, 'application/octet-stream')),
        );
      } else if (tool === 'fit2gpx') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { output, points, skipped } = fitToGpx(bytes, baseName(file.name));
        const decoded = decodeFit(bytes, scanFit(bytes));
        const summary = summarize(decoded.points, decoded.timerStops);
        showResult(
          h('h3', { class: 'status-ok' }, `Converted: ${points.toLocaleString()} track points`),
          h('p', { class: 'source' }, file.name),
          skipped > 0 ? h('p', {}, `${skipped.toLocaleString()} records had no GPS position and are not in the GPX, because GPX cannot store a point without one.`) : null,
          summary ? readout(summary, decoded.sport) : null,
          ...traceBlock(decoded.points),
          h('p', {}, downloadLink(output, `${baseName(file.name)}.gpx`, 'application/gpx+xml')),
        );
      } else if (tool === 'gpx2fit') {
        const text = await file.text();
        const sport = Number(sportSelect?.value ?? 0);
        const { output, points } = gpxToFit(text, sport);
        const decoded = decodeFit(output, scanFit(output));
        const summary = summarize(decoded.points);
        showResult(
          h('h3', { class: 'status-ok' }, `Converted: ${points.toLocaleString()} records`),
          h('p', { class: 'source' }, file.name),
          h('p', {}, 'Distance was calculated from the GPS positions, since GPX does not store it.'),
          summary ? readout(summary, sport) : null,
          ...traceBlock(decoded.points),
          h('p', {}, downloadLink(output, `${baseName(file.name)}.fit`, 'application/octet-stream')),
        );
      }
    } catch (err) {
      showError(explain(err));
    }
  }

  function renderQueue(): void {
    if (!queueEl || !queueList) return;
    queueEl.hidden = queue.length === 0;
    queueList.replaceChildren(
      ...queue.map((f, i) => {
        const remove = h('button', { type: 'button', 'aria-label': `Remove ${f.name}` }, 'Remove');
        remove.addEventListener('click', () => {
          queue.splice(i, 1);
          renderQueue();
        });
        return h('li', {}, h('span', { class: 'name' }, f.name), h('span', { class: 'size' }, formatBytes(f.size)), remove);
      }),
    );
  }

  async function runMerge(): Promise<void> {
    try {
      if (queue.length < 2) throw new FitError('too-few-files', 'Add at least two files to join.');
      const buffers = await Promise.all(queue.map(async (f) => new Uint8Array(await f.arrayBuffer())));
      const kinds = buffers.map(isFit);
      if (kinds.some((k) => k !== kinds[0])) {
        throw new FitError('not-fit', 'These files are a mix of FIT and GPX. Join files of one type, or convert them first so they match.');
      }
      const first = baseName(queue[0].name);
      if (kinds[0]) {
        const { output, report } = mergeFit(buffers);
        const decoded = decodeFit(output, scanFit(output));
        const order = h('ol', { class: 'findings' });
        report.order.forEach((idx, i) => {
          const gap = i > 0 ? ` (starts ${describeGap(report.gaps[i - 1])} after the previous part ends)` : '';
          order.append(h('li', {}, `${queue[idx].name}${gap}`));
        });
        showResult(
          h('h3', { class: 'status-ok' }, `Joined ${queue.length} files into one activity`),
          h('p', {}, 'Order used, by recorded start time:'),
          order,
          report.developerDataDropped ? h('p', {}, 'Connect IQ app fields from the later files were left out, because their definitions cannot be carried across files safely. Standard data is unaffected.') : null,
          readout(report.summary, report.sport),
          h('p', {}, `Laps: ${report.laps}. Moving time is the sum of the parts; elapsed time includes the breaks between them.`),
          ...traceBlock(decoded.points),
          h('p', {}, downloadLink(output, `${first}-joined.fit`, 'application/octet-stream')),
        );
      } else {
        const texts = buffers.map((b) => new TextDecoder().decode(b));
        const { output, report } = mergeGpx(texts);
        const parsed = parseGpx(output);
        const order = h('ol', { class: 'findings' });
        report.order.forEach((idx) => order.append(h('li', {}, queue[idx].name)));
        showResult(
          h('h3', { class: 'status-ok' }, `Joined ${queue.length} files: ${report.points.toLocaleString()} track points`),
          h('p', {}, report.keptInputOrder ? 'At least one file has no timestamps, so the files were kept in the order you added them:' : 'Order used, by recorded start time:'),
          order,
          ...traceBlock(parsed.points),
          h('p', {}, downloadLink(output, `${first}-joined.gpx`, 'application/gpx+xml')),
        );
      }
    } catch (err) {
      showError(explain(err));
    }
  }

  function accept(files: FileList | File[] | null): void {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    if (tool === 'merge') {
      queue.push(...list);
      errorEl.hidden = true;
      resultEl.hidden = true;
      renderQueue();
    } else {
      if (sportRow) sportRow.hidden = true;
      void runSingle(list[0]);
    }
  }

  input.addEventListener('change', () => {
    accept(input.files);
    input.value = '';
  });
  for (const type of ['dragenter', 'dragover'] as const) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
  }
  for (const type of ['dragleave', 'drop'] as const) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    });
  }
  drop.addEventListener('drop', (e) => accept(e.dataTransfer?.files ?? null));

  sportSelect?.addEventListener('change', () => {
    if (current) void runSingle(current);
  });
  root.querySelector('[data-run]')?.addEventListener('click', () => void runMerge());
  root.querySelector('[data-clear]')?.addEventListener('click', () => {
    queue = [];
    renderQueue();
    errorEl.hidden = true;
    resultEl.hidden = true;
  });
}

export function initTools(): void {
  document.querySelectorAll<HTMLElement>('.tool[data-tool]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    setup(root);
  });
}
