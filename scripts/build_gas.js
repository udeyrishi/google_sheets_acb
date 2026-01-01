import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const entryFile = path.join(rootDir, 'src', 'main.ts');
const outFile = path.join(rootDir, 'build', 'Code.gs');

const GLOBAL_NAME = '_ALL_EXPORTS';

const result = await build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'iife',
  globalName: GLOBAL_NAME,
  target: 'es2019',
  platform: 'browser',
  tsconfig: path.join(rootDir, 'tsconfig.json'),
  outfile: outFile,
  metafile: true,
  write: false,
});

const output = result.outputFiles.find((file) => file.path === outFile) || result.outputFiles[0];
if (!output) {
  throw new Error('esbuild did not produce any output files.');
}

function isExported(stmt) {
  return Boolean(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function collectExportedFunctionOrClass(names, stmt) {
  if (!isExported(stmt) || !stmt.name) return;
  names.add(stmt.name.text);
}

function collectExportedVariables(names, stmt) {
  if (!isExported(stmt)) return;
  for (const decl of stmt.declarationList.declarations) {
    if (ts.isIdentifier(decl.name)) {
      names.add(decl.name.text);
    }
  }
}

function collectExportedNamedBindings(names, stmt) {
  if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) return;
  for (const elem of stmt.exportClause.elements) {
    names.add(elem.name.text);
  }
}

function getExportedNames(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ESNext, true);
  const names = new Set();

  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      collectExportedFunctionOrClass(names, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      collectExportedVariables(names, stmt);
    } else if (ts.isExportDeclaration(stmt)) {
      collectExportedNamedBindings(names, stmt);
    }
  }

  return [...names];
}

const exportList = getExportedNames(entryFile);
if (exportList.length === 0) {
  throw new Error('No exports found from entrypoint; wrappers would be empty.');
}

const wrappers = exportList
  .map((name) => {
    return `function ${name}() { return ${GLOBAL_NAME}.${name}.apply(this, arguments); }`;
  })
  .join('\n');

const wrapperExplanation = `
// Google Apps Script automatically exposes all functions declared at this global scope as callable, custom, Google Sheets functions. This
// declaration needs to be static; any dynamic additions to the global 'this' doesn't seem to expose the corresponding functions to Google Sheets. Hence, this following block 
// that exposes the callable APIs statically.
`;

const gasContent = `${output.text}\n${wrapperExplanation}\n${wrappers}\n`;
await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
await fs.promises.writeFile(outFile, gasContent, 'utf8');
