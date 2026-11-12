import { describe, expect, it } from 'vitest';
import { decodeFit, fitCrc, FitError, haversine, scanFit, summarize } from '../src/lib/fit/core';
import { mergeFit, repairFit } from '../src/lib/fit/ops';
import { fitToGpx, gpxToFit, mergeGpx, parseGpx } from '../src/lib/gpx';
import { makeGpx, oracle, toFitTime } from './helpers';

const START = '2026-05-02T14:00:00Z';

describe('checksum', () => {
  it('matches the CRC-16/ARC check value', () => {
    // FIT uses CRC-16/ARC, whose published check value for "123456789" is 0xBB3D.
    expect(fitCrc(new TextEncoder().encode('123456789'))).toBe(0xbb3d);
  });
});

describe('haversine', () => {
  it('gives one degree of latitude as ~111.195 km', () => {
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111195, -1);
  });
});

describe('GPX to FIT', () => {
  const gpx = makeGpx(START, 600, { hr: true });
  const { output, points, distance } = gpxToFit(gpx, 1);

  it('writes a file a strict independent decoder accepts', async () => {
    const d = await oracle(output);
    expect(d.records).toHaveLength(600);
    expect(d.sessions).toHaveLength(1);
    expect(d.laps).toHaveLength(1);
    expect(d.sessions[0].sport).toBe('running');
    // 599 steps of 0.000027 degrees latitude.
    const expected = haversine(45, -93, 45 + 599 * 0.000027, -93);
    expect(distance).toBeCloseTo(expected, 0);
    expect(d.sessions[0].total_distance).toBeCloseTo(expected, 0);
    expect(d.sessions[0].total_elapsed_time).toBe(599);
    expect(d.records[0].position_lat).toBeCloseTo(45, 5);
    expect(d.records[0].position_long).toBeCloseTo(-93, 5);
    expect(d.records[10].heart_rate).toBe(130);
    expect(d.records[0].altitude).toBeCloseTo(250, 0);
    expect(new Date(d.records[0].timestamp).toISOString()).toBe('2026-05-02T14:00:00.000Z');
  });

  it('is read back identically by our own scanner', () => {
    const scan = scanFit(output);
    expect(scan.issues).toEqual([]);
    expect(scan.crcOk).toBe(true);
    const decoded = decodeFit(output, scan);
    expect(decoded.points).toHaveLength(points);
    expect(decoded.sport).toBe(1);
    expect(decoded.points[0].time).toBe(toFitTime(START));
  });

  it('round-trips back to GPX without losing points', () => {
    const back = fitToGpx(output, 'Test & run');
    const parsed = parseGpx(back.output);
    expect(parsed.points).toHaveLength(600);
    expect(parsed.name).toBe('Test & run');
    expect(parsed.points[599].lat).toBeCloseTo(45 + 599 * 0.000027, 6);
    expect(parsed.points[5].hr).toBe(125);
    expect(parsed.points[0].time).toBe(toFitTime(START));
  });

  it('refuses a route with no timestamps, with a specific reason', () => {
    expect(() => gpxToFit(makeGpx(START, 10, { times: false }))).toThrowError(/no timestamps/);
  });

  it('rejects non-GPX input', () => {
    expect(() => parseGpx('{"not":"gpx"}')).toThrowError(FitError);
  });
});

describe('repair', () => {
  const valid = gpxToFit(makeGpx(START, 900, { hr: true }), 2).output;

  it('reports an intact file as already valid and leaves its records alone', async () => {
    const { output, report } = repairFit(valid);
    expect(report.alreadyValid).toBe(true);
    expect(report.added).toEqual([]);
    expect((await oracle(output)).records).toHaveLength(900);
  });

  it.each([0.15, 0.4, 0.73, 0.999])('recovers a file cut off at %f of its length', async (fraction) => {
    const cut = valid.slice(0, Math.floor(valid.length * fraction));
    await expect(oracle(cut)).rejects.toBeTruthy(); // the damaged input really is invalid
    const { output, report } = repairFit(cut);
    const d = await oracle(output);
    expect(report.alreadyValid).toBe(false);
    expect(d.records.length).toBeGreaterThan(900 * fraction - 30);
    expect(d.records.length).toBe(report.summary!.pointCount);
    expect(d.sessions).toHaveLength(1);
    expect(d.laps).toHaveLength(1);
    // The sport lives in the lap and session messages at the end. Cut before them and it is gone;
    // cut inside the session message and it is recovered from the surviving lap.
    expect(d.sessions[0].sport).toBe(fraction < 0.99 ? 'generic' : 'cycling');
    expect(report.sportUnknown).toBe(fraction < 0.99);
    // Totals must describe what was actually recovered.
    const last = d.records[d.records.length - 1];
    expect(d.sessions[0].total_distance).toBeCloseTo(last.distance, 1);
    expect(d.sessions[0].total_elapsed_time).toBe(d.records.length - 1);
  });

  it('uses the sport the caller supplies when the file lost it', async () => {
    const { output } = repairFit(valid.slice(0, valid.length / 2), { sport: 2 });
    expect((await oracle(output)).sessions[0].sport).toBe('cycling');
  });

  it('recovers a recording that was never finalised (zero data size, no checksum)', async () => {
    const broken = valid.slice(0, valid.length - 2);
    broken.set([0, 0, 0, 0], 4);
    const { output, report } = repairFit(broken);
    expect(report.issues.map((i) => i.code)).toContain('bad-data-size');
    expect(report.added).toEqual([]); // summary messages were all still there
    const d = await oracle(output);
    expect(d.records).toHaveLength(900);
    expect(d.sessions[0].sport).toBe('cycling');
  });

  it('fixes a wrong checksum', async () => {
    const broken = valid.slice();
    broken[broken.length - 1] ^= 0xff;
    const { output, report } = repairFit(broken);
    expect(report.issues.map((i) => i.code)).toEqual(['bad-crc']);
    expect((await oracle(output)).records).toHaveLength(900);
  });

  it('stops at blank padding instead of reading it as data', async () => {
    const cut = valid.slice(0, Math.floor(valid.length * 0.5));
    const padded = new Uint8Array(cut.length + 4096);
    padded.set(cut);
    const { output } = repairFit(padded);
    const d = await oracle(output);
    expect(d.records.length).toBeGreaterThan(400);
    expect(d.records.length).toBeLessThan(470);
  });

  it('stops at 0xFF padding', async () => {
    const cut = valid.slice(0, Math.floor(valid.length * 0.5));
    const padded = new Uint8Array(cut.length + 4096).fill(0xff);
    padded.set(cut);
    const d = await oracle(repairFit(padded).output);
    expect(d.records.length).toBeLessThan(470);
  });

  it('finds the header behind leading garbage', async () => {
    const shifted = new Uint8Array(valid.length + 37);
    shifted.set(valid, 37);
    const { output, report } = repairFit(shifted);
    expect(report.issues[0].code).toBe('leading-garbage');
    expect((await oracle(output)).records).toHaveLength(900);
  });

  it('rejects files that are not FIT, and files with nothing left', () => {
    expect(() => repairFit(new TextEncoder().encode('<gpx></gpx>'))).toThrowError(/signature/);
    expect(() => repairFit(valid.slice(0, 14))).toThrowError(/nothing to recover/);
  });
});

describe('merge FIT', () => {
  const a = gpxToFit(makeGpx(START, 300, { hr: true }), 1).output;
  // Second part starts 10 minutes after the first ends, from where the first stopped.
  const b = gpxToFit(makeGpx('2026-05-02T14:15:00Z', 200, { lat: 45 + 300 * 0.000027 }), 1).output;

  it('joins parts in time order regardless of the order given', async () => {
    const { output, report } = mergeFit([b, a]);
    expect(report.order).toEqual([1, 0]);
    expect(report.gaps).toEqual([900 - 299]);
    const d = await oracle(output);
    expect(d.records).toHaveLength(500);
    expect(d.sessions).toHaveLength(1);
    expect(d.laps).toHaveLength(2);
    expect(d.laps.map((l: any) => l.message_index?.value ?? l.message_index)).toEqual([0, 1]);

    // Distance must keep climbing across the join.
    const dist = d.records.map((r: any) => r.distance);
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1]);
    const da = haversine(45, -93, 45 + 299 * 0.000027, -93);
    const db = haversine(45, -93, 45 + 199 * 0.000027, -93);
    expect(dist[499]).toBeCloseTo(da + db, 0);
    expect(d.sessions[0].total_distance).toBeCloseTo(da + db, 0);
    // Moving time is the two parts; elapsed time includes the break.
    expect(d.sessions[0].total_timer_time).toBe(299 + 199);
    expect(d.sessions[0].total_elapsed_time).toBe(900 + 199);
    expect(d.sessions[0].num_laps).toBe(2);
  });

  it('refuses overlapping recordings', () => {
    const c = gpxToFit(makeGpx('2026-05-02T14:02:00Z', 100), 1).output;
    expect(() => mergeFit([a, c])).toThrowError(/overlap/);
  });

  it('needs two files', () => {
    expect(() => mergeFit([a])).toThrowError(/at least two/);
  });
});

describe('merge GPX', () => {
  it('orders by start time and keeps every point', () => {
    const one = makeGpx(START, 50);
    const two = makeGpx('2026-05-02T15:00:00Z', 70);
    const { output, report } = mergeGpx([two, one]);
    expect(report.order).toEqual([1, 0]);
    const parsed = parseGpx(output);
    expect(parsed.points).toHaveLength(120);
    const times = parsed.points.map((p) => p.time as number);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  it('keeps the given order when a file has no timestamps', () => {
    const { report } = mergeGpx([makeGpx(START, 5, { times: false }), makeGpx(START, 5)]);
    expect(report.keptInputOrder).toBe(true);
    expect(report.order).toEqual([0, 1]);
  });
});

describe('summarize', () => {
  it('subtracts stopped time and returns null without timestamps', () => {
    const pts = [0, 10, 100, 110].map((t, i) => ({ time: 1000 + t, dist: i * 50 }));
    const s = summarize(pts, [[1010, 1100]])!;
    expect(s.elapsed).toBe(110);
    expect(s.timer).toBe(20);
    expect(s.distance).toBe(150);
    expect(s.avgSpeed).toBeCloseTo(7.5);
    expect(summarize([{ time: null }])).toBeNull();
  });
});
