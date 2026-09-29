import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { REQUIRED_PRODUCTION_PATHS } from '../src/data/pramanDatasetConfig.js';

const root = fileURLToPath(new URL('../public/data/PRAMAN_DATA/', import.meta.url));
const output = fileURLToPath(new URL('../public/data-manifest.json', import.meta.url));

for (const relativePath of REQUIRED_PRODUCTION_PATHS) {
  if (relativePath.includes('99 Eval only')) {
    throw new Error(`Evaluation-only path is forbidden in production manifest: ${relativePath}`);
  }
  await access(join(root, relativePath));
}

const files = [...REQUIRED_PRODUCTION_PATHS];
await writeFile(output, `${JSON.stringify({ files }, null, 2)}\n`, 'utf8');
console.log(`Dataset manifest contains ${files.length} required production CSV files.`);
