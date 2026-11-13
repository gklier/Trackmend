/**
 * Batch page: run one operation over many files and hand back a zip. Free for a few files per run; a licence
 * lifts the limit. Everything, including the zip, is built in the browser.
 */
import { site } from '../config';
import { FitError } from '../lib/fit/core';
import { repairFit } from '../lib/fit/ops';
import { fitToGpx, gpxToFit } from '../lib/gpx';
import { normalizeKey, validateLicense } from '../lib/license';
import { writeZip, type ZipEntry } from '../lib/zip';

export const FREE_LIMIT = 3;
const STORAGE_KEY = 'trackmend.license';

type Op = 'repair' | 'fit2gpx' | 'gpx2fit';

const baseName = (n: string): string => n.replace(/\.[^.]+$/, '') || 'activity';
const fmt = (n: number): string => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}

function readStoredKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
function storeKey(key: string): void {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the key still works for this page load */
  }
}

async function processOne(file: File, op: Op, sport: number): Promise<{ entry?: ZipEntry; note: string; ok: boolean }> {
  try {
    if (op === 'repair') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { output, report } = repairFit(bytes, { sport });
      if (report.alreadyValid) return { entry: { name: file.name, data: output }, note: 'Not damaged; copied through unchanged.', ok: true };
      const n = report.summary?.pointCount ?? 0;
      return { entry: { name: `${baseName(file.name)}-repaired.fit`, data: output }, note: `Repaired: ${n.toLocaleString()} records kept${report.added.length ? `, rebuilt ${report.added.join(', ')}` : ''}.`, ok: true };
    }
    if (op === 'fit2gpx') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { output, points } = fitToGpx(bytes, baseName(file.name));
      return { entry: { name: `${baseName(file.name)}.gpx`, data: new TextEncoder().encode(output) }, note: `${points.toLocaleString()} track points.`, ok: true };
    }
    const text = await file.text();
    const { output, points } = gpxToFit(text, sport);
    return { entry: { name: `${baseName(file.name)}.fit`, data: output }, note: `${points.toLocaleString()} records.`, ok: true };
  } catch (e) {
    return { note: e instanceof FitError ? e.message : 'Could not be read.', ok: false };
  }
}

export function initBatch(): void {
  const root = document.querySelector<HTMLElement>('[data-batch]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const input = root.querySelector<HTMLInputElement>('input[type=file]')!;
  const drop = root.querySelector<HTMLElement>('[data-drop]')!;
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const run = root.querySelector<HTMLButtonElement>('[data-run]')!;
  const clear = root.querySelector<HTMLButtonElement>('[data-clear]')!;
  const opSel = root.querySelector<HTMLSelectElement>('[data-op]')!;
  const sportSel = root.querySelector<HTMLSelectElement>('[data-sport]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const result = root.querySelector<HTMLElement>('[data-result]')!;
  const limitNote = root.querySelector<HTMLElement>('[data-limit]')!;
  const keyForm = root.querySelector<HTMLFormElement>('[data-key-form]');
  const keyInput = root.querySelector<HTMLInputElement>('[data-key]');
  const keyStatus = root.querySelector<HTMLElement>('[data-key-status]');
  const keyForget = root.querySelector<HTMLButtonElement>('[data-key-forget]');

  let files: File[] = [];
  let licensed = false;
  let lastUrl: string | null = null;
  const productId = site.lsProductId;

  const setKeyStatus = (text: string, cls: 'ok' | 'bad' | '') => {
    if (!keyStatus) return;
    keyStatus.textContent = text;
    keyStatus.className = `key-status ${cls}`;
    keyStatus.hidden = !text;
  };

  const refresh = () => {
    list.replaceChildren(
      ...files.map((f, i) => {
        const rm = el('button', { type: 'button', 'aria-label': `Remove ${f.name}` }, 'Remove');
        rm.addEventListener('click', () => {
          files.splice(i, 1);
          refresh();
        });
        return el('li', {}, el('span', { class: 'name' }, f.name), el('span', { class: 'size' }, fmt(f.size)), rm);
      }),
    );
    const over = !licensed && files.length > FREE_LIMIT;
    limitNote.hidden = !over;
    run.disabled = files.length === 0 || over;
    run.textContent = files.length > 1 ? `Process ${files.length} files` : 'Process file';
    if (keyForget) keyForget.hidden = !licensed;
  };

  const accept = (incoming: FileList | File[] | null) => {
    const add = Array.from(incoming ?? []).filter((f) => /\.(fit|gpx)$/i.test(f.name));
    files.push(...add);
    result.hidden = true;
    refresh();
  };

  input.addEventListener('change', () => {
    accept(input.files);
    input.value = '';
  });
  for (const t of ['dragenter', 'dragover'] as const) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const t of ['dragleave', 'drop'] as const) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => accept(e.dataTransfer?.files ?? null));
  clear.addEventListener('click', () => { files = []; result.hidden = true; refresh(); });

  const applyKey = async (key: string, quiet = false) => {
    if (!productId || !key) return;
    if (!quiet) setKeyStatus('Checking…', '');
    const check = await validateLicense(key, productId);
    licensed = check.valid;
    if (check.valid) {
      storeKey(normalizeKey(key));
      setKeyStatus('Licence active on this browser. No file limit.', 'ok');
    } else {
      storeKey('');
      if (!quiet) setKeyStatus(check.reason ?? 'This key is not valid.', 'bad');
    }
    refresh();
  };
  keyForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    void applyKey(keyInput?.value ?? '');
  });
  keyForget?.addEventListener('click', () => {
    storeKey('');
    licensed = false;
    if (keyInput) keyInput.value = '';
    setKeyStatus('', '');
    refresh();
  });
  const stored = readStoredKey();
  if (stored && keyInput) {
    keyInput.value = stored;
    void applyKey(stored, true);
  }

  run.addEventListener('click', async () => {
    const op = opSel.value as Op;
    const sport = Number(sportSel.value);
    run.disabled = true;
    status.hidden = false;
    const entries: ZipEntry[] = [];
    const rows: HTMLElement[] = [];
    let okCount = 0;
    for (let i = 0; i < files.length; i++) {
      status.textContent = `Processing ${i + 1} of ${files.length}: ${files[i].name}`;
      const r = await processOne(files[i], op, sport);
      if (r.entry) entries.push(r.entry);
      if (r.ok) okCount++;
      rows.push(el('tr', { class: r.ok ? '' : 'bad' }, el('td', {}, files[i].name), el('td', {}, r.note)));
      await new Promise((res) => setTimeout(res, 0)); // let the status repaint
    }
    status.hidden = true;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    const table = el('table', { class: 'batch-table' }, el('thead', {}, el('tr', {}, el('th', {}, 'File'), el('th', {}, 'Result'))), el('tbody', {}, ...rows));
    const nodes: (Node | string)[] = [el('h3', { class: okCount ? 'status-ok' : 'status-warn' }, `${okCount} of ${files.length} processed`), table];
    if (entries.length) {
      const zip = writeZip(entries);
      const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
      lastUrl = URL.createObjectURL(blob);
      const name = `trackmend-${op === 'repair' ? 'repaired' : op === 'fit2gpx' ? 'gpx' : 'fit'}.zip`;
      nodes.push(el('p', {}, el('a', { class: 'primary', href: lastUrl, download: name }, `Download ${name} (${fmt(blob.size)})`)));
    }
    result.replaceChildren(...nodes);
    result.hidden = false;
    refresh();
  });

  refresh();
}
