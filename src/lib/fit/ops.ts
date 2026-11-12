/**
 * The two FIT operations the site offers: repair a damaged activity, and join consecutive activities.
 * Both keep the device's original records byte-for-byte wherever possible and only add or patch what is needed.
 */
import {
  decodeFit,
  FitError,
  MESG,
  scanFit,
  summarize,
  type DecodedFit,
  type ScanIssue,
  type ScanResult,
  type Summary,
} from './core';
import { FitWriter, writeActivity, writeFileId, writeLap, writeSession } from './writer';

export interface RepairReport {
  /** True when the input was already a well-formed activity and the output is byte-equivalent in content. */
  alreadyValid: boolean;
  issues: ScanIssue[];
  /** Messages that had to be created: 'file_id' | 'lap' | 'session' | 'activity'. */
  added: string[];
  bytesDropped: number;
  messagesKept: number;
  summary: Summary | null;
  sport: number | null;
  /** True when the sport was not stored in the file and the caller did not supply one. */
  sportUnknown: boolean;
}

export interface RepairOptions {
  /** FIT sport enum to use when the file does not say (1 run, 2 ride, 5 swim, 11 walk, 17 hike, 0 generic). */
  sport?: number;
}

export function repairFit(bytes: Uint8Array, opts: RepairOptions = {}): { output: Uint8Array; report: RepairReport } {
  const scan = scanFit(bytes);
  const decoded = decodeFit(bytes, scan);
  const dataMessages = scan.records.filter((r) => r.kind === 'data').length;
  if (dataMessages === 0) {
    throw new FitError(
      'nothing-recoverable',
      'The file header is present but no readable records follow it, so there is nothing to recover.',
    );
  }

  const summary = summarize(decoded.points, decoded.timerStops);
  const isActivity = decoded.fileType === null || decoded.fileType === 4;
  const sport = decoded.sport ?? opts.sport ?? null;
  const added: string[] = [];
  const w = new FitWriter();

  if (decoded.fileIdCount === 0) {
    writeFileId(w, summary?.startTime ?? 0);
    added.push('file_id');
  }
  w.raw(bytes.subarray(scan.dataStart, scan.dataEnd));

  if (isActivity && summary) {
    const existing = decoded.sessions[0];
    if (decoded.lapCount === 0) {
      writeLap(w, summary, 0, sport);
      added.push('lap');
    }
    if (decoded.sessions.length === 0) {
      writeSession(w, summary, Math.max(1, decoded.lapCount), { sport, subSport: decoded.subSport });
      added.push('session');
    }
    if (decoded.activityCount === 0) {
      writeActivity(w, summary.endTime, existing?.timer ?? summary.timer);
      added.push('activity');
    }
  }

  const output = w.toFile(scan.protocolVersion || 0x10, scan.profileVersion || 2132);
  return {
    output,
    report: {
      alreadyValid: scan.issues.length === 0 && scan.crcOk === true && added.length === 0,
      issues: scan.issues,
      added,
      bytesDropped: Math.max(0, bytes.length - scan.dataEnd - (scan.crcOk === null ? 0 : 2)),
      messagesKept: dataMessages,
      summary,
      sport,
      sportUnknown: decoded.sport === null && opts.sport === undefined,
    },
  };
}

interface Part {
  bytes: Uint8Array;
  scan: ScanResult;
  decoded: DecodedFit;
  summary: Summary;
  index: number;
}

export interface MergeReport {
  /** Input indexes in the order they were joined (chronological). */
  order: number[];
  /** Seconds between the end of each part and the start of the next. */
  gaps: number[];
  summary: Summary;
  sport: number | null;
  laps: number;
  /** True when Connect IQ / developer fields had to be removed from later files. */
  developerDataDropped: boolean;
}

/** Copy one file's records into the writer, dropping and patching what a joined file needs changed. */
function emitPart(
  w: FitWriter,
  part: Part,
  o: { drop: Set<number>; distanceOffset: number; lapIndexOffset: number; stripDeveloper: boolean },
): void {
  const src = part.bytes;
  for (const rec of part.scan.records) {
    if (rec.kind === 'definition') {
      const hasDev = (src[rec.offset] & 0x20) !== 0;
      if (o.stripDeveloper && hasDev) {
        // Re-emit the definition without its developer-field section.
        const plain = src.slice(rec.offset, rec.offset + 6 + rec.def.fields.length * 3);
        plain[0] &= ~0x20;
        w.raw(plain);
      } else {
        w.raw(src.subarray(rec.offset, rec.offset + rec.length));
      }
      continue;
    }
    if (o.drop.has(rec.global)) continue;
    const keep = o.stripDeveloper ? 1 + rec.def.fieldsSize : rec.length;
    const copy = src.slice(rec.offset, rec.offset + keep);
    const view = new DataView(copy.buffer);
    const le = rec.def.littleEndian;
    if (rec.global === MESG.record && o.distanceOffset > 0) {
      const f = rec.def.fields.find((x) => x.num === 5 && x.size === 4);
      if (f) {
        const v = view.getUint32(1 + f.offset, le);
        if (v !== 0xffffffff) {
          view.setUint32(1 + f.offset, Math.min(0xfffffffe, v + Math.round(o.distanceOffset * 100)), le);
        }
      }
    } else if (rec.global === MESG.lap && o.lapIndexOffset > 0) {
      const f = rec.def.fields.find((x) => x.num === 254 && x.size === 2);
      if (f) {
        const v = view.getUint16(1 + f.offset, le);
        if (v !== 0xffff) view.setUint16(1 + f.offset, v + o.lapIndexOffset, le);
      }
    }
    w.raw(copy);
  }
}

const sumOrNull = (values: (number | null | undefined)[]): number | null =>
  values.every((v) => v !== null && v !== undefined) ? (values as number[]).reduce((a, b) => a + b, 0) : null;

/**
 * Join activities that were recorded one after another (a split ride, a watch restarted mid-run).
 * Parts are ordered by start time. Activities that overlap in time are refused: combining two devices'
 * recordings of the same effort is a different operation and is not supported here.
 */
export function mergeFit(files: Uint8Array[]): { output: Uint8Array; report: MergeReport } {
  if (files.length < 2) throw new FitError('too-few-files', 'Add at least two files to join.');

  const parts: Part[] = files.map((bytes, index) => {
    const scan = scanFit(bytes);
    const decoded = decodeFit(bytes, scan);
    const summary = summarize(decoded.points, decoded.timerStops);
    if (!summary) {
      throw new FitError('no-timestamps', `File ${index + 1} has no timestamped records, so it cannot be placed in order.`);
    }
    return { bytes, scan, decoded, summary, index };
  });
  parts.sort((a, b) => a.summary.startTime - b.summary.startTime);

  const gaps: number[] = [];
  for (let i = 1; i < parts.length; i++) {
    const gap = parts[i].summary.startTime - parts[i - 1].summary.endTime;
    if (gap < 0) {
      throw new FitError(
        'overlap',
        `Files ${parts[i - 1].index + 1} and ${parts[i].index + 1} overlap in time. This tool joins activities recorded one after another; it does not blend two recordings of the same activity.`,
      );
    }
    gaps.push(gap);
  }

  const sport = parts.find((p) => p.decoded.sport !== null)?.decoded.sport ?? null;
  const subSport = parts.find((p) => p.decoded.subSport !== null)?.decoded.subSport ?? null;
  const w = new FitWriter();
  let distanceOffset = 0;
  let laps = 0;
  let timer = 0;
  let developerDataDropped = false;

  parts.forEach((part, i) => {
    const first = i === 0;
    const drop = new Set<number>([MESG.session, MESG.activity]);
    if (!first) {
      drop.add(MESG.fileId);
      drop.add(MESG.fileCreator);
      drop.add(MESG.developerDataId);
      drop.add(MESG.fieldDescription);
      if (part.decoded.hasDeveloperData) developerDataDropped = true;
    }
    if (part.decoded.fileIdCount === 0 && first) writeFileId(w, part.summary.startTime);
    emitPart(w, part, { drop, distanceOffset, lapIndexOffset: laps, stripDeveloper: !first });

    if (part.decoded.lapCount === 0) {
      // Lap distance is per-lap, so it is not offset.
      writeLap(w, part.summary, laps, part.decoded.sport ?? sport);
      laps += 1;
    } else {
      laps += part.decoded.lapCount;
    }
    distanceOffset += part.summary.distance;
    timer += part.decoded.sessions[0]?.timer ?? part.summary.timer;
  });

  // Statistics over every point; totals from the per-part figures so stopped time between parts is excluded.
  const allPoints = parts.flatMap((p) => p.decoded.points);
  const combined = summarize(allPoints) as Summary;
  combined.distance = distanceOffset;
  combined.timer = timer;
  combined.avgSpeed = timer > 0 && distanceOffset > 0 ? distanceOffset / timer : null;

  writeSession(w, combined, laps, {
    sport,
    subSport,
    calories: sumOrNull(parts.map((p) => p.decoded.sessions[0]?.calories)),
    ascent: sumOrNull(parts.map((p) => p.decoded.sessions[0]?.ascent)),
  });
  writeActivity(w, combined.endTime, timer);

  const head = parts[0].scan;
  return {
    output: w.toFile(head.protocolVersion || 0x10, head.profileVersion || 2132),
    report: { order: parts.map((p) => p.index), gaps, summary: combined, sport, laps, developerDataDropped },
  };
}
