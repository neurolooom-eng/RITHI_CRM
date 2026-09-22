// ===========================================================================
// A DEFLATED ZIP, WITHOUT A DEPENDENCY.
//
// The browser's export (src/lib/zip.ts) writes a STORED zip, and says why: a
// workbook is a few pages of text and the bytes are cheaper than a compressor.
// A mailed export is the opposite case. Resend accepts 40 MB of attachment and
// a CSV of the machine register is several megabytes of extremely repetitive
// text, so stored is the difference between "the whole database arrives" and
// "most of it was left behind, see the note".
//
// There is no compressor to write: `CompressionStream('deflate-raw')` is raw
// DEFLATE, which is exactly what ZIP method 8 carries. So this is the same
// forty lines of headers as zip.ts with a different method number, and the one
// rule that matters -- IF DEFLATE MAKES IT BIGGER, STORE IT. A member whose
// compressed size exceeds its original is legal and works, and it is also a
// file that got worse for being compressed; the fallback costs one comparison.
//
// Deliberately NOT imported from src/lib/zip.ts: this runs in Deno on Supabase
// and that module is part of the browser bundle. Sharing it would mean the
// front end and the Edge Function had to be deployed together, which they are
// not. `npm run check:export-zip` builds real archives with this file and has
// `unzip` read them back, so the copy cannot drift into being wrong.
// ===========================================================================

export interface ZipPart { path: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Raw DEFLATE of the given bytes. */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

export async function zipDeflate(parts: ZipPart[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const enc = new TextEncoder();

  for (const p of parts) {
    const name = enc.encode(p.path);
    const crc = crc32(p.data);
    const packed = await deflateRaw(p.data);
    // Storing is better than a member that grew. Both are legal; only one is
    // sensible, and an already-compressed payload does grow.
    const useDeflate = packed.length < p.data.length;
    const body = useDeflate ? packed : p.data;
    const method = useDeflate ? 8 : 0;

    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(body.length), ...u32(p.data.length),
      ...u16(name.length), ...u16(0), ...name,
    ]);
    chunks.push(local, body);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(body.length), ...u32(p.data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...name,
    ]));
    offset += local.length + body.length;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(parts.length), ...u16(parts.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);

  const total = chunks.reduce((a, c) => a + c.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; }
  return out;
}
