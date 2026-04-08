// dictionary.js — 用語辞書の構築
// docs/glossary/ の .md ファイル名から用語を自動推定し、
// dictionary.yaml があれば上書きする

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * ファイル名（拡張子なし）から英語用語バリエーションを生成
 * jwt       → ["JWT", "jwt"]
 * multi-tenant → ["multi-tenant", "Multi-tenant", "multi tenant", "Multi tenant"]
 * session-management → ["session management", "Session management", "Session Management", "session-management", "Session-management"]
 */
export function inferTerms(slug) {
  const withSpaces = slug.replace(/-/g, ' ');
  const withHyphens = slug;

  const variants = new Set();

  // 3文字以下はすべて大文字バリエーション追加（JWT, XSS, SQL など）
  if (slug.replace(/-/g, '').length <= 3) {
    variants.add(slug.toUpperCase());
    variants.add(slug.toLowerCase());
  }

  // スペース版
  variants.add(withSpaces);
  variants.add(capitalize(withSpaces));
  variants.add(titleCase(withSpaces));

  // ハイフン版（元のまま）
  if (withHyphens !== withSpaces) {
    variants.add(withHyphens);
    variants.add(capitalize(withHyphens));
  }

  return [...variants].filter(Boolean);
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * 用語辞書を構築して返す
 * @param {string} glossaryDir - 用語集ディレクトリ（docs/glossary/ など）
 * @param {string|null} dictionaryPath - dictionary.yaml のパス
 * @param {string} lang - 'en' | 'ja'
 * @returns {{ term: string, file: string, lang: string }[]}
 */
export function buildDictionary(glossaryDir, dictionaryPath, lang = 'en') {
  const entries = [];

  // 1. glossaryDir の .md ファイルを収集（.ja.md は除外）
  if (existsSync(glossaryDir)) {
    const files = readdirSync(glossaryDir).filter(f => {
      return f.endsWith('.md') && !f.endsWith('.ja.md') && f !== 'README.md';
    });

    for (const file of files) {
      const slug = basename(file, '.md');
      const filePath = join(glossaryDir, file);
      const terms = inferTerms(slug);
      for (const term of terms) {
        entries.push({ term, file: filePath, lang: 'en' });
      }
    }
  }

  // 2. dictionary.yaml で上書き・追加
  const dictPath = dictionaryPath || join(glossaryDir, 'dictionary.yaml');
  if (existsSync(dictPath)) {
    const raw = readFileSync(dictPath, 'utf8');
    const dict = parseYaml(raw);

    for (const [filename, config] of Object.entries(dict || {})) {
      if (!config || filename === 'README.md') continue;
      const filePath = join(glossaryDir, filename);

      // 既存エントリを削除して上書き
      const idx = entries.findIndex(e => e.file === filePath);
      if (idx !== -1) {
        // そのファイルの全エントリを削除
        const toRemove = entries.filter(e => e.file === filePath);
        for (const r of toRemove) {
          entries.splice(entries.indexOf(r), 1);
        }
      }

      const enTerms = config.en || [];
      for (const term of enTerms) {
        entries.push({ term, file: filePath, lang: 'en' });
      }

      if (lang === 'ja') {
        const jaTerms = config.ja || [];
        for (const term of jaTerms) {
          // .ja.md があればそちらにリンク、なければ .md にリンク
          const jaFile = filePath.replace(/\.md$/, '.ja.md');
          const targetFile = existsSync(jaFile) ? jaFile : filePath;
          entries.push({ term, file: targetFile, lang: 'ja' });
        }
      }
    }
  }

  // 3. .ja.md の H1 から日本語用語を自動補完
  //    dictionary.yaml に ja: エントリがない .ja.md が対象（lang=ja のみ）
  if (lang === 'ja' && existsSync(glossaryDir)) {
    const jaFiles = readdirSync(glossaryDir).filter(f => f.endsWith('.ja.md') && f !== 'README.ja.md');
    for (const jaFile of jaFiles) {
      const jaFilePath = join(glossaryDir, jaFile);
      // 既に ja: エントリがあればスキップ
      if (entries.some(e => e.file === jaFilePath && e.lang === 'ja')) continue;
      // H1 から日本語用語を抽出
      try {
        const content = readFileSync(jaFilePath, 'utf8');
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (!h1Match) continue;
        const jaTerm = h1Match[1]
          .replace(/（[^）]*）/g, '')  // 全角括弧内を削除
          .replace(/\([^)]*\)/g, '')   // 半角括弧内を削除
          .trim();
        if (jaTerm) {
          entries.push({ term: jaTerm, file: jaFilePath, lang: 'ja' });
        }
      } catch {
        // 読み取り失敗は無視
      }
    }
  }

  // 4. 文字数降順ソート（最長一致のため）
  entries.sort((a, b) => b.term.length - a.term.length);

  return entries;
}
