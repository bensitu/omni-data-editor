import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { run } from './process.mjs';

const { values } = parseArgs({
  options: { base: { type: 'string', default: '/omni-data-editor/' } },
});
const base = values.base;
if (!/^\/(?:[a-zA-Z0-9._-]+\/)*$/.test(base))
  throw new Error('Use an absolute URL base ending with a slash.');
const examplesBase = `${base}examples/`;
const env = {
  ...process.env,
  OMNIDATAEDITOR_DOCS_BASE: base,
  OMNIDATAEDITOR_EXAMPLES_BASE: examplesBase,
};
for (const script of ['build', 'docs:api', 'docs:build', 'build:examples'])
  run('pnpm', ['run', script], undefined, { env });
const root = await realpath('.');
const output = join(root, 'dist', 'site');
if (dirname(output) !== (await realpath('dist')))
  throw new Error('The site output must remain inside this workspace.');
try {
  if ((await lstat(output)).isSymbolicLink())
    throw new Error('The site output must not be a symbolic link.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve('docs/.vitepress/dist'), output, { recursive: true });
const examplesOutput = join(output, 'examples');
await cp(resolve('dist/examples'), examplesOutput, { recursive: true });
async function rewriteExampleLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteExampleLinks(path);
    else if (entry.name.endsWith('.html')) {
      const source = await readFile(path, 'utf8');
      const rewritten = source.replace(
        /\b(href|src)="\/(?!\/)([^"]*)"/g,
        (match, attribute, target) => {
          if (`/${target}`.startsWith(examplesBase)) return match;
          return `${attribute}="${examplesBase}${target}"`;
        },
      );
      await writeFile(path, rewritten);
    }
  }
}
await rewriteExampleLinks(examplesOutput);
await writeFile(join(output, '.nojekyll'), '');
console.log(
  `Documentation and examples are ready in ${output} with URL base ${base}.`,
);
