// Minimal ZIP writer (stored, no compression). Used where only .zip downloads are allowed
// (inside a claude.ai artifact) to hand over the STL file.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @param {Date} [date]
 * @returns {Uint8Array}
 */
export function makeZip(files, date = new Date()) {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));

  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let o = 0;
  const u16 = (v) => {
    dv.setUint16(o, v, true);
    o += 2;
  };
  const u32 = (v) => {
    dv.setUint32(o, v >>> 0, true);
    o += 4;
  };
  const bytes = (b) => {
    out.set(b, o);
    o += b.length;
  };

  for (const e of entries) {
    e.offset = o;
    u32(0x04034b50);
    u16(20); // version needed
    u16(0x0800); // UTF-8 file names
    u16(0); // stored
    u16(time);
    u16(day);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0);
    bytes(e.name);
    bytes(e.data);
  }
  const cdStart = o;
  for (const e of entries) {
    u32(0x02014b50);
    u16(20); // version made by
    u16(20); // version needed
    u16(0x0800);
    u16(0);
    u16(time);
    u16(day);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(e.offset);
    bytes(e.name);
  }
  const cdSize = o - cdStart;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(cdSize);
  u32(cdStart);
  u16(0);
  return out;
}
