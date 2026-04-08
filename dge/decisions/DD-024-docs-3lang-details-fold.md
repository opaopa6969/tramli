---
status: accepted
---

# DD-024: Documentation — 3 Language Code Examples with `<details>` Fold

**Date:** 2026-04-09

## Decision

ドキュメント（OIDC例、チュートリアル等）でコード例を示す際、`<details>` タグで 3 言語を折りたたみ表示にする。README は分割せず 1 ファイルに統合。

## Context

- 3 言語（Java/TS/Rust）のコード例がドキュメントに必要
- README を ja/en × java/ts/rust の 6 ファイルに分割する案もあった
- ユーザー判断: 「あー折りたたむね」→ `<details>` 方式を採用

## Format

```markdown
<details open><summary><b>Java</b></summary>

\```java
// Java code
\```
</details>

<details><summary><b>TypeScript</b></summary>

\```typescript
// TS code
\```
</details>

<details><summary><b>Rust</b></summary>

\```rust
// Rust code
\```
</details>
```

- 最初の言語（Java）は `open` で展開済み
- 他の言語は折りたたまれた状態
- GitHub Markdown で正しくレンダリングされる

## Scope

- **README.md / README-ja.md** — 全コード例を 3 言語折りたたみに
- **OIDC 認証フロー例** (en/ja) — プラグイン拡張セクション（8.1〜8.7）を追加、3 言語折りたたみ
- **チュートリアル** — 既に TS で記述済み（Java/Rust は今後必要に応じて追加）

## Rejected Alternative

README を 6 ファイル（ja/en × java/ts/rust）に分割 → 重複管理コストが高すぎる
