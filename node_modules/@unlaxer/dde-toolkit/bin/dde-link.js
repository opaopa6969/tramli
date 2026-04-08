#!/usr/bin/env node
// dde-link CLI — Markdown ファイルに用語リンクを自動付与する

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { link } from '../lib/linker.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    check:      { type: 'boolean', default: false },
    fix:        { type: 'boolean', default: false },
    'dry-run':  { type: 'boolean', default: false },
    glossary:   { type: 'string' },
    lang:       { type: 'string', default: 'auto' },
    dictionary: { type: 'string' },
    help:       { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`
Usage: dde-link <file> [options]

Options:
  --check       リンク漏れを検出（exit code 1 で失敗）
  --fix         ファイルを上書き（デフォルト動作）
  --dry-run     変更プレビュー（stdout に diff 出力）
  --glossary    用語集ディレクトリ（デフォルト: docs/glossary/）
  --lang        言語: auto / en / ja（デフォルト: auto）
  --dictionary  辞書ファイルパス（デフォルト: docs/glossary/dictionary.yaml）
  -h, --help    このヘルプを表示
  `.trim());
  process.exit(0);
}

const filePath = resolve(positionals[0]);

try {
  const result = link(filePath, {
    glossaryDir:    values.glossary   ? resolve(values.glossary) : undefined,
    dictionaryPath: values.dictionary ? resolve(values.dictionary) : undefined,
    lang:           values.lang,
    check:          values.check,
    dryRun:         values['dry-run'],
  });

  if (values.check) {
    if (result.unlinked.length === 0) {
      console.log('✓ リンク漏れなし');
      process.exit(0);
    } else {
      console.log(`リンク漏れ: ${result.unlinked.length} 件`);
      for (const u of result.unlinked) {
        console.log(`  "${u.term}" (${u.count} 箇所)`);
      }
      process.exit(1);
    }
  }

  if (values['dry-run']) {
    if (result.changeCount === 0) {
      console.log('変更なし');
    } else {
      console.log(`変更予定: ${result.changeCount} 件\n`);
      console.log(result.diff);
    }
    process.exit(0);
  }

  // --fix or default
  if (result.changeCount === 0) {
    console.log('変更なし');
  } else {
    console.log(`${result.changeCount} 件のリンクを追加しました: ${filePath}`);
  }
  process.exit(0);

} catch (err) {
  console.error(`エラー: ${err.message}`);
  process.exit(1);
}
