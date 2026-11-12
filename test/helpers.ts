import FitParser from 'fit-file-parser';
import { FIT_EPOCH_OFFSET } from '../src/lib/fit/core';

/** Independent, strict decode (CRC checked, complete records required). Throws when the file is not valid FIT. */
export async function oracle(bytes: Uint8Array): Promise<any> {
  const parser = new FitParser({ force: false, strict: true, speedUnit: 'm/s', lengthUnit: 'm', mode: 'list' });
  const copy = bytes.slice();
  return parser.parseAsync(copy.buffer as ArrayBuffer);
}

/** A synthetic GPX recording heading north at ~3 m/s, one point per second. */
export function makeGpx(startIso: string, seconds: number, opts: { lat?: number; lon?: number; hr?: boolean; times?: boolean } = {}): string {
  const lat0 = opts.lat ?? 45;
  const lon0 = opts.lon ?? -93;
  const start = Date.parse(startIso);
  const pts: string[] = [];
  for (let i = 0; i < seconds; i++) {
    const lat = lat0 + i * 0.000027; // ~3.0 m per step
    const time = opts.times === false ? '' : `<time>${new Date(start + i * 1000).toISOString()}</time>`;
    const hr = opts.hr ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${120 + (i % 40)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : '';
    pts.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon0.toFixed(7)}"><ele>${(250 + i * 0.1).toFixed(1)}</ele>${time}${hr}</trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Test &amp; run</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

export const toFitTime = (iso: string): number => Date.parse(iso) / 1000 - FIT_EPOCH_OFFSET;
