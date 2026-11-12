/**
 * Checks against real device recordings. The files are third-party test data and are not committed;
 * set SAMPLES_DIR to a folder of .fit files to run these. Without it the suite is skipped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeFit, scanFit } from '../src/lib/fit/core';
import { repairFit } from '../src/lib/fit/ops';
import { fitToGpx, parseGpx } from '../src/lib/gpx';
import { oracle } from './helpers';

const dir = process.env.SAMPLES_DIR;
const files: string[] = dir ? readdirSync(dir).filter((f: string) => f.endsWith('.fit')) : [];

describe.skipIf(files.length === 0)('real device files', () => {
  it.each(files)('%s: scan agrees with the independent decoder', async (name: string) => {
    const bytes = new Uint8Array(readFileSync(join(dir!, name)));
    const scan = scanFit(bytes);
    const decoded = decodeFit(bytes, scan);
    const ref = await oracle(bytes);
    expect(scan.issues).toEqual([]);
    expect(scan.crcOk).toBe(true);
    expect(decoded.points.length).toBe(ref.records.length);
    expect(decoded.sessions.length).toBe(ref.sessions.length);
    expect(decoded.lapCount).toBe(ref.laps.length);
    // Spot-check values on the last record that has them.
    const i = ref.records.length - 1;
    if (i >= 0) {
      const r = ref.records[i];
      const p = decoded.points[i];
      if (r.position_lat !== undefined) expect(p.lat).toBeCloseTo(r.position_lat, 5);
      if (r.distance !== undefined) expect(p.dist).toBeCloseTo(r.distance, 1);
      if (r.heart_rate !== undefined) expect(p.hr).toBe(r.heart_rate);
      if (r.timestamp) expect((p.time! + 631065600) * 1000).toBe(new Date(r.timestamp).getTime());
    }
  });

  it.each(files)('%s: repair of an intact file changes nothing that matters', async (name: string) => {
    const bytes = new Uint8Array(readFileSync(join(dir!, name)));
    const ref = await oracle(bytes);
    const { output, report } = repairFit(bytes);
    const out = await oracle(output);
    expect(out.records.length).toBe(ref.records.length);
    if (ref.sessions.length && ref.activity) expect(report.alreadyValid).toBe(true);
  });

  it.each(files)('%s: a truncated copy is repaired into a valid file', async (name: string) => {
    const bytes = new Uint8Array(readFileSync(join(dir!, name)));
    const ref = await oracle(bytes);
    if (ref.records.length < 20) return;
    const cut = bytes.slice(0, Math.floor(bytes.length * 0.6));
    const { output, report } = repairFit(cut);
    const out = await oracle(output);
    expect(out.records.length).toBeGreaterThan(ref.records.length * 0.4);
    expect(out.records.length).toBeLessThanOrEqual(ref.records.length);
    expect(out.sessions.length).toBe(1);
    // Some devices write the session before the records, in which case it survives the cut.
    const sessionSurvived = decodeFit(cut, scanFit(cut)).sessions.length > 0;
    expect(report.added.includes('session')).toBe(!sessionSurvived);
    // Recovered records are the originals, in order.
    expect(out.records[out.records.length - 1].timestamp).toEqual(ref.records[out.records.length - 1].timestamp);
  });

  it.each(files)('%s: converts to GPX when it has positions', (name: string) => {
    const bytes = new Uint8Array(readFileSync(join(dir!, name)));
    const decoded = decodeFit(bytes, scanFit(bytes));
    const located = decoded.points.filter((p) => p.lat !== undefined).length;
    if (located === 0) {
      expect(() => fitToGpx(bytes)).toThrowError(/no GPS positions/);
    } else {
      expect(parseGpx(fitToGpx(bytes).output).points.length).toBe(located);
    }
  });
});
