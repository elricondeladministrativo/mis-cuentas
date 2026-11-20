// Genera icon-192.png e icon-512.png (sin dependencias). Uso: node make-icons.js
const zlib = require("zlib"), fs = require("fs");
function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [18, 61, 51], fg = [255, 255, 255], acc = [94, 214, 160];
  const S = size / 512;
  const bars = [[136, 300, 64, 116], [224, 236, 64, 180], [312, 160, 64, 256]]; // x, y, w, h (en 512)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let c = bg; const X = x / S, Y = y / S;
    for (const [bx, by, bw, bh] of bars) if (X >= bx && X < bx + bw && Y >= by && Y < by + bh) c = fg;
    if (Y >= 416 && Y < 432 && X >= 112 && X < 400) c = acc;
    const i = (y * size + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [192, 512]) fs.writeFileSync(__dirname + "/icon-" + s + ".png", png(s));
