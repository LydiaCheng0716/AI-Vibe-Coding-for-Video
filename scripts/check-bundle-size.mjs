import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Current main JS chunk is about 79,084 bytes gzip. 95 KB leaves roughly 18 KB
// of headroom while still catching accidental dependency or bundle bloat.
const MAX_TOTAL_GZIP_BYTES = 95 * 1024;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(rootDir, 'dist', 'assets');

const formatBytes = (bytes) => `${bytes} bytes (${(bytes / 1024).toFixed(2)} KiB)`;

if (!existsSync(assetsDir)) {
  console.error(`Bundle size check failed: ${assetsDir} does not exist.`);
  console.error('Run `npm run build` before `npm run check:bundle`.');
  process.exit(1);
}

const jsFiles = readdirSync(assetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort();

if (jsFiles.length === 0) {
  console.error(`Bundle size check failed: no .js files found in ${assetsDir}.`);
  console.error('Run `npm run build` before `npm run check:bundle`.');
  process.exit(1);
}

const sizes = jsFiles.map((fileName) => {
  const filePath = join(assetsDir, fileName);
  const raw = readFileSync(filePath);
  const gzipBytes = gzipSync(raw).byteLength;

  return {
    fileName,
    rawBytes: raw.byteLength,
    gzipBytes,
  };
});

const totalGzipBytes = sizes.reduce((sum, file) => sum + file.gzipBytes, 0);

console.log('Bundle gzip sizes:');
for (const file of sizes) {
  console.log(`- ${file.fileName}: gzip ${formatBytes(file.gzipBytes)}, raw ${formatBytes(file.rawBytes)}`);
}
console.log(`Total JS gzip: ${formatBytes(totalGzipBytes)} / limit ${formatBytes(MAX_TOTAL_GZIP_BYTES)}`);

if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES) {
  console.error(
    `Bundle size check failed: total JS gzip exceeds limit by ${formatBytes(
      totalGzipBytes - MAX_TOTAL_GZIP_BYTES,
    )}.`,
  );
  process.exit(1);
}
