#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [mode, version] = process.argv.slice(2);

if (!['--check', '--write'].includes(mode) || !version) {
  console.error('Usage: node scripts/set-core-version.mjs (--check|--write) <version>');
  process.exit(2);
}

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid SemVer: ${version}`);
  process.exit(2);
}

const files = {
  tsPackage: 'lang/ts/package.json',
  tsLock: 'lang/ts/package-lock.json',
  rustManifest: 'lang/rust/Cargo.toml',
  rustLock: 'lang/rust/Cargo.lock',
  javaPom: 'lang/java/pom.xml',
  javaBom: 'lang/java-bom/pom.xml',
};

function replaceOnce(text, pattern, replacement, file) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = text.match(new RegExp(pattern.source, flags));
  if (matches?.length !== 1) {
    throw new Error(`${file}: expected one version location, found ${matches?.length ?? 0}`);
  }
  return text.replace(pattern, replacement);
}

async function load(file) {
  return readFile(resolve(root, file), 'utf8');
}

async function expectedContents() {
  let tsPackage = await load(files.tsPackage);
  tsPackage = replaceOnce(
    tsPackage,
    /("name": "@unlaxer\/tramli",\n\s*"version": ")[^"]+(")/,
    '$1' + version + '$2',
    files.tsPackage,
  );

  let tsLock = await load(files.tsLock);
  tsLock = replaceOnce(
    tsLock,
    /^(\s{2}"version": ")[^"]+(",)$/m,
    '$1' + version + '$2',
    files.tsLock,
  );
  tsLock = replaceOnce(
    tsLock,
    /("": \{\n\s*"name": "@unlaxer\/tramli",\n\s*"version": ")[^"]+(")/,
    '$1' + version + '$2',
    files.tsLock,
  );

  let rustManifest = await load(files.rustManifest);
  rustManifest = replaceOnce(
    rustManifest,
    /(\[package\][\s\S]*?\nversion = ")[^"]+("\n)/,
    `$1${version}$2`,
    files.rustManifest,
  );

  let rustLock = await load(files.rustLock);
  rustLock = replaceOnce(
    rustLock,
    /(\[\[package\]\]\nname = "tramli"\nversion = ")[^"]+("\n)/,
    `$1${version}$2`,
    files.rustLock,
  );

  let javaPom = await load(files.javaPom);
  javaPom = replaceOnce(
    javaPom,
    /(<artifactId>tramli<\/artifactId>\s*<version>)[^<]+(<\/version>)/,
    `$1${version}$2`,
    files.javaPom,
  );

  let javaBom = await load(files.javaBom);
  javaBom = replaceOnce(
    javaBom,
    /(<artifactId>tramli-bom<\/artifactId>\s*<version>)[^<]+(<\/version>)/,
    `$1${version}$2`,
    files.javaBom,
  );
  javaBom = replaceOnce(
    javaBom,
    /(<artifactId>tramli<\/artifactId>\s*<version>)[^<]+(<\/version>)/,
    `$1${version}$2`,
    files.javaBom,
  );

  return new Map([
    [files.tsPackage, tsPackage],
    [files.tsLock, tsLock],
    [files.rustManifest, rustManifest],
    [files.rustLock, rustLock],
    [files.javaPom, javaPom],
    [files.javaBom, javaBom],
  ]);
}

try {
  const expected = await expectedContents();
  const mismatches = [];

  for (const [file, contents] of expected) {
    if (mode === '--write') {
      await writeFile(resolve(root, file), contents);
    } else if ((await load(file)) !== contents) {
      mismatches.push(file);
    }
  }

  if (mismatches.length > 0) {
    console.error(`Core version is not ${version}: ${mismatches.join(', ')}`);
    process.exit(1);
  }

  console.log(`${mode === '--write' ? 'Set' : 'Verified'} core version ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
