<!-- DDE-toolkit (MIT License) -->

# Skill: DDE toolkit アップデート

## Trigger
ユーザーが以下のいずれかを言ったとき:
- 「DDE を更新して」
- 「DDE をアップデートして」
- 「dde update」

## 手順

### Step 1: 現在のバージョンを確認
`dde/version.txt` を読んでローカルバージョンを表示する。
ファイルがなければ「バージョン情報がありません（古いインストールです）」と表示。

### Step 2: 更新元を特定

`node_modules/@unlaxer/dde-toolkit/package.json` の version と `dde/version.txt` を比較:

```
現在: v0.1.0
更新元: v0.2.0
```

npm install されていなければ `npm update @unlaxer/dde-toolkit` の手順を案内する。

### Step 3: 更新内容を説明してユーザーに確認

```
以下の toolkit ファイルが上書きされます:
- dde/method.md
- dde/flows/*.yaml
- dde/templates/*.md
- dde/bin/*
- dde/version.txt
- .claude/skills/dde-session.md
- .claude/skills/dde-update.md

以下は触りません:
- docs/glossary/（あなたの用語集記事）
- dde/sessions/（あなたの DDE session 出力）

更新しますか？
```

**ユーザーの確認を待つ。勝手に上書きしない。**

### Step 4: 更新を実行

```bash
npx dde-install
```

### Step 5: 結果を報告

```
DDE toolkit を v<新バージョン> に更新しました。
docs/glossary/ と dde/sessions/ は変更されていません。
```

## MUST ルール
1. **更新前に必ずユーザーの確認を得る。**
2. **docs/glossary/ と dde/sessions/ には絶対に触らない。**
