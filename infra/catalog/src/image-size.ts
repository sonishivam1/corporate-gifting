/**
 * Reads an image's width and height from the first bytes of the file (PNG,
 * JPEG, GIF or WebP), so commercetools gets real dimensions without
 * downloading whole images. Returns undefined when the header isn't there.
 */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));

  if (bytes.length >= 24 && ascii(1, 3) === "PNG") return { w: view.getUint32(16), h: view.getUint32(20) };
  if (bytes.length >= 10 && ascii(0, 3) === "GIF") return { w: view.getUint16(6, true), h: view.getUint16(8, true) };
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { w: 1 + (view.getUint32(24, true) & 0xffffff), h: 1 + (view.getUint32(27, true) & 0xffffff) };
    if (chunk === "VP8 ") return { w: view.getUint16(26, true) & 0x3fff, h: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return undefined;
      const marker = bytes[at + 1]!;
      const length = view.getUint16(at + 2);
      // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: view.getUint16(at + 5), w: view.getUint16(at + 7) };
      }
      at += 2 + length;
    }
  }
  return undefined;
}
