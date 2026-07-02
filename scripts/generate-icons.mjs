import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const source =
  process.argv[2] ||
  path.join(root, 'scripts', 'fut-pilot-icon-source.png');

const outDir = path.join(root, 'assets', 'icons');
const sizes = [16, 48, 128];

if (!fs.existsSync(source)) {
  console.error('Source image not found:', source);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const out = path.join(outDir, `icon${size}.png`);
  await sharp(source)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log('Wrote', out);
}

console.log('Icons generated.');
