import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, writeZip } from '../src/lib/zip';
import { looksLikeKey, normalizeKey, validateLicense } from '../src/lib/license';

describe('zip', () => {
  it('matches the CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive that an independent reader extracts intact', () => {
    const a = new TextEncoder().encode('hello zip');
    const b = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
    const zip = writeZip([{ name: 'a.txt', data: a }, { name: 'nested/b.bin', data: b }]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const path = join(dir, 't.zip');
    writeFileSync(path, zip);
    const out = execFileSync('python3', ['-I', '-c', `
import zipfile, sys, hashlib
z = zipfile.ZipFile(sys.argv[1]); z.testzip() is None or sys.exit('bad crc')
print(z.read('a.txt').decode(), hashlib.sha256(z.read('nested/b.bin')).hexdigest())`, path]).toString().trim();
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    expect(out).toBe(`hello zip ${createHash('sha256').update(b).digest('hex')}`);
  });
});

describe('license', () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it('normalises and recognises keys', () => {
    expect(normalizeKey(' 38b1460a-5104-4067-a91d-77b872934d51 ')).toBe('38B1460A-5104-4067-A91D-77B872934D51');
    expect(looksLikeKey('38B1460A-5104-4067-A91D-77B872934D51')).toBe(true);
    expect(looksLikeKey('nope')).toBe(false);
  });

  it('accepts a valid key for the right product and rejects others', async () => {
    const key = '38B1460A-5104-4067-A91D-77B872934D51';
    expect((await validateLicense(key, '123', ok({ valid: true, meta: { product_id: 123 } }))).valid).toBe(true);
    expect((await validateLicense(key, '123', ok({ valid: true, meta: { product_id: 999 } }))).reason).toMatch(/different product/);
    expect((await validateLicense(key, '123', ok({ valid: false, error: 'license_key not found.' }))).reason).toBe('license_key not found.');
    expect((await validateLicense('garbage', '123', ok({ valid: true }))).reason).toMatch(/does not look like/);
    const down = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect((await validateLicense(key, '123', down)).reason).toMatch(/could not be reached/);
  });
});
