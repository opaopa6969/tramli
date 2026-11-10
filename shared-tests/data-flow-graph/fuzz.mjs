import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { generate, writeCases, writeJson } from '../build-verdicts/generate.mjs';
import { differences, expectation } from './oracle.mjs';

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
  java: ['mvn', ['-q', '-f', 'lang/java/pom.xml', '-Dtest=BuildVerdictTest#sharedDataFlowGraphs', 'test'], root],
  ts: ['npm', ['test', '--', 'tests/build-verdicts.test.ts', '-t', 'shared data-flow graph availability'], resolve(root, 'lang/ts')],
  rust: ['cargo', ['test', '--locked', '--test', 'build_verdicts', 'shared_data_flow_graphs'], resolve(root, 'lang/rust')],
};
const actual = {};
for (const [language, [command, args, cwd]] of Object.entries(commands)) {
  const output = join(directory, `${language}.json`);
  const run = spawnSync(command, args, {
    cwd, env: { ...process.env, DATA_FLOW_GRAPH_CORPUS: input, DATA_FLOW_GRAPH_OUTPUT: output },
    encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(join(directory, `${language}.log`), `${run.stdout ?? ''}${run.stderr ?? ''}`);
  if (run.error || run.status !== 0) throw new Error(`${language} runner failed: ${run.error ?? run.status}; inspect ${directory}/${language}.log`);
  actual[language] = JSON.parse(readFileSync(output, 'utf8'));
  if (Object.keys(actual[language]).length !== count) throw new Error(`${language}: wrong result count`);
  console.log(`${language}: evaluated ${count} cases`);
}
// Languages serialize keys in different orders; compare a canonical form.
const key = r => JSON.stringify([r.builds, Object.entries(r.available ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))]);
const increment = (object, values) => values.forEach(v => { object[v] = (object[v] ?? 0) + 1; });
const summary = { seed, count, probeBuilds: 0, crossLanguage: { compared: 0, cases: 0 }, versusSpec: {}, artifacts: directory };
for (const language of Object.keys(commands)) summary.versusSpec[language] = { compared: 0, cases: 0, categories: {} };
const mismatches = [];
for (const c of cases) {
  const wanted = expectation(c), results = Object.fromEntries(Object.keys(commands).map(language => [language, actual[language][c.id]]));
  if (wanted.builds) summary.probeBuilds++;
  const differing = {};
  for (const [language, result] of Object.entries(results)) {
    if (!result || typeof result.builds !== 'boolean') throw new Error(`${language}: missing result for ${c.id}`);
    if (result.available) summary.versusSpec[language].compared++;
    const found = differences(result, wanted);
    if (found.length) {
      differing[language] = found;
      summary.versusSpec[language].cases++;
      increment(summary.versusSpec[language].categories, found);
    }
  }
  // Cross-language agreement is only meaningful where every language exposes a graph.
  if (Object.values(results).every(r => r.available)) {
    summary.crossLanguage.compared++;
    if (new Set(Object.values(results).map(key)).size > 1) summary.crossLanguage.cases++;
  }
  if (Object.keys(differing).length) mismatches.push({ id: c.id, family: c.family, differing, expected: wanted, actual: results });
}
writeJson(join(directory, 'summary.json'), summary);
writeJson(join(directory, 'mismatches.json'), mismatches);
console.log(JSON.stringify(summary, null, 2));
// Differential discoveries are a failed check, while still retaining all repros.
if (mismatches.length) process.exitCode = 1;
