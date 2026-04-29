import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const iconsDir = "src-tauri/icons";

const pngFiles = listFiles(iconsDir).filter((file) => file.endsWith(".png"));
for (const file of pngFiles) {
  const { width, height } = readPngSize(file);
  if (width !== height) {
    throw new Error(`Icon is not square: ${file} (${width}x${height})`);
  }
  writeFileSync(file, renderPng(width));
}

writeFileSync(join(iconsDir, "icon.icns"), renderIcns());
writeFileSync(join(iconsDir, "icon.ico"), renderIco());

function listFiles(dir) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      entries.push(...listFiles(file));
      continue;
    }
    entries.push(file);
  }
  return entries;
}

function readPngSize(file) {
  const data = readFileSync(file);
  if (data.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Not a PNG file: ${file}`);
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

function renderPng(size) {
  const scale = 4;
  const canvasSize = size * scale;
  const pixels = new Uint8ClampedArray(canvasSize * canvasSize * 4);
  const unit = canvasSize / 50;

  const dark = [30, 36, 41, 255];
  const prompt = [205, 211, 217, 255];
  const track = [70, 78, 87, 255];
  const green = [91, 196, 76, 255];
  const amber = [255, 177, 31, 255];
  const red = [255, 70, 75, 255];

  roundedRect(pixels, canvasSize, unit, 7, 7, 36, 36, 7, dark);
  line(pixels, canvasSize, unit, [[12.5, 14.1], [15.8, 16.7], [12.5, 19.3]], 1.7, prompt);
  line(pixels, canvasSize, unit, [[17.7, 19.2], [22.0, 19.2]], 1.6, prompt);

  roundedRect(pixels, canvasSize, unit, 12.5, 23.6, 25.0, 3.3, 1.65, track);
  roundedRect(pixels, canvasSize, unit, 12.5, 29.6, 25.0, 3.3, 1.65, track);
  roundedRect(pixels, canvasSize, unit, 12.5, 35.6, 25.0, 3.3, 1.65, track);
  roundedRect(pixels, canvasSize, unit, 12.5, 23.6, 17.5, 3.3, 1.65, green);
  roundedRect(pixels, canvasSize, unit, 12.5, 29.6, 13.2, 3.3, 1.65, amber);
  roundedRect(pixels, canvasSize, unit, 12.5, 35.6, 20.3, 3.3, 1.65, red);

  return encodePng(downsample(pixels, canvasSize, size, scale), size);
}

function roundedRect(pixels, canvasSize, unit, x, y, width, height, radius, color) {
  x *= unit;
  y *= unit;
  width *= unit;
  height *= unit;
  radius *= unit;

  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      const cx = Math.max(x + radius, Math.min(px + 0.5, x + width - radius));
      const cy = Math.max(y + radius, Math.min(py + 0.5, y + height - radius));
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(pixels, canvasSize, px, py, color);
      }
    }
  }
}

function line(pixels, canvasSize, unit, points, width, color) {
  const radius = (width * unit) / 2;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index].map((value) => value * unit);
    const [x2, y2] = points[index + 1].map((value) => value * unit);
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len2 = vx * vx + vy * vy;

    for (let py = Math.floor(Math.min(y1, y2) - radius - 1); py <= Math.ceil(Math.max(y1, y2) + radius + 1); py += 1) {
      for (let px = Math.floor(Math.min(x1, x2) - radius - 1); px <= Math.ceil(Math.max(x1, x2) + radius + 1); px += 1) {
        const t = len2 === 0
          ? 0
          : Math.max(0, Math.min(1, (((px + 0.5 - x1) * vx) + ((py + 0.5 - y1) * vy)) / len2));
        const qx = x1 + t * vx;
        const qy = y1 + t * vy;
        const dx = px + 0.5 - qx;
        const dy = py + 0.5 - qy;
        if (dx * dx + dy * dy <= radius * radius) {
          blendPixel(pixels, canvasSize, px, py, color);
        }
      }
    }
  }
}

function blendPixel(pixels, canvasSize, x, y, color) {
  if (x < 0 || x >= canvasSize || y < 0 || y >= canvasSize) {
    return;
  }

  const offset = (y * canvasSize + x) * 4;
  const sourceAlpha = color[3] / 255;
  const destAlpha = pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) {
    return;
  }

  pixels[offset] = Math.round((color[0] * sourceAlpha + pixels[offset] * destAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 1] = Math.round((color[1] * sourceAlpha + pixels[offset + 1] * destAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 2] = Math.round((color[2] * sourceAlpha + pixels[offset + 2] * destAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function downsample(pixels, canvasSize, size, scale) {
  const output = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const offset = (((y * scale + sy) * canvasSize) + (x * scale + sx)) * 4;
          red += pixels[offset];
          green += pixels[offset + 1];
          blue += pixels[offset + 2];
          alpha += pixels[offset + 3];
        }
      }

      const outputOffset = (y * size + x) * 4;
      const samples = scale * scale;
      output[outputOffset] = Math.round(red / samples);
      output[outputOffset + 1] = Math.round(green / samples);
      output[outputOffset + 2] = Math.round(blue / samples);
      output[outputOffset + 3] = Math.round(alpha / samples);
    }
  }

  return output;
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const pixelOffset = (y * size + x) * 4;
      raw[offset] = pixels[pixelOffset];
      raw[offset + 1] = pixels[pixelOffset + 1];
      raw[offset + 2] = pixels[pixelOffset + 2];
      raw[offset + 3] = pixels[pixelOffset + 3];
      offset += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function renderIcns() {
  const entries = [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024]
  ];
  const chunks = [];

  for (const [type, size] of entries) {
    const png = renderPng(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

function renderIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => renderPng(size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let imageOffset = header.length + directory.length;
  for (let index = 0; index < images.length; index += 1) {
    const size = sizes[index];
    const image = images[index];
    const offset = index * 16;
    directory[offset] = size === 256 ? 0 : size;
    directory[offset + 1] = size === 256 ? 0 : size;
    directory[offset + 2] = 0;
    directory[offset + 3] = 0;
    directory.writeUInt16LE(1, offset + 4);
    directory.writeUInt16LE(32, offset + 6);
    directory.writeUInt32LE(image.length, offset + 8);
    directory.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += image.length;
  }

  return Buffer.concat([header, directory, ...images]);
}
