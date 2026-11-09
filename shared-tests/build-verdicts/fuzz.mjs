import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { generate, writeCases, writeJson } from './generate.mjs';
import { verdict } from './oracle.mjs';

const [seedArg = '153', countArg = '10000'] = process.argv.slice(2);
if (!/^\d+$/.test(seedArg) || !/^[1-9]\d*$/.test(countArg)) throw new Error('Usage: node fuzz.mjs [SEED] [COUNT]');
const seed = Number(seedArg), count = Number(countArg);
const root = fileURLToPath(new URL('../../', import.meta.url));
// The corpus and every output live in our own private temporary directory.
const directory = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
const cases = generate(seed, count), input = join(directory, 'corpus.json');
writeCases(input, cases);
console.log(`Seed=${seed}, N=${count}, artifacts=${directory}`);
const commands = {
  java: ['mvn', ['-q', '-f', 'lang/java/pom.xml', '-Dtest=BuildVerdictTest', 'test'], root],
  ts: ['npm', ['test', '--workspace=lang/ts', '--', 'tests/build-verdicts.test.ts'], root],
  rust: ['cargo', ['test', '--locked', '--test', 'build_verdicts'], resolve(root, 'lang/rust')],
};
const actual = {};
for (const [language, [command, args, cwd]] of Object.entries(commands)) {
  const output = join(directory, `${language}.json`);
  const run = spawnSync(command, args, {
    cwd, env: { ...process.env, BUILD_VERDICT_CORPUS: input, BUILD_VERDICT_OUTPUT: output },
    encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(join(directory, `${language}.log`), `${run.stdout ?? ''}${run.stderr ?? ''}`);
  if (run.error || run.status !== 0) throw new Error(`${language} runner failed: ${run.error ?? run.status}; inspect ${directory}/${language}.log`);
  actual[language] = JSON.parse(readFileSync(output, 'utf8'));
  if (Object.keys(actual[language]).length !== count) throw new Error(`${language}: wrong result count`);
  console.log(`${language}: evaluated ${count} cases (including known mismatches)`);
}
const key = v => JSON.stringify([v.ok, v.errors]);
const categories = (a, b) => {
  const left = new Set(a.errors.map(JSON.stringify)), right = new Set(b.errors.map(JSON.stringify));
  const codes = new Set([...left].filter(e => !right.has(e)).concat([...right].filter(e => !left.has(e))).map(e => JSON.parse(e)[0]));
  if (a.ok !== b.ok) codes.add('OK_FAIL');
  return [...codes].sort();
};
const increment = (object, values) => values.forEach(v => { object[v] = (object[v] ?? 0) + 1; });
const summary = { seed, count, crossLanguage: { cases: 0, categories: {} }, versusSpec: {}, artifacts: directory };
for (const language of Object.keys(commands)) summary.versusSpec[language] = { cases: 0, categories: {} };
const mismatches = [];
for (const c of cases) {
  const wanted = verdict(c), results = Object.fromEntries(Object.keys(commands).map(language => [language, actual[language][c.id]]));
  for (const [language, result] of Object.entries(results)) {
    if (!result || !Array.isArray(result.errors)) throw new Error(`${language}: missing verdict for ${c.id}`);
    if (key(result) !== key(wanted)) {
      summary.versusSpec[language].cases++;
      increment(summary.versusSpec[language].categories, categories(result, wanted));
    }
  }
  if (new Set(Object.values(results).map(key)).size > 1) {
    summary.crossLanguage.cases++;
    increment(summary.crossLanguage.categories, [...new Set([
      ...categories(results.java, results.ts), ...categories(results.java, results.rust), ...categories(results.ts, results.rust),
    ])]);
  }
  if (Object.values(results).some(result => key(result) !== key(wanted))) mismatches.push({ id: c.id, family: c.family, expected: wanted, actual: results });
}
writeJson(join(directory, 'summary.json'), summary);
writeJson(join(directory, 'mismatches.json'), mismatches);
console.log(JSON.stringify(summary, null, 2));
// Differential discoveries are a failed check, while still retaining all repros.
if (mismatches.length) process.exitCode = 1;
