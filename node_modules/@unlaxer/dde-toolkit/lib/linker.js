// linker.js — dde-link のオーケストレーター
// dictionary + markdown を組み合わせてリンク処理を実行する

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { buildDictionary } from './dictionary.js';
import { processMarkdown, findUnlinked } from './markdown.js';

/**
 * ファイルの言語を検出する
 * .ja.md → 'ja', それ以外 → 'en'
 */
export function detectLang(filePath, forceLang = 'auto') {
  if (forceLang && forceLang !== 'auto') return forceLang;
  return filePath.endsWith('.ja.md') ? 'ja' : 'en';
}

/**
 * テキスト diff を生成（シンプルな行単位）
 */
function createDiff(original, modified) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const lines = [];
  const maxLen = Math.max(origLines.length, modLines.length);

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const m = modLines[i];
    if (o === m) {
      lines.push(`  ${o ?? ''}`);
    } else {
      if (o !== undefined) lines.push(`- ${o}`);
      if (m !== undefined) lines.push(`+ ${m}`);
    }
  }
  return lines.join('\n');
}

/**
 * メイン処理
 * @param {string} filePath - 対象 Markdown ファイルのパス
 * @param {object} options
 * @param {string} [options.glossaryDir] - 用語集ディレクトリ
 * @param {string} [options.dictionaryPath] - dictionary.yaml のパス
 * @param {string} [options.lang] - 'auto' | 'en' | 'ja'
 * @param {boolean} [options.check] - リンク漏れ検出モード
 * @param {boolean} [options.dryRun] - diff プレビューモード
 * @returns {{ changeCount: number, unlinked?: any[], diff?: string }}
 */
export function link(filePath, options = {}) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const lang = detectLang(filePath, options.lang);

  // glossaryDir のデフォルト: ファイルから見て docs/glossary/
  // または CWD からの docs/glossary/
  const glossaryDir = options.glossaryDir
    || findGlossaryDir(filePath)
    || join(process.cwd(), 'docs', 'glossary');

  const dictionaryPath = options.dictionaryPath
    || join(glossaryDir, 'dictionary.yaml');

  const dict = buildDictionary(glossaryDir, dictionaryPath, lang);
  const original = readFileSync(filePath, 'utf8');

  if (options.check) {
    const unlinked = findUnlinked(original, dict, lang);
    return { changeCount: unlinked.length, unlinked };
  }

  const { content, changeCount } = processMarkdown(original, dict, lang, filePath);

  if (options.dryRun) {
    const diff = createDiff(original, content);
    return { changeCount, diff };
  }

  // ファイル上書き
  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
  }

  return { changeCount };
}

/**
 * ファイルパスから docs/glossary/ を探す
 * 親ディレクトリを辿って docs/glossary/ が見つかれば返す
 */
function findGlossaryDir(filePath) {
  let dir = dirname(filePath);
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'docs', 'glossary');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
