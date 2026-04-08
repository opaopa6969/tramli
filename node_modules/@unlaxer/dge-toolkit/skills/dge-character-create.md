<!-- DGE-toolkit (MIT License) -->

# Skill: DGE カスタムキャラクター作成

## Trigger
ユーザーが以下のいずれかを言ったとき:
- 「キャラを追加して」
- 「[キャラ名]を追加して」（例: 「ガッツを追加して」）
- 「オリジナルキャラを作りたい」
- 「DGE キャラを作って」

## モード判定
- キャラ名 + 出典が含まれる → **名指しモード**
- 含まれない or 「オリジナル」→ **wizard モード**

---

## 名指しモード

### Step 1: キャラ分析
ユーザーが指定したキャラ名と出典を元に LLM が分析:

1. **axes ベクトル** を推定（0.0-1.0）:
   - decision_speed, risk_tolerance, delegation_level, quality_obsession, simplicity_preference
   - communication (enum), conflict_resolution (enum)

2. **Prompt Core** を生成（3-5 行の LLM 指示）

3. **Personality** を抽出:
   - 価値観（2-3 項目）
   - 口癖・名言（3-5 個）
   - コミュニケーションスタイル（3-4 行）
   - 判断基準（2-3 項目）

4. **Backstory** を抽出:
   - 背景（2-3 行）
   - 成長弧（1 行: A → B → C）
   - トラウマ（1-3 項目、各 1 行で「→ DGE でどう効くか」付き）
   - DGE での効果（どんな場面で特に力を発揮するか）

5. **Weakness**（2-4 項目）

6. **既存キャラとの類似比較**（最も似ているキャラ 1-2 名 + 違い）

### Step 2: 確認画面を表示

```
[icon] [name]（[source]）
Archetype: [archetype]

axes:
  decision_speed: X.XX   [説明]
  risk_tolerance: X.XX   [説明]
  ...

名言:
  - 「...」
  - 「...」

⚠️ 類似: [既存キャラ名] と似た axis
  違い: [1 行で違いを説明]

このキャラクターでいいですか？
1. OK → 保存
2. 調整（自然言語で指示: "もっと慎重にして" 等）
3. 数値直指定（上級者: axes を直接変更）
4. やり直す
```

**MUST: 確認なしで保存しない。必ずユーザーの OK を得る。**

### Step 3: 調整（選択肢 2 or 3 の場合）

**自然言語調整**: 「もっと慎重にして」→ LLM が axes を再計算して再表示
**数値直指定**: ユーザーが `decision_speed: 0.60` のように指定 → 反映して再表示

調整後に再度確認画面。OK が出るまでループ。

### Step 4: 保存

`dge/custom/characters/{name}.md` に保存:

```markdown
---
name: [name]
source: [source（作者）]
archetype: [archetype_id]
icon: [emoji]
created: YYYY-MM-DD
axes:
  decision_speed: X.XX
  risk_tolerance: X.XX
  delegation_level: X.XX
  quality_obsession: X.XX
  simplicity_preference: X.XX
  communication: [enum]
  conflict_resolution: [enum]
---

# [icon] [name]（[source]）

## Prompt Core
[3-5 行]

## Personality
### 価値観
- ...
### 口癖・名言
- 「...」
### コミュニケーションスタイル
...
### 判断基準
- ...

## Backstory
### 背景
...
### 成長弧
[A → B → C]
### トラウマ
- [トラウマ]（→ [DGE での効果]）
### DGE での効果
...

## Weakness
- ...

## Similar Characters
- [キャラ名] — 似: ... / 違: ...
```

保存後: 「[icon] [name] を保存しました。次の DGE session のキャラ選択に表示されます。」

---

## wizard モード

### Step 1: 基本質問（MUST: 最低 3 問）

```
オリジナルキャラクターを作りましょう。いくつか質問します。

1. このキャラの名前は？
2. どんな場面で活躍しますか？（例: コードレビュー、戦略会議、ユーザー面談）
3. 性格の核を一言で？（例: 慎重、熱血、皮肉屋、楽観的）
```

### Step 2: 追加質問（オプション）

基本質問の後:
```
もっと掘り下げますか？
1. はい、もっと聞いて → 追加質問へ
2. もう十分 → 生成へ
```

追加質問プール（ユーザーが「もう十分」と言うまで 1-2 問ずつ出す）:
- 判断は早い方？慎重な方？
- リスクを取るタイプ？安全策を好む？
- 他の人に任せる？自分でやる？
- 口癖や決め台詞はありますか？
- 怒るとどうなりますか？
- 褒めるときはどう褒めますか？
- チームで孤立しやすい？それとも中心にいる？
- 技術的にこだわるポイントは？
- 苦手なこと、弱点は？
- 似ている有名キャラはいますか？（任意）

### Step 3: 生成 → 確認 → 保存

名指しモードの Step 2-4 と同じ。確認画面 → 調整 → OK → 保存。

---

## カスタムキャラの管理

### 一覧表示
「キャラ一覧を見せて」→ built-in 12 キャラ + custom キャラを表示

### 削除
「[キャラ名]を削除して」→ 確認 → `dge/custom/characters/{name}.md` を削除

### 編集
「[キャラ名]を編集して」→ 現在の内容を表示 → 自然言語で調整 → 再保存

---

## 読み込みルール（dge-session.md との連携）

dge-session.md の Step 1 で:
1. `dge/characters/catalog.md` を読む（built-in）
2. `dge/custom/characters/*.md` があれば各ファイルの Prompt Core セクションだけ読む

Step 4 のキャラ選択で:
```
--- built-in ---
👤 今泉  🎩 千石  ☕ ヤン  😰 僕  👑 ラインハルト  ...
--- カスタム ---
⚔ ガッツ  🔧 田中先輩

推奨: 今泉 + 千石 + ガッツ
変更しますか？
```

選択されたキャラの Personality セクションを追加読み込み。
ユーザーが「深い議論にして」と言った場合のみ Backstory も読み込む。
