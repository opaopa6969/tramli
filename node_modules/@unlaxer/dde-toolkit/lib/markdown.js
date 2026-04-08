// markdown.js — Markdown のパースと用語リンク化
// unified + remark を使って AST を操作する

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';
import { relative, dirname, resolve } from 'path';

/**
 * テキストノードに対して用語マッチングを行い、リンクノードに置換する
 * @param {string} content - Markdown テキスト
 * @param {{ term: string, file: string, lang: string }[]} dictionary - ソート済み辞書
 * @param {string} lang - 'en' | 'ja'
 * @param {string} [sourceFile] - リンクを埋め込むファイルのパス（相対パス計算用）
 * @returns {{ content: string, changeCount: number }}
 */
export function processMarkdown(content, dictionary, lang = 'en', sourceFile = null) {
  if (!dictionary || dictionary.length === 0) {
    return { content, changeCount: 0 };
  }

  const tree = unified().use(remarkParse).parse(content);
  let changeCount = 0;

  // 段落ごとにマッチ済み用語を追跡
  // { paragraphNode → Set<term> }
  const matchedPerParagraph = new Map();

  // リンク化をスキップするノード種別
  const skipTypes = new Set(['code', 'inlineCode', 'heading', 'link', 'image']);

  // スキップ対象の祖先を持つか判定するため、祖先スタックを管理
  visit(tree, (node, index, parent) => {
    if (node.type !== 'text') return;

    // 祖先にスキップ対象があるか確認
    // unist-util-visit は祖先を直接渡さないので、
    // parent の type をチェック（link の子テキストはスキップ）
    if (parent && skipTypes.has(parent.type)) return;

    // 段落の親を特定（マッチカウント用）
    // 段落内のテキストノードは同じ paragraph 祖先を持つ
    // ここでは parent が paragraph または tableCell などを想定
    const paragraphKey = findParagraphAncestor(tree, node);

    if (!matchedPerParagraph.has(paragraphKey)) {
      matchedPerParagraph.set(paragraphKey, new Set());
    }
    const matched = matchedPerParagraph.get(paragraphKey);

    // 辞書の各用語でマッチング（最長一致順にソート済み）
    const text = node.value;
    const replacements = findReplacements(text, dictionary, matched, lang);

    if (replacements.length === 0) return;

    // テキストノードを複数ノード（text + link）に分割
    const newNodes = buildNodes(text, replacements, dictionary, sourceFile);
    if (newNodes.length === 0) return;

    // parent の children 内で node を newNodes に置換
    if (parent && Array.isArray(parent.children)) {
      const idx = parent.children.indexOf(node);
      if (idx !== -1) {
        parent.children.splice(idx, 1, ...newNodes);
        changeCount += replacements.length;
        // マッチした用語を記録
        for (const r of replacements) {
          matched.add(r.term);
        }
      }
    }
  });

  const result = unified().use(remarkStringify, {
    bullet: '-',
    fences: true,
  }).stringify(tree);

  return { content: result, changeCount };
}

/**
 * テキスト内で用語の置換箇所を検出する
 * - 段落ごとに 1 用語 1 回まで
 * - 最長一致（辞書はすでに降順ソート済み）
 * - ASCII 用語は単語境界チェックを適用（複合語内マッチを防ぐ）
 */
function findReplacements(text, dictionary, alreadyMatched, lang) {
  // 使用済み範囲を追跡（重複マッチ防止）
  const usedRanges = [];
  const replacements = [];

  for (const entry of dictionary) {
    if (entry.lang !== lang && entry.lang !== 'en') continue;
    if (alreadyMatched.has(entry.term)) continue;

    // 単語境界チェックが必要な ASCII 用語は、条件を満たす最初の出現を探す
    let idx = -1;
    const needsBoundary = isAsciiTerm(entry.term);
    let searchFrom = 0;
    while (true) {
      const found = text.indexOf(entry.term, searchFrom);
      if (found === -1) break;
      if (needsBoundary && !hasWordBoundary(text, found, found + entry.term.length)) {
        searchFrom = found + 1;
        continue;
      }
      idx = found;
      break;
    }
    if (idx === -1) continue;

    // 重複範囲チェック
    const start = idx;
    const end = idx + entry.term.length;
    const overlaps = usedRanges.some(r => start < r.end && end > r.start);
    if (overlaps) continue;

    usedRanges.push({ start, end });
    replacements.push({ term: entry.term, file: entry.file, start, end });
  }

  // 位置順にソート
  replacements.sort((a, b) => a.start - b.start);
  return replacements;
}

/**
 * 用語が ASCII 文字のみで構成されているか（日本語等は除外）
 */
function isAsciiTerm(term) {
  return /^[\x00-\x7F]+$/.test(term);
}

/**
 * text[start..end] の前後が単語文字（\w）でないか確認する
 */
function hasWordBoundary(text, start, end) {
  const wordChar = /\w/;
  if (start > 0 && wordChar.test(text[start - 1])) return false;
  if (end < text.length && wordChar.test(text[end])) return false;
  return true;
}

/**
 * テキストと置換リストから AST ノード配列を生成
 * @param {string} sourceFile - リンクを埋め込むファイルのパス（相対パス計算用）
 */
function buildNodes(text, replacements, dictionary, sourceFile = null) {
  const nodes = [];
  let cursor = 0;

  for (const r of replacements) {
    // 置換前のテキスト
    if (r.start > cursor) {
      nodes.push({ type: 'text', value: text.slice(cursor, r.start) });
    }
    // リンクURL: sourceFile がある場合は相対パスに変換
    let url = r.file;
    if (sourceFile) {
      const from = dirname(resolve(sourceFile));
      const to = resolve(r.file);
      url = relative(from, to);
      // Windows パス区切りを / に統一
      url = url.replace(/\\/g, '/');
    }
    // リンクノード
    nodes.push({
      type: 'link',
      url,
      children: [{ type: 'text', value: r.term }],
    });
    cursor = r.end;
  }

  // 残りのテキスト
  if (cursor < text.length) {
    nodes.push({ type: 'text', value: text.slice(cursor) });
  }

  return nodes;
}

/**
 * ノードが属する段落（または親ブロック）を探して識別子として返す
 * 単純に node への参照をキーとして使う
 */
function findParagraphAncestor(tree, targetNode) {
  // 段落を特定するために tree を走査
  let found = null;
  visit(tree, ['paragraph', 'tableCell', 'listItem'], (node) => {
    if (found) return;
    // このノードの子孫に targetNode があるか
    let has = false;
    visit(node, 'text', (t) => {
      if (t === targetNode) has = true;
    });
    if (has) found = node;
  });
  return found || targetNode;
}

/**
 * Markdown 内でリンクされていない用語を検出する（--check 用）
 * @returns {{ term: string, file: string, count: number }[]}
 */
export function findUnlinked(content, dictionary, lang = 'en') {
  const tree = unified().use(remarkParse).parse(content);
  const skipTypes = new Set(['code', 'inlineCode', 'heading', 'link', 'image']);
  const unlinked = new Map(); // term → { file, count }

  visit(tree, 'text', (node, index, parent) => {
    if (parent && skipTypes.has(parent.type)) return;

    for (const entry of dictionary) {
      if (entry.lang !== lang && entry.lang !== 'en') continue;
      const text = node.value;
      const needsBoundary = isAsciiTerm(entry.term);
      let found = false;
      let searchFrom = 0;
      while (true) {
        const idx = text.indexOf(entry.term, searchFrom);
        if (idx === -1) break;
        if (needsBoundary && !hasWordBoundary(text, idx, idx + entry.term.length)) {
          searchFrom = idx + 1;
          continue;
        }
        found = true;
        break;
      }
      if (found) {
        const key = entry.term;
        if (!unlinked.has(key)) {
          unlinked.set(key, { term: entry.term, file: entry.file, count: 0 });
        }
        unlinked.get(key).count++;
      }
    }
  });

  return [...unlinked.values()];
}
