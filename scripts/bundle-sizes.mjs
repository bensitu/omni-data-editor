import { build } from 'vite';
import { gzipSync } from 'node:zlib';
for (const [name, budget] of [
  ['core', 15 * 1024],
  ['editor', 45 * 1024],
]) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: `packages/${name}/src/index.ts`, formats: ['es'] },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((item) => item.output)
    .filter((item) => item.type === 'chunk');
  const size = gzipSync(chunks.map((chunk) => chunk.code).join('\n')).length;
  console.log(
    `${name}: ${(size / 1024).toFixed(2)} KiB minified gzip; budget ${(budget / 1024).toFixed(0)} KiB.`,
  );
  if (size > budget) throw new Error(`${name} exceeds its bundle budget.`);
}
