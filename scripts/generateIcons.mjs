import fs from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const sourceIcon = 'E:/bil音乐应用图标.png';
const assetsDir = path.resolve('assets');
const pngTarget = path.join(assetsDir, 'icon.png');
const icoTarget = path.join(assetsDir, 'icon.ico');
const sizes = [256, 128, 64, 48, 32, 16];

await fs.mkdir(assetsDir, { recursive: true });
await fs.copyFile(sourceIcon, pngTarget);

const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(sourceIcon)
      .resize(size, size, {
        fit: 'cover'
      })
      .png()
      .toBuffer()
  )
);

const icoBuffer = await pngToIco(pngBuffers);
await fs.writeFile(icoTarget, icoBuffer);

console.log(`Generated ${pngTarget}`);
console.log(`Generated ${icoTarget}`);
