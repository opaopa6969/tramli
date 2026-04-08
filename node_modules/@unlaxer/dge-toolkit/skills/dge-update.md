<!-- DGE-toolkit (MIT License) — https://github.com/xxx/DGE-toolkit -->

# Skill: DGE toolkit アップデート

## Trigger
ユーザーが以下のいずれかを言ったとき:
- 「DGE を更新して」
- 「DGE をアップデートして」
- 「dge update」

## 手順

### Step 1: 現在のバージョンを確認
`dge/version.txt` を読んでローカルバージョンを表示する。
ファイルがなければ「バージョン情報がありません（v1.0.0 以前のインストールです）」と表示。

### Step 2: 更新元を特定
以下の優先順で更新元を探す:
1. `node_modules/@unlaxer/dge-toolkit/version.txt` — npm install 済みの場合
2. ユーザーに更新元のパスを聞く — npm を使っていない場合

npm の場合は `node_modules/@unlaxer/dge-toolkit/version.txt` と `dge/version.txt` を比較して表示:
```
現在: v1.0.0
更新元: v1.2.0
```

### Step 3: 更新内容を説明
以下を表示してユーザーに確認する:

```
以下の toolkit ファイルが上書きされます:
- dge/method.md
- dge/characters/*.md
- dge/templates/*.md
- dge/flows/*.yaml
- kit/templates/*.md
- dge/patterns.md
- dge/integration-guide.md
- dge/INTERNALS.md
- dge/CUSTOMIZING.md
- dge/dialogue-techniques.md
- dge/bin/*
- dge/README.md, LICENSE, version.txt
- .claude/skills/dge-session.md
- .claude/skills/dge-update.md
- .claude/skills/dge-character-create.md

以下は触りません:
- dge/sessions/（あなたの DGE session 出力）
- dge/decisions/（あなたの設計判断 DD 出力）
- dge/custom/（あなたのカスタムファイル）

更新しますか？
```

**ユーザーの確認を待つ。**

### Step 4: 更新を実行
ユーザーが承認したら:

npm の場合:
```bash
npx dge-update
```

手動の場合:
toolkit ファイルのみを手動で上書きコピーする手順を案内する。

### Step 5: 結果を報告
```
DGE toolkit を v[新バージョン] に更新しました。
sessions/ と custom/ は変更されていません。
```

## MUST ルール
1. **更新前に必ずユーザーの確認を得る。** 勝手に上書きしない。
2. **sessions/ と custom/ には絶対に触らない。**
3. **更新元が見つからない場合は npm update の手順を案内する。**

## 設計判断 (DD) の管理

セッション外から DD を追加・修正したい場合もこのスキルで対応する。

### DD の追加（セッション外）
ユーザーが「DD を追加して」「設計判断を記録したい」と言ったとき:
1. `kit/templates/decision.md` のテンプレートに沿って DD を作成
2. 紐づくセッションファイルを聞く（任意）
3. `dge/decisions/` を glob して採番（DD-NNN、最大番号 + 1）
4. DD ファイルを保存
5. セッションファイルがあれば `**Decisions:**` リストに逆リンクを追記
6. `dge/decisions/index.md` を再生成

### DD の Supersede（方針転換）
ユーザーが「DD-NNN を置き換えて」「方針変更」と言ったとき:
1. 新しい DD を作成（上記の手順）
2. 新 DD に `**Supersedes:** DD-NNN` を記入
3. 旧 DD に `**Superseded by:** DD-NNN` を追記
4. index を再生成

### DD の index 再生成
`dge/decisions/index.md` が壊れた・古い場合:
1. `dge/decisions/DD-*.md` を全件読む
2. index テーブルを再生成（DD 番号、タイトル、セッションリンク、日付、Superseded 状態）

## 注意
- このスキルは DGE session とは独立。session 中に update を提案しない。
- npm を使っていないユーザーには手動コピーの手順を案内する。
- DD の追加・修正は `dge/decisions/` と `dge/sessions/` のみに影響する。プロジェクトコードは変更しない。
