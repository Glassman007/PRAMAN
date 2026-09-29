import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

// Run Vite's JS entry directly through Node.
// This avoids Windows shell/path issues when the project directory contains spaces.
const viteCli = path.join(
  root,
  'node_modules',
  'vite',
  'bin',
  'vite.js'
);

if (!existsSync(viteCli)) {
  throw new Error(
    'A real local Vite installation is required for the production build. Run `npm install` first. ' +
    'PRAMAN no longer emits the old CDN-dependent fallback dist.'
  );
}

const result = spawnSync(
  process.execPath,
  [viteCli, 'build'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(
    `Vite production build failed with exit code ${result.status}.`
  );
}

console.log(
  'Production build completed with local Vite and bundled application dependencies.'
);