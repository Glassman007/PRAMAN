import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

async function loadTypeScript() {
  try {
    const local = await import('typescript');
    return local.default ?? local;
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const globalModule = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (!existsSync(globalModule)) throw new Error('TypeScript compiler is unavailable for source verification.');
    const loaded = await import(pathToFileURL(globalModule).href);
    return loaded.default ?? loaded;
  }
}

async function collectSourceFiles(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(full, output);
    else if (/\.(?:js|jsx)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function findImportSpecifiers(source) {
  return [...source.matchAll(/(?:import\s+(?:[^'\"]+?\s+from\s+)?|export\s+[^'\"]+?\s+from\s+)[\"']([^\"']+)[\"']/g)]
    .map((match) => match[1]);
}

function resolveLocalImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.css`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const ts = await loadTypeScript();
const files = await collectSourceFiles(srcRoot);
const diagnostics = [];
const allowedExternalImports = new Set(['react', 'react-dom/client']);

for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  for (const specifier of findImportSpecifiers(source)) {
    if (specifier.startsWith('.')) {
      if (!resolveLocalImport(file, specifier)) diagnostics.push(`${path.relative(root, file)}: unresolved local import ${specifier}`);
    } else if (!allowedExternalImports.has(specifier)) {
      diagnostics.push(`${path.relative(root, file)}: unexpected external import ${specifier}`);
    }
  }

  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: false,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      diagnostics.push(`${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    }
  }
}

if (diagnostics.length) {
  console.error(`Source compilation/import verification failed (${diagnostics.length}):`);
  diagnostics.forEach((diagnostic) => console.error(`- ${diagnostic}`));
  process.exit(1);
}

console.log(`Source compilation/import verification passed for ${files.length} application module(s).`);
console.log('No CDN fallback or generated mock dataset was required.');
