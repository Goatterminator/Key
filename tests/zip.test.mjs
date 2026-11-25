import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZip, crc32 } from '../js/zip.js';

test('crc32 of a known string', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip holds the file unchanged and is well-formed', () => {
  const data = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
  const zip = makeZip([{ name: 'kulcs.stl', data }]);
  const dv = new DataView(zip.buffer);
  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 1);
  const cd = dv.getUint32(eocd + 16, true);
  assert.equal(dv.getUint32(cd, true), 0x02014b50);
  const nameLen = dv.getUint16(cd + 28, true);
  assert.equal(new TextDecoder().decode(zip.subarray(cd + 46, cd + 46 + nameLen)), 'kulcs.stl');
  const local = dv.getUint32(cd + 42, true);
  assert.equal(dv.getUint32(local, true), 0x04034b50);
  const start = local + 30 + dv.getUint16(local + 26, true);
  const size = dv.getUint32(local + 18, true);
  assert.deepEqual(zip.subarray(start, start + size), data);
  assert.equal(dv.getUint32(local + 14, true), crc32(data));
});
