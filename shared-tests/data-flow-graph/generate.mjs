import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expectation } from './oracle.mjs';

export function expected(cases) {
  return Object.fromEntries(cases.map(c => [c.id, expectation(c)]));
}
// One line per case keeps review diffs readable.
export function writeExpected(path, value) {
  const lines = Object.entries(value).map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`);
  writeFileSync(path, `{\n${lines.join(',\n')}\n}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, output] = process.argv.slice(2);
  if (!corpus || !output) throw new Error('Usage: node generate.mjs CORPUS_JSON OUTPUT_JSON');
  writeExpected(output, expected(JSON.parse(readFileSync(corpus, 'utf8'))));
}
