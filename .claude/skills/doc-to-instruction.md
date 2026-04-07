# Skill: doc-to-instruction

## Purpose
Generate clear agent instructions from reference documents attached to a task.

## When to use
- Task has `reference_docs` set (non-null JSON array)
- Operator uses `--docs` with `/assign`
- ZIP was uploaded and extracted to docs/

## Procedure

1. **Scan reference docs**:
   - List all files in each reference path
   - Identify entry point: README.md → index.md → first .md alphabetically
   - Classify files by extension/name: spec (.md), migration (.sql), design (.png/.svg), test

2. **Read entry point**:
   - Parse for: title, summary, implementation order (numbered steps, "## Implementation order")
   - Extract key instructions

3. **Generate instruction**:

```
以下のドキュメントを読んでから実装を開始してください。

## 読む順序
1. {entry_point} — 全体像と実装順序
{for each reference doc that is not the entry point}
{N}. {doc_path} — {1-line summary based on filename/heading}
{end}

## 注意事項
{if .sql file exists in reference_docs}
- migration ファイル ({migration_path}) を先に確認・適用してください
{end}
{if test file exists}
- テストケース ({test_path}) に従ってテストを書いてください
{end}
{if design image exists}
- デザイン参考: {image_path}
{end}

## 実装順序
{if entry_point has "Implementation order" or numbered sections}
{extract and list steps}
{else}
ドキュメントの構造に従って順番に実装してください。
{end}

テストも含めて実装してください。
```

4. **Validate**:
   - Referenced files exist
   - No broken paths
   - Entry point is readable

## Notes
- This instruction enrichment is applied automatically by the server when `reference_docs` is set and a task is delivered to an agent inbox
- You can also generate the instruction manually when the operator uses `/assign --docs {path}`
