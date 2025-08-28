import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAI+G2l8AAAAASUVORK5CYII='; // 1x1 transparent PNG

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function writePng(filePath) {
  await ensureDir(filePath);
  const buf = Buffer.from(base64Png, 'base64');
  await writeFile(filePath, buf);
}

async function main() {
  const root = resolve(process.cwd());
  await Promise.all([
    writePng(resolve(root, 'public/icon16.png')),
    writePng(resolve(root, 'public/icon48.png')),
    writePng(resolve(root, 'public/icon128.png'))
  ]);
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
