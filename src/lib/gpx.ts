/**
 * GPX reading and writing, plus the conversions between GPX and FIT.
 *
 * The reader is a small pattern-based extractor rather than a DOM parser so that it behaves identically in the
 * browser and in tests, and so that slightly malformed exports still yield their track points.
 */
import { decodeFit, FIT_EPOCH_OFFSET, FitError, haversine, scanFit, summarize, type TrackPoint } from './fit/core';
import { BT, FitWriter, toSemicircles, writeActivity, writeFileId, writeLap, writeSession, writeTimerEvent } from './fit/writer';

export interface GpxTrack {
  name: string | null;
  points: TrackPoint[];
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
};

function tag(inner: string, name: string): string | undefined {
  // Matches <name>, <ns:name> and tolerates attributes.
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</`, 'i').exec(inner);
  return m ? m[1] : undefined;
}

export function parseGpx(text: string): GpxTrack {
  if (!/<gpx[\s>]/i.test(text)) {
    throw new FitError('not-gpx', 'This does not look like a GPX file: the <gpx> element is missing.');
  }
  const points: TrackPoint[] = [];
  const collect = (element: 'trkpt' | 'rtept') => {
    const re = new RegExp(`<${element}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${element}>)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const lat = num(/\blat\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1]);
      const lon = num(/\blon\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1]);
      if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const inner = m[2] ?? '';
      const pt: TrackPoint = { time: null, lat, lon };
      const t = tag(inner, 'time');
      if (t) {
        const ms = Date.parse(t);
        if (Number.isFinite(ms)) pt.time = Math.round(ms / 1000) - FIT_EPOCH_OFFSET;
      }
      const ele = num(tag(inner, 'ele'));
      if (ele !== undefined) pt.ele = ele;
      const hr = num(tag(inner, 'hr'));
      if (hr !== undefined) pt.hr = hr;
      const cad = num(tag(inner, 'cad') ?? tag(inner, 'cadence'));
      if (cad !== undefined) pt.cad = cad;
      const temp = num(tag(inner, 'atemp'));
      if (temp !== undefined) pt.temp = temp;
      const power = num(tag(inner, 'power') ?? tag(inner, 'PowerInWatts'));
      if (power !== undefined) pt.power = power;
      points.push(pt);
    }
  };
  collect('trkpt');
  if (points.length === 0) collect('rtept');

  const head = text.slice(0, text.search(/<(?:trkseg|trkpt|rtept)\b/i) >>> 0 || text.length);
  const trk = /<(?:trk|rte)\b[\s\S]*$/i.exec(head)?.[0];
  const name = (trk && tag(trk, 'name')) || tag(head, 'name') || null;
  return { name: name ? unescapeXml(name) : null, points };
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const iso = (fitTime: number): string => new Date((fitTime + FIT_EPOCH_OFFSET) * 1000).toISOString().replace('.000Z', 'Z');

export function writeGpx(points: TrackPoint[], opts: { name?: string | null; creator?: string } = {}): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(opts.creator ?? 'Trackmend')}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
  ];
  const first = points.find((p) => p.time !== null);
  if (first) lines.push(` <metadata><time>${iso(first.time as number)}</time></metadata>`);
  lines.push(' <trk>');
  if (opts.name) lines.push(`  <name>${escapeXml(opts.name)}</name>`);
  lines.push('  <trkseg>');
  for (const p of points) {
    if (p.lat === undefined || p.lon === undefined) continue;
    let s = `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`;
    if (p.ele !== undefined) s += `<ele>${p.ele.toFixed(1)}</ele>`;
    if (p.time !== null) s += `<time>${iso(p.time)}</time>`;
    const ext: string[] = [];
    if (p.power !== undefined) ext.push(`<power>${Math.round(p.power)}</power>`);
    const tpx: string[] = [];
    if (p.temp !== undefined) tpx.push(`<gpxtpx:atemp>${p.temp}</gpxtpx:atemp>`);
    if (p.hr !== undefined) tpx.push(`<gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr>`);
    if (p.cad !== undefined) tpx.push(`<gpxtpx:cad>${Math.round(p.cad)}</gpxtpx:cad>`);
    if (tpx.length) ext.push(`<gpxtpx:TrackPointExtension>${tpx.join('')}</gpxtpx:TrackPointExtension>`);
    if (ext.length) s += `<extensions>${ext.join('')}</extensions>`;
    lines.push(s + '</trkpt>');
  }
  lines.push('  </trkseg>', ' </trk>', '</gpx>', '');
  return lines.join('\n');
}

export interface GpxMergeReport {
  order: number[];
  points: number;
  /** True when at least one file had no timestamps and files were kept in the order given. */
  keptInputOrder: boolean;
}

/** Join GPX tracks into one track. Files are ordered by start time when every file has timestamps. */
export function mergeGpx(texts: string[]): { output: string; report: GpxMergeReport } {
  if (texts.length < 2) throw new FitError('too-few-files', 'Add at least two files to join.');
  const tracks = texts.map((t, index) => {
    const track = parseGpx(t);
    if (track.points.length === 0) {
      throw new FitError('no-positions', `File ${index + 1} contains no track points.`);
    }
    return { ...track, index, start: track.points.find((p) => p.time !== null)?.time ?? null };
  });
  const allTimed = tracks.every((t) => t.start !== null);
  if (allTimed) tracks.sort((a, b) => (a.start as number) - (b.start as number));
  const points = tracks.flatMap((t) => t.points);
  return {
    output: writeGpx(points, { name: tracks[0].name }),
    report: { order: tracks.map((t) => t.index), points: points.length, keptInputOrder: !allTimed },
  };
}

export function fitToGpx(bytes: Uint8Array, name?: string): { output: string; points: number; skipped: number } {
  const scan = scanFit(bytes);
  const decoded = decodeFit(bytes, scan);
  const located = decoded.points.filter((p) => p.lat !== undefined);
  if (located.length === 0) {
    throw new FitError(
      'no-positions',
      'This activity has no GPS positions (an indoor workout, for example), so there is no track to write to GPX.',
    );
  }
  return {
    output: writeGpx(located, { name }),
    points: located.length,
    skipped: decoded.points.length - located.length,
  };
}

/** Build a FIT activity from a GPX track. The track must carry timestamps. */
export function gpxToFit(text: string, sport = 0): { output: Uint8Array; points: number; distance: number } {
  const track = parseGpx(text);
  const pts = track.points.filter((p) => p.time !== null);
  if (track.points.length === 0) throw new FitError('no-positions', 'The GPX file contains no track points.');
  if (pts.length === 0) {
    throw new FitError(
      'no-timestamps',
      'This GPX file has positions but no timestamps (a planned route rather than a recorded activity). A FIT activity needs a time for every point.',
    );
  }
  pts.sort((a, b) => (a.time as number) - (b.time as number));

  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) dist += haversine(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!);
    pts[i].dist = dist;
  }
  const summary = summarize(pts)!;

  const w = new FitWriter();
  writeFileId(w, summary.startTime);
  writeTimerEvent(w, summary.startTime, 'start');
  w.define(1, 20, [
    [253, BT.uint32],
    [0, BT.sint32],
    [1, BT.sint32],
    [2, BT.uint16],
    [3, BT.uint8],
    [4, BT.uint8],
    [5, BT.uint32],
    [7, BT.uint16],
    [13, BT.sint8],
  ]);
  for (const p of pts) {
    w.write(1, [
      p.time,
      toSemicircles(p.lat),
      toSemicircles(p.lon),
      p.ele === undefined ? null : (p.ele + 500) * 5,
      p.hr,
      p.cad,
      p.dist! * 100,
      p.power,
      p.temp,
    ]);
  }
  writeTimerEvent(w, summary.endTime, 'stop');
  writeLap(w, summary, 0, sport);
  writeSession(w, summary, 1, { sport, subSport: 0 });
  writeActivity(w, summary.endTime, summary.timer);
  return { output: w.toFile(), points: pts.length, distance: dist };
}
