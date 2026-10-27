// ===========================================================================
// THE TEXT OF A WORD (.docx) FILE, in the browser, with no library: a .docx is
// a zip, and the document is its `word/document.xml`. The zip's central
// directory says where that entry is and how it is packed; the browser's own
// DecompressionStream('deflate-raw') unpacks it. Used to read the HR Training
// Document (2026-10-27) -- the file itself is uploaded to Drive as it is.
// ===========================================================================
export async function readDocxDocumentXml(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // The End Of Central Directory record, searched for from the end (a comment may follow it).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a Word (.docx) file.');
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const text = new TextDecoder();
  for (let n = 0; n < entries; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = text.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === 'word/document.xml') {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = buf.slice(start, start + size);
      if (method === 0) return text.decode(data);
      if (method === 8) {
        const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return text.decode(out);
      }
      throw new Error('This Word file is packed in a way that cannot be read here.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('This file has no Word document inside.');
}
