import fs from 'node:fs';

export function cleanupTempFiles() {
  console.log('cleanup: starting');
  console.log('cleanup: cwd =', process.cwd());
  fs.unlinkSync('./temp/cache.json');
  console.log('cleanup: removed ./temp/cache.json');
  fs.rmSync('./temp/build', { recursive: true });
  console.log('cleanup: removed ./temp/build');
  console.log('cleanup: done');
}