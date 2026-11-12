/**
 * Tolerant FIT reader.
 *
 * `scanFit` walks the record stream and stops at the first thing that cannot be a valid record, instead of
 * throwing. Everything before that point is reported as usable, which is what repair and merge build on.
 * `decodeFit` turns the scanned records into the small activity model the tools need.
 *
 * Written from the published FIT protocol description; no vendor SDK code is used.
 */

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
export const FIT_EPOCH_OFFSET = 631065600;

export const MESG = {
  fileId: 0,
  sport: 12,
  session: 18,
  lap: 19,
  record: 20,
  event: 21,
  activity: 34,
  fileCreator: 49,
  fieldDescription: 206,
  developerDataId: 207,
} as const;

export class FitError extends Error {
  constructor(
    public code:
      | 'not-fit'
      | 'nothing-recoverable'
      | 'no-timestamps'
      | 'no-positions'
      | 'overlap'
      | 'too-few-files'
      | 'not-gpx',
    message: string,
  ) {
    super(message);
    this.name = 'FitError';
  }
}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
];

/** FIT CRC-16 over bytes[start, end). */
export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let crc = seed;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc & 0xffff;
}

export interface FieldDef {
  num: number;
  size: number;
  baseType: number;
  /** Byte offset of this field inside the data message payload. */
  offset: number;
}

export interface MesgDef {
  local: number;
  global: number;
  littleEndian: boolean;
  fields: FieldDef[];
  fieldsSize: number;
  /** Total size of developer fields that follow the normal fields in each data message. */
  devSize: number;
}

export interface FitRecord {
  kind: 'definition' | 'data';
  offset: number;
  length: number;
  local: number;
  global: number;
  def: MesgDef;
  /** Set for compressed-timestamp data messages: the 5-bit time offset from the header. */
  compressedTime?: number;
}

export type IssueCode =
  | 'leading-garbage'
  | 'bad-data-size'
  | 'bad-crc'
  | 'missing-crc'
  | 'truncated-record'
  | 'corrupt-record'
  | 'trailing-data';

export interface ScanIssue {
  code: IssueCode;
  message: string;
  offset?: number;
}

export interface ScanResult {
  headerOffset: number;
  headerSize: number;
  protocolVersion: number;
  profileVersion: number;
  declaredDataSize: number;
  dataStart: number;
  /** End of the last record that parsed cleanly. */
  dataEnd: number;
  records: FitRecord[];
  issues: ScanIssue[];
  /** true/false when a CRC was present and checked, null when there was none to check. */
  crcOk: boolean | null;
}

function isSignature(bytes: Uint8Array, at: number): boolean {
  return bytes[at] === 0x2e && bytes[at + 1] === 0x46 && bytes[at + 2] === 0x49 && bytes[at + 3] === 0x54;
}

function findHeader(bytes: Uint8Array): number {
  if (bytes.length >= 12 && (bytes[0] === 12 || bytes[0] === 14) && isSignature(bytes, 8)) return 0;
  const limit = Math.min(bytes.length - 4, 4096);
  for (let i = 8; i <= limit; i++) {
    if (isSignature(bytes, i) && (bytes[i - 8] === 12 || bytes[i - 8] === 14)) return i - 8;
  }
  return -1;
}

export function scanFit(bytes: Uint8Array): ScanResult {
  const headerOffset = findHeader(bytes);
  if (headerOffset < 0) {
    throw new FitError('not-fit', 'This does not look like a FIT file: the ".FIT" signature is missing.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const issues: ScanIssue[] = [];
  if (headerOffset > 0) {
    issues.push({
      code: 'leading-garbage',
      message: `${headerOffset} bytes of unrelated data sit before the file header.`,
      offset: 0,
    });
  }

  const headerSize = bytes[headerOffset];
  const protocolVersion = bytes[headerOffset + 1];
  const profileVersion = view.getUint16(headerOffset + 2, true);
  const declaredDataSize = view.getUint32(headerOffset + 4, true);
  const dataStart = headerOffset + headerSize;

  let limit: number;
  let crcOk: boolean | null = null;
  const declaredEnd = dataStart + declaredDataSize;

  if (declaredDataSize > 0 && declaredEnd <= bytes.length) {
    limit = declaredEnd;
    if (declaredEnd + 2 <= bytes.length) {
      crcOk = fitCrc(bytes, headerOffset, declaredEnd) === view.getUint16(declaredEnd, true);
      if (!crcOk) issues.push({ code: 'bad-crc', message: 'The file checksum does not match its contents.' });
      if (declaredEnd + 2 < bytes.length) {
        issues.push({
          code: 'trailing-data',
          message: `${bytes.length - declaredEnd - 2} extra bytes follow the end of the activity and were ignored.`,
          offset: declaredEnd + 2,
        });
      }
    } else {
      issues.push({ code: 'missing-crc', message: 'The checksum at the end of the file is missing.' });
    }
  } else {
    issues.push({
      code: 'bad-data-size',
      message:
        declaredDataSize === 0
          ? 'The header says the file holds no data. The recording was probably never finalised.'
          : 'The header claims more data than the file contains. The file was cut short.',
    });
    limit = bytes.length;
    // A file with a wrong size but an intact trailing checksum: keep the checksum out of the record stream.
    if (bytes.length - 2 > dataStart) {
      const tail = bytes.length - 2;
      if (fitCrc(bytes, headerOffset, tail) === view.getUint16(tail, true)) {
        limit = tail;
        crcOk = true;
      }
    }
  }

  const records: FitRecord[] = [];
  const defs = new Map<number, MesgDef>();
  let p = dataStart;
  let fileIds = 0;
  let stop: ScanIssue | null = null;

  const truncated = (at: number): ScanIssue => ({
    code: 'truncated-record',
    message: 'The file ends in the middle of a record.',
    offset: at,
  });
  const corrupt = (at: number, why: string): ScanIssue => ({
    code: 'corrupt-record',
    message: `Unreadable data at byte ${at} (${why}).`,
    offset: at,
  });

  while (p < limit) {
    const h = bytes[p];
    const compressed = (h & 0x80) !== 0;

    if (!compressed && (h & 0x40) !== 0) {
      // Definition message.
      const hasDev = (h & 0x20) !== 0;
      const local = h & 0x0f;
      if (p + 6 > limit) {
        stop = truncated(p);
        break;
      }
      const arch = bytes[p + 2];
      if (arch > 1) {
        stop = corrupt(p, 'invalid byte order flag');
        break;
      }
      const littleEndian = arch === 0;
      const global = view.getUint16(p + 3, littleEndian);
      const n = bytes[p + 5];
      let q = p + 6;
      if (q + n * 3 > limit) {
        stop = truncated(p);
        break;
      }
      const fields: FieldDef[] = [];
      let offset = 0;
      let bad = false;
      for (let i = 0; i < n; i++) {
        const size = bytes[q + 1];
        const baseType = bytes[q + 2];
        if (size === 0 || (baseType & 0x1f) > 16 || (baseType & 0x60) !== 0) {
          bad = true;
          break;
        }
        fields.push({ num: bytes[q], size, baseType, offset });
        offset += size;
        q += 3;
      }
      if (bad) {
        stop = corrupt(p, 'invalid field definition');
        break;
      }
      let devSize = 0;
      if (hasDev) {
        if (q + 1 > limit) {
          stop = truncated(p);
          break;
        }
        const nd = bytes[q];
        q += 1;
        if (q + nd * 3 > limit) {
          stop = truncated(p);
          break;
        }
        for (let i = 0; i < nd; i++) {
          devSize += bytes[q + 1];
          q += 3;
        }
      }
      const def: MesgDef = { local, global, littleEndian, fields, fieldsSize: offset, devSize };
      defs.set(local, def);
      records.push({ kind: 'definition', offset: p, length: q - p, local, global, def });
      p = q;
      continue;
    }

    // Data message, normal or compressed-timestamp header.
    if (!compressed && (h & 0x30) !== 0) {
      stop = corrupt(p, 'reserved header bits set');
      break;
    }
    const local = compressed ? (h >> 5) & 0x03 : h & 0x0f;
    const def = defs.get(local);
    if (!def) {
      stop = corrupt(p, 'data without a matching definition');
      break;
    }
    const length = 1 + def.fieldsSize + def.devSize;
    if (p + length > limit) {
      stop = truncated(p);
      break;
    }
    if (def.global === MESG.fileId && ++fileIds > 1) {
      // Either a second, chained FIT file or zero padding that happens to parse as local type 0.
      stop = { code: 'trailing-data', message: 'Data after the first activity was ignored.', offset: p };
      break;
    }
    const tsField = def.fields.find((f) => f.num === 253 && f.size === 4);
    if (tsField && view.getUint32(p + 1 + tsField.offset, def.littleEndian) === 0) {
      stop = corrupt(p, 'blank padding where a record should be');
      break;
    }
    const rec: FitRecord = { kind: 'data', offset: p, length, local, global: def.global, def };
    if (compressed) rec.compressedTime = h & 0x1f;
    records.push(rec);
    p += length;
  }

  if (stop) {
    issues.push(stop);
    // Whatever we said about the checksum no longer describes the part we can use.
    if (crcOk) crcOk = false;
  }

  return {
    headerOffset,
    headerSize,
    protocolVersion,
    profileVersion,
    declaredDataSize,
    dataStart,
    dataEnd: p,
    records,
    issues,
    crcOk,
  };
}

/** Read an integer field from a data message. Returns null when absent or set to the type's "invalid" value. */
export function readField(view: DataView, rec: FitRecord, num: number): number | null {
  const f = rec.def.fields.find((x) => x.num === num);
  if (!f) return null;
  const at = rec.offset + 1 + f.offset;
  const le = rec.def.littleEndian;
  const t = f.baseType & 0x1f;
  const signed = t === 1 || t === 3 || t === 5;
  const zType = t === 10 || t === 11 || t === 12;
  let v: number;
  let invalid: number;
  if (f.size === 1) {
    v = signed ? view.getInt8(at) : view.getUint8(at);
    invalid = signed ? 0x7f : 0xff;
  } else if (f.size === 2) {
    v = signed ? view.getInt16(at, le) : view.getUint16(at, le);
    invalid = signed ? 0x7fff : 0xffff;
  } else if (f.size === 4) {
    v = signed ? view.getInt32(at, le) : view.getUint32(at, le);
    invalid = signed ? 0x7fffffff : 0xffffffff;
  } else {
    return null;
  }
  if (zType) return v === 0 ? null : v;
  return v === invalid ? null : v;
}

export interface TrackPoint {
  /** FIT timestamp (seconds since the FIT epoch), or null when the record carries none. */
  time: number | null;
  lat?: number;
  lon?: number;
  /** Metres. */
  ele?: number;
  hr?: number;
  cad?: number;
  /** Cumulative metres. */
  dist?: number;
  /** Metres per second. */
  speed?: number;
  power?: number;
  temp?: number;
}

export interface SessionInfo {
  startTime: number | null;
  timestamp: number | null;
  /** Seconds. */
  elapsed: number | null;
  timer: number | null;
  /** Metres. */
  distance: number | null;
  sport: number | null;
  subSport: number | null;
  calories: number | null;
  ascent: number | null;
}

export interface DecodedFit {
  fileType: number | null;
  fileIdCount: number;
  sport: number | null;
  subSport: number | null;
  points: TrackPoint[];
  sessions: SessionInfo[];
  lapCount: number;
  activityCount: number;
  /** Spans (FIT seconds) during which the timer was stopped. */
  timerStops: [number, number][];
  hasDeveloperData: boolean;
}

const SEMI_TO_DEG = 180 / 2 ** 31;

export function decodeFit(bytes: Uint8Array, scan: ScanResult): DecodedFit {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: DecodedFit = {
    fileType: null,
    fileIdCount: 0,
    sport: null,
    subSport: null,
    points: [],
    sessions: [],
    lapCount: 0,
    activityCount: 0,
    timerStops: [],
    hasDeveloperData: false,
  };
  let lastTs: number | null = null;
  let stoppedAt: number | null = null;
  let sportMesg: [number | null, number | null] | null = null;
  let lapSport: number | null = null;

  for (const rec of scan.records) {
    if (rec.kind === 'definition') {
      if (rec.def.devSize > 0) out.hasDeveloperData = true;
      continue;
    }
    let ts = readField(view, rec, 253);
    if (ts !== null) {
      lastTs = ts;
    } else if (rec.compressedTime !== undefined && lastTs !== null) {
      ts = (lastTs & ~0x1f) + rec.compressedTime;
      if (rec.compressedTime < (lastTs & 0x1f)) ts += 0x20;
      lastTs = ts;
    }

    switch (rec.global) {
      case MESG.fileId:
        out.fileIdCount++;
        out.fileType = readField(view, rec, 0);
        break;
      case MESG.sport:
        sportMesg = [readField(view, rec, 0), readField(view, rec, 1)];
        break;
      case MESG.record: {
        const pt: TrackPoint = { time: ts };
        const lat = readField(view, rec, 0);
        const lon = readField(view, rec, 1);
        if (lat !== null && lon !== null) {
          pt.lat = lat * SEMI_TO_DEG;
          pt.lon = lon * SEMI_TO_DEG;
        }
        const enhAlt = readField(view, rec, 78);
        const alt = readField(view, rec, 2);
        if (enhAlt !== null) pt.ele = enhAlt / 5 - 500;
        else if (alt !== null) pt.ele = alt / 5 - 500;
        const hr = readField(view, rec, 3);
        if (hr !== null) pt.hr = hr;
        const cad = readField(view, rec, 4);
        if (cad !== null) pt.cad = cad;
        const dist = readField(view, rec, 5);
        if (dist !== null) pt.dist = dist / 100;
        const enhSpeed = readField(view, rec, 73);
        const speed = readField(view, rec, 6);
        if (enhSpeed !== null) pt.speed = enhSpeed / 1000;
        else if (speed !== null) pt.speed = speed / 1000;
        const power = readField(view, rec, 7);
        if (power !== null) pt.power = power;
        const temp = readField(view, rec, 13);
        if (temp !== null) pt.temp = temp;
        out.points.push(pt);
        break;
      }
      case MESG.event: {
        if (readField(view, rec, 0) !== 0 || ts === null) break; // timer events only
        const type = readField(view, rec, 1);
        if (type === 0) {
          if (stoppedAt !== null && ts > stoppedAt) out.timerStops.push([stoppedAt, ts]);
          stoppedAt = null;
        } else if (type === 1 || type === 4) {
          if (stoppedAt === null) stoppedAt = ts;
        }
        break;
      }
      case MESG.lap:
        out.lapCount++;
        if (lapSport === null) lapSport = readField(view, rec, 25);
        break;
      case MESG.session: {
        const ms = (n: number | null) => (n === null ? null : n / 1000);
        const dist = readField(view, rec, 9);
        out.sessions.push({
          startTime: readField(view, rec, 2),
          timestamp: ts,
          elapsed: ms(readField(view, rec, 7)),
          timer: ms(readField(view, rec, 8)),
          distance: dist === null ? null : dist / 100,
          sport: readField(view, rec, 5),
          subSport: readField(view, rec, 6),
          calories: readField(view, rec, 11),
          ascent: readField(view, rec, 22),
        });
        break;
      }
      case MESG.activity:
        out.activityCount++;
        break;
    }
  }

  const s = out.sessions[0];
  out.sport = s?.sport ?? sportMesg?.[0] ?? lapSport ?? null;
  out.subSport = s?.subSport ?? sportMesg?.[1] ?? null;
  return out;
}

const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance in metres. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Summary {
  startTime: number;
  endTime: number;
  /** Seconds from first to last record. */
  elapsed: number;
  /** Elapsed minus the time the timer was stopped. */
  timer: number;
  /** Metres. */
  distance: number;
  avgSpeed: number | null;
  maxSpeed: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCad: number | null;
  avgPower: number | null;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  pointCount: number;
}

/** Derive activity totals from the recorded points. Returns null when no point has a timestamp. */
export function summarize(points: TrackPoint[], timerStops: [number, number][] = []): Summary | null {
  const timed = points.filter((p) => p.time !== null);
  if (timed.length === 0) return null;
  const startTime = timed[0].time as number;
  const endTime = timed[timed.length - 1].time as number;
  const elapsed = Math.max(0, endTime - startTime);

  let stopped = 0;
  for (const [a, b] of timerStops) {
    const from = Math.max(a, startTime);
    const to = Math.min(b, endTime);
    if (to > from) stopped += to - from;
  }
  const timer = elapsed - stopped > 0 ? elapsed - stopped : elapsed;

  let recordedDist: number | null = null;
  let gpsDist = 0;
  let prev: TrackPoint | null = null;
  let maxSpeed: number | null = null;
  const acc = { hr: 0, hrN: 0, maxHr: 0, cad: 0, cadN: 0, pw: 0, pwN: 0 };
  let first: TrackPoint | null = null;
  let last: TrackPoint | null = null;

  for (const p of points) {
    if (p.dist !== undefined && (recordedDist === null || p.dist > recordedDist)) recordedDist = p.dist;
    if (p.lat !== undefined && p.lon !== undefined) {
      if (prev) gpsDist += haversine(prev.lat!, prev.lon!, p.lat, p.lon);
      prev = p;
      first ??= p;
      last = p;
    }
    if (p.speed !== undefined && (maxSpeed === null || p.speed > maxSpeed)) maxSpeed = p.speed;
    if (p.hr !== undefined) {
      acc.hr += p.hr;
      acc.hrN++;
      if (p.hr > acc.maxHr) acc.maxHr = p.hr;
    }
    if (p.cad !== undefined) {
      acc.cad += p.cad;
      acc.cadN++;
    }
    if (p.power !== undefined) {
      acc.pw += p.power;
      acc.pwN++;
    }
  }

  const distance = recordedDist ?? gpsDist;
  return {
    startTime,
    endTime,
    elapsed,
    timer,
    distance,
    avgSpeed: timer > 0 && distance > 0 ? distance / timer : null,
    maxSpeed,
    avgHr: acc.hrN ? Math.round(acc.hr / acc.hrN) : null,
    maxHr: acc.hrN ? acc.maxHr : null,
    avgCad: acc.cadN ? Math.round(acc.cad / acc.cadN) : null,
    avgPower: acc.pwN ? Math.round(acc.pw / acc.pwN) : null,
    startLat: first?.lat ?? null,
    startLon: first?.lon ?? null,
    endLat: last?.lat ?? null,
    endLon: last?.lon ?? null,
    pointCount: points.length,
  };
}
