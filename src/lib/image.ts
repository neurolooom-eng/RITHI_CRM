// Downscale a picked image to a data URL so a pasted screenshot doesn't bloat a
// row / table cell. Small files pass through untouched; larger ones are drawn
// onto a canvas capped at `maxW` and re-encoded as JPEG. Shared by the Knowledge
// Base rich editor and the how-to guide screenshots.
export async function fileToDataUrl(file: File, maxW = 1280): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (file.size < 260_000) return dataUrl; // small enough already
  return await new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { res(dataUrl); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
