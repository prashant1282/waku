import fs from 'node:fs';

export function cleanupTempFiles() {
  fs.unlinkSync('./temp/cache.json');
  fs.rmSync('./temp/build', { recursive: true });
}