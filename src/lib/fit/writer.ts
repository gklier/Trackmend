/**
 * Minimal FIT writer: enough to emit file_id, record, event, lap, session and activity messages, to splice
 * already-encoded records through untouched, and to finish a file with a correct header and checksums.
 */
import { fitCrc, MESG, type Summary } from './core';

export const BT = {
  enum: 0x00,
  sint8: 0x01,
  uint8: 0x02,
  uint16: 0x84,
  sint32: 0x85,
  uint32: 0x86,
} as const;

type FieldSpec = readonly [num: number, baseType: number];

const SIZE: Record<number, number> = { 0x00: 1, 0x01: 1, 0x02: 1, 0x84: 2, 0x85: 4, 0x86: 4 };
const INVALID: Record<number, number> = {
  0x00: 0xff,
  0x01: 0x7f,
  0x02: 0xff,
  0x84: 0xffff,
  0x85: 0x7fffffff,
  0x86: 0xffffffff,
};

export class FitWriter {
  private buf = new Uint8Array(64 * 1024);
  private len = 0;
  private defs = new Map<number, FieldSpec[]>();

  private reserve(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  /** Append bytes that are already valid FIT records. */
  raw(bytes: Uint8Array): void {
    this.reserve(bytes.length);
    this.buf.set(bytes, this.len);
    this.len += bytes.length;
  }

  define(local: number, global: number, fields: FieldSpec[]): void {
    this.reserve(6 + fields.length * 3);
    const b = this.buf;
    let p = this.len;
    b[p++] = 0x40 | (local & 0x0f);
    b[p++] = 0; // reserved
    b[p++] = 0; // little endian
    b[p++] = global & 0xff;
    b[p++] = (global >> 8) & 0xff;
    b[p++] = fields.length;
    for (const [num, type] of fields) {
      b[p++] = num;
      b[p++] = SIZE[type];
      b[p++] = type;
    }
    this.len = p;
    this.defs.set(local, fields);
  }

  /** Write a data message. `null`/`undefined` become the field's "invalid" marker. */
  write(local: number, values: (number | null | undefined)[]): void {
    const fields = this.defs.get(local);
    if (!fields) throw new Error(`local message ${local} is not defined`);
    if (values.length !== fields.length) throw new Error('value count does not match definition');
    let size = 1;
    for (const [, type] of fields) size += SIZE[type];
    this.reserve(size);
    const view = new DataView(this.buf.buffer);
    let p = this.len;
    view.setUint8(p++, local & 0x0f);
    fields.forEach(([, type], i) => {
      const invalid = INVALID[type];
      let v = values[i];
      if (v === null || v === undefined || !Number.isFinite(v)) {
        v = invalid;
      } else {
        v = Math.round(v);
        const signed = type === BT.sint8 || type === BT.sint32;
        const max = invalid - 1;
        const min = signed ? -invalid : 0;
        v = Math.min(max, Math.max(min, v));
      }
      switch (type) {
        case BT.sint8:
          view.setInt8(p, v);
          break;
        case BT.enum:
        case BT.uint8:
          view.setUint8(p, v);
          break;
        case BT.uint16:
          view.setUint16(p, v, true);
          break;
        case BT.sint32:
          view.setInt32(p, v, true);
          break;
        case BT.uint32:
          view.setUint32(p, v, true);
          break;
      }
      p += SIZE[type];
    });
    this.len = p;
  }

  /** Wrap the records in a 14-byte header and append the file checksum. */
  toFile(protocolVersion = 0x10, profileVersion = 2132): Uint8Array {
    const out = new Uint8Array(14 + this.len + 2);
    const view = new DataView(out.buffer);
    out[0] = 14;
    out[1] = protocolVersion;
    view.setUint16(2, profileVersion, true);
    view.setUint32(4, this.len, true);
    out.set([0x2e, 0x46, 0x49, 0x54], 8);
    view.setUint16(12, fitCrc(out, 0, 12), true);
    out.set(this.buf.subarray(0, this.len), 14);
    view.setUint16(14 + this.len, fitCrc(out, 0, 14 + this.len), true);
    return out;
  }
}

const DEG_TO_SEMI = 2 ** 31 / 180;
export const toSemicircles = (deg: number | null | undefined): number | null =>
  deg === null || deg === undefined ? null : deg * DEG_TO_SEMI;

export function writeFileId(w: FitWriter, timeCreated: number): void {
  w.define(0, MESG.fileId, [
    [0, BT.enum], // type
    [1, BT.uint16], // manufacturer
    [2, BT.uint16], // product
    [4, BT.uint32], // time_created
  ]);
  // type 4 = activity, manufacturer 255 = "development" (the value reserved for non-registered software).
  w.write(0, [4, 255, 0, timeCreated]);
}

export function writeTimerEvent(w: FitWriter, time: number, type: 'start' | 'stop'): void {
  w.define(0, MESG.event, [
    [253, BT.uint32],
    [0, BT.enum], // event: 0 = timer
    [1, BT.enum], // event_type: 0 = start, 4 = stop_all
    [4, BT.uint8], // event_group
  ]);
  w.write(0, [time, 0, type === 'start' ? 0 : 4, 0]);
}

export interface Totals {
  sport: number | null;
  subSport: number | null;
  calories?: number | null;
  ascent?: number | null;
}

export function writeLap(w: FitWriter, s: Summary, index: number, sport: number | null): void {
  w.define(0, MESG.lap, [
    [254, BT.uint16], // message_index
    [253, BT.uint32], // timestamp
    [0, BT.enum], // event: 9 = lap
    [1, BT.enum], // event_type: 1 = stop
    [2, BT.uint32], // start_time
    [3, BT.sint32], // start_position_lat
    [4, BT.sint32], // start_position_long
    [5, BT.sint32], // end_position_lat
    [6, BT.sint32], // end_position_long
    [7, BT.uint32], // total_elapsed_time (ms)
    [8, BT.uint32], // total_timer_time (ms)
    [9, BT.uint32], // total_distance (cm)
    [24, BT.enum], // lap_trigger: 7 = session_end
    [25, BT.enum], // sport
  ]);
  w.write(0, [
    index,
    s.endTime,
    9,
    1,
    s.startTime,
    toSemicircles(s.startLat),
    toSemicircles(s.startLon),
    toSemicircles(s.endLat),
    toSemicircles(s.endLon),
    s.elapsed * 1000,
    s.timer * 1000,
    s.distance * 100,
    7,
    sport,
  ]);
}

export function writeSession(w: FitWriter, s: Summary, numLaps: number, t: Totals): void {
  w.define(0, MESG.session, [
    [254, BT.uint16], // message_index
    [253, BT.uint32], // timestamp
    [0, BT.enum], // event: 8 = session
    [1, BT.enum], // event_type: 1 = stop
    [2, BT.uint32], // start_time
    [3, BT.sint32], // start_position_lat
    [4, BT.sint32], // start_position_long
    [5, BT.enum], // sport
    [6, BT.enum], // sub_sport
    [7, BT.uint32], // total_elapsed_time (ms)
    [8, BT.uint32], // total_timer_time (ms)
    [9, BT.uint32], // total_distance (cm)
    [11, BT.uint16], // total_calories
    [14, BT.uint16], // avg_speed (mm/s)
    [15, BT.uint16], // max_speed (mm/s)
    [16, BT.uint8], // avg_heart_rate
    [17, BT.uint8], // max_heart_rate
    [18, BT.uint8], // avg_cadence
    [20, BT.uint16], // avg_power
    [22, BT.uint16], // total_ascent
    [25, BT.uint16], // first_lap_index
    [26, BT.uint16], // num_laps
    [28, BT.enum], // trigger: 0 = activity_end
  ]);
  w.write(0, [
    0,
    s.endTime,
    8,
    1,
    s.startTime,
    toSemicircles(s.startLat),
    toSemicircles(s.startLon),
    t.sport ?? 0,
    t.subSport ?? 0,
    s.elapsed * 1000,
    s.timer * 1000,
    s.distance * 100,
    t.calories,
    s.avgSpeed === null ? null : s.avgSpeed * 1000,
    s.maxSpeed === null ? null : s.maxSpeed * 1000,
    s.avgHr,
    s.maxHr,
    s.avgCad,
    s.avgPower,
    t.ascent,
    0,
    numLaps,
    0,
  ]);
}

export function writeActivity(w: FitWriter, endTime: number, timerSeconds: number): void {
  w.define(0, MESG.activity, [
    [253, BT.uint32], // timestamp
    [0, BT.uint32], // total_timer_time (ms)
    [1, BT.uint16], // num_sessions
    [2, BT.enum], // type: 0 = manual
    [3, BT.enum], // event: 26 = activity
    [4, BT.enum], // event_type: 1 = stop
  ]);
  w.write(0, [endTime, timerSeconds * 1000, 1, 0, 26, 1]);
}
