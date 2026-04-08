#!/usr/bin/env node
// dde-install — DDE toolkit をプロジェクトにインストールする

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const TARGET = process.cwd();

const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const lang = detectLang();

function detectLang() {
  const env = process.env.LANG || process.env.LC_ALL || '';
  if (env.startsWith('en')) return 'en';
  return 'ja';
}

function cp(src, dst) {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  return true;
}

function cpDir(srcDir, dstDir) {
  if (!existsSync(srcDir)) return;
  mkdirSync(dstDir, { recursive: true });
  for (const f of readdirSync(srcDir)) {
    const src = join(srcDir, f);
    const dst = join(dstDir, f);
    cp(src, dst);
  }
}

function appendSection(filePath, section, marker, label) {
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf8');
    if (content.includes(marker)) {
      console.log(`  ${label} already has DDE section`);
      return;
    }
    writeFileSync(filePath, content + '\n' + section);
    console.log(`  ${label} updated`);
  } else {
    writeFileSync(filePath, section);
    console.log(`  ${label} created`);
  }
}

// --- agents セクション（agents-dde-section.md から読む）---
const agentsSectionPath = join(PKG_ROOT, 'agents-dde-section.md');
const AGENTS_SECTION = existsSync(agentsSectionPath)
  ? readFileSync(agentsSectionPath, 'utf8')
  : '';

// --- .cursorrules セクション ---
const CURSORRULES_SECTION = `
# DDE — Document Deficit Extraction
# https://github.com/unlaxer/dde-toolkit

When the user says "DDE して", "ドキュメントレビュー", "用語集を作って":
- Read .claude/skills/dde-session.md for instructions
- Target document: argument or README.md
- Output Gap list (A. terms / B. diagrams / C. reader gaps)
- Save to dde/sessions/
- Generate docs/glossary/<term>.md for undefined terms
- Run: npx dde-link <file>
`.trimStart();

// =============================================================================
console.log(`DDE toolkit — installing to ${TARGET} (lang=${lang})\n`);

// 1. dde/ ディレクトリをプロジェクトに展開（DGE の dge/ と同じ構造）
const ddeDir = join(TARGET, 'dde');
mkdirSync(ddeDir, { recursive: true });
console.log(`  dde/ created`);

// method.md
if (cp(join(PKG_ROOT, 'method.md'), join(ddeDir, 'method.md'))) {
  console.log(`  dde/method.md created`);
}

// flows/
const flowsSrc = join(PKG_ROOT, 'flows');
const flowsDst = join(ddeDir, 'flows');
if (existsSync(flowsSrc)) {
  cpDir(flowsSrc, flowsDst);
  console.log(`  dde/flows/ created`);
}

// templates/
const tmplSrc = join(PKG_ROOT, 'templates');
const tmplDst = join(ddeDir, 'templates');
if (existsSync(tmplSrc) && readdirSync(tmplSrc).length > 0) {
  cpDir(tmplSrc, tmplDst);
  console.log(`  dde/templates/ created`);
}

// bin/
const binSrc = join(PKG_ROOT, 'bin');
const binDst = join(ddeDir, 'bin');
mkdirSync(binDst, { recursive: true });
if (cp(join(binSrc, 'dde-tool.js'), join(binDst, 'dde-tool.js'))) {
  console.log(`  dde/bin/dde-tool.js created`);
}

// sessions/ (空ディレクトリ)
const sessionsDir = join(ddeDir, 'sessions');
if (!existsSync(sessionsDir)) {
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, '.gitkeep'), '');
  console.log(`  dde/sessions/ created`);
}

// version.txt
writeFileSync(join(ddeDir, 'version.txt'), VERSION + '\n');
console.log(`  dde/version.txt created (v${VERSION})`);

// 2. docs/glossary/
const glossaryDir = join(TARGET, 'docs', 'glossary');
if (!existsSync(glossaryDir)) {
  mkdirSync(glossaryDir, { recursive: true });
  console.log(`  docs/glossary/ created`);
} else {
  console.log(`  docs/glossary/ already exists`);
}

// 3. .claude/skills/
const skillsTarget = join(TARGET, '.claude', 'skills');
mkdirSync(skillsTarget, { recursive: true });

for (const file of ['dde-session.md', 'dde-update.md']) {
  const src = join(PKG_ROOT, 'skills', file);
  const dst = join(skillsTarget, file);
  if (cp(src, dst)) {
    console.log(`  .claude/skills/${file} created`);
  }
}

// 4. AGENTS.md
if (AGENTS_SECTION) {
  appendSection(join(TARGET, 'AGENTS.md'), AGENTS_SECTION, '## DDE —', 'AGENTS.md');
}

// 5. GEMINI.md
if (AGENTS_SECTION) {
  appendSection(join(TARGET, 'GEMINI.md'), AGENTS_SECTION, '## DDE —', 'GEMINI.md');
}

// 6. .cursorrules
appendSection(join(TARGET, '.cursorrules'), CURSORRULES_SECTION, '# DDE —', '.cursorrules');

// =============================================================================
console.log(`\nDone! DDE toolkit is ready. (v${VERSION}, lang=${lang})`);
console.log(`\n  Claude Code で「DDE して」と言えば起動します。`);
console.log(`  Codex (AGENTS.md), Gemini CLI (GEMINI.md), Cursor (.cursorrules) にも対応。`);
console.log(`  Try: "README.md を DDE して"`);
console.log(`\nMIT License.`);
