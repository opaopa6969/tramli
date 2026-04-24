# DGE Session: tramli DataFlow 特化モード — 通信プログラムの表現と明示的ステートの要否

**Decisions:**
- [DD-042](../decisions/DD-042-tramli-exemplar-completion.md) — tramli は state-machine + data-flow の exemplar として完結

- **Date**: 2026-04-24
- **Flow**: 💡 brainstorm
- **Structure**: 🏥 consult（症例検討）
- **Characters**: ☕ ヤン, 👤 今泉, ⚔ リヴァイ, 🎩 千石, 🔬 ハレル教授
- **Facilitator**: Opa

---

## 症例カルテ

> tramli の DataFlowGraph は、ステートマシンの派生物として型付きデータの依存関係を自動抽出する。
> 利用者から提案：**明示的なステートを持たない「DataFlow 特化モード」**を入れて、
> 通信プログラム（長寿命・並列・再入）の表現にも使えるようにしたい。
>
> 症状: 現行 API は状態遷移が前提。ReactiveFlow 的用途に使おうとすると「状態を1個でっち上げる」形になる。
> 主訴: 「状態を消した純粋データフロー」が tramli の美学と整合するか、実装可能か、通信プログラムで実益があるか。

---

## Scene 1: 症例提示 — 「そもそも、なぜ state を消したいのか？」

**先輩（ナレーション）**: 主治医役は今泉。症例を整理するところから始まる。

---

**👤 今泉**: *カルテに目を落とす。* えっと、基本的なことを聞いていいですか。**そもそも、なぜ state を消したいんですか？** tramli の売りは「型付き state machine + data-flow が同時に追える」ことですよね。state を消したら、それはもう tramli じゃなくて、別のものじゃないですか？

**☕ ヤン**: *紅茶を注ぐ。* 良い問いですね。僕も同じことを思いました。通信プログラムって言うけど、多くの通信プログラムは **状態機械として書くべき** なんです。TCP ハンドシェイク、セッション管理、リトライ、サーキットブレーカー。全部 state machine。**state を消したい時点で、tramli の出番じゃない可能性がある**。

**🔬 ハレル教授**: *穏やかに。* ヤン君、それは半分正しく半分違います。通信プログラムには2つの層があります。**プロトコル層**（状態機械が自然）と **データ処理層**（データフローが自然）。gRPC のインターセプタチェーン、Kafka Streams の topology、Node-RED のフロー。これらは状態機械で書くと冗長になります。**Kahn Process Networks (1974)** と **Flow-Based Programming (Morrison, 1970s)** がすでにこの領域を埋めています。

**⚔ リヴァイ**: *腕を組む。* つまり tramli がその領域に進出する意味があるのか、ということだ。すでに埋まっている穴を掘り直すのは汚い。

**🎩 千石**: いえ、*資料を開く。* 先行研究が存在することと、tramli が独自の価値を提供できないことは別です。tramli の強みは **ビルド時型検証** と **3言語パリティ**。FBP 系のツールでこの2点を両立しているものはありません。

→ Gap 発見: **先行研究との位置づけが未定義** — Kahn networks / FBP / Reactive Streams に対して tramli-dataflow-only モードが何を加えるのかが明文化されていない。理論顧問が求めるポジショニングが空白。

---

## Scene 2: 「状態を消すと何が残るか」— 理論的骨格

**先輩（ナレーション）**: ハレル教授が理論的枠組みを提示する。tramli の DataFlowGraph が実は何に相当するのか。

---

**🔬 ハレル教授**: tramli の現行実装を理論的に言い直しましょう。

```
tramli (現行) = Statechart + typed data-flow overlay
  - 頂点 V = state
  - 遷移 T = (from, to, guard?, processor?, requires, produces)
  - FlowKey<T> = typed channel identifier
```

ここから state を消すと、残るのは **型付きプロセッサのDAG** です。

```
tramli-dataflow-only = (P, C, 依存関係)
  - P = processor 集合
  - C = FlowKey<T> channel 集合
  - 依存関係 = requires/produces から自動導出される partial order
```

これは **Kahn Process Network** の離散版、かつ型検証付き。Morrison の FBP が動的型なのに対して、tramli なら静的型で同じことをする。

**☕ ヤン**: *紅茶を啜る。* …なるほど。つまり「state を消す」のではなく、「単一 state に畳み込んで DAG にする」と言った方が正確なんですね。state が消えているわけじゃなく、**trivialize されている**。

**🔬 ハレル教授**: その通りです。ヤン君の整理は正しい。これは理論的には**新しいモードではなく、退化ケース (degenerate case)** です。

**👤 今泉**: えっと、それって、ユーザーから見ると何が違うんですか？ 「state: 'only' で定義すればいい」だけだと、**なぜわざわざ特化モードが必要なのか** 分からないです。

**🎩 千石**: *鋭く。* 今泉さんの指摘が本質です。**特化モードの価値は API の簡潔さにしかない**。`define.stateless()` と書けるか、`define.states(['only']).initial('only')` と書かされるかの違い。それだけです。理論的には同じ。**シンタックスシュガーとして正直に位置づける**のが正しい。

→ アイデア: **stateless はシンタックスシュガーとして導入** — 理論的には単一状態への退化。新エンジンは不要。`define.stateless<Ctx>()` は内部で `states: ['only'], initial: 'only'` に展開。

---

## Scene 3: 通信プログラムの現実 — 「シュガーでは足りない場所」

**先輩（ナレーション）**: 理論的には退化ケース。ではなぜ利用者が「通信プログラム向け」と言ったのか。リヴァイが実装の観点から掘る。

---

**⚔ リヴァイ**: *資料を叩く。* 単一ステートシュガーで満たせるのは **1回流れて終わり** のパイプラインだけだ。だが利用者は「通信プログラム」と言った。通信プログラムは **長寿命、再入、並列発火、backpressure** が本質だ。これらは現行 tramli エンジンに存在しない。

**☕ ヤン**: 具体的には？

**⚔ リヴァイ**: 3つ挙げる。

1. **長寿命**: 現行 FlowEngine は `startFlow` → 完了の寿命しか持たない。WebSocket サーバのように「接続中ずっとメッセージを流す」場合、毎回 `resumeAndExecute` するのか？
2. **並列発火**: 現行は逐次実行。`requires` が満たされた複数プロセッサを同時に走らせる意味論は未定義。
3. **再入**: 同じプロセッサを複数メッセージに対して独立並行に走らせる必要がある。現行の FlowInstance は1本のコンテキストしか持たない。

**🔬 ハレル教授**: リヴァイ君、それは正確です。そして、この3点は **Kahn network と actor model の分岐点** です。tramli を通信プログラム向けに本格展開するなら、**別エンジン**として設計すべき領域です。

**🎩 千石**: *厳しく。* つまり「シュガー派」と「別エンジン派」で目指すものが違うのです。シュガー派 = パイプラインの糖衣。別エンジン派 = Reactive 層の新規実装。**この2つを混ぜて議論すると必ず破綻します**。

**👤 今泉**: *首を傾げる。* えっと、**本当にそれを tramli に入れるんですか？** Erlang、Akka、Rx、Reactor、Node-RED があります。別エンジンにするなら、tramli の看板を借りる理由がないのでは。

**☕ ヤン**: *深く頷く。* 今泉さんが核心を突きました。**「tramli ブランドで Reactive エンジンを出す必要があるか？」** 答えは多分 No です。

→ Gap 発見: **シュガー vs 別エンジンの目的混同** — 「DataFlow 特化モード」という一語が、単一ステート畳み込み（低コスト）と Reactive エンジン新規実装（別ツール級）を同じ袋に入れている。設計論が噛み合わない。

→ Gap 発見: **長寿命・並列・再入の設計が tramli にそもそもない** — FlowEngine は1 flow = 1 context = 1 lifecycle の前提。通信プログラムが要求する concurrent execution model は現行の型で表現できない。

---

## Scene 4: 段階導入案の吟味 — 「何を先にやるか」

**先輩（ナレーション）**: 前回の roundtable で Option A/B/C が出ていた（シュガー / 別エンジン / Mermaid 出力のみ先行）。4人衆 + 教授で再評価する。

---

**🎩 千石**: 整理します。

| Option | 内容 | 工数 | 価値 |
|--------|------|------|------|
| A | `define.stateless()` シュガー | 低 | 中（記述が少し短い） |
| B | ReactiveFlow 別エンジン（長寿命・並列・再入） | 高 | 高（通信プログラム対応） |
| C | DataFlow-only Mermaid 出力モード | 極低 | 中（可視化の価値） |

**☕ ヤン**: *紅茶を置く。* Option C がダントツで ROI が高い。Mermaid 出力のノード=processor、エッジ=FlowKey モードを足すだけ。**既存 API は一切触らない**。利用者はそれで「DataFlow として見る」体験を得る。

**⚔ リヴァイ**: Option A は罠だ。シュガーを足すと「tramli は stateless もいける」という誤解が生まれる。長寿命・並列・再入がないのに、stateless と書いた瞬間にユーザーは通信プログラムに使おうとする。**期待ギャップが事故を呼ぶ**。

**🔬 ハレル教授**: リヴァイ君の指摘は重要です。API の退化ケースを公開すると、**利用者はそれを本道と誤認します**。これは UML State Machine と BPMN で実際に起きた歴史があります。

**👤 今泉**: えっと、**そもそも通信プログラムで tramli を使いたい人は誰なんですか？** 想定ユーザーがいないと、B をやる理由がない。

**☕ ヤン**: *微笑む。* ビジョンメモには「全コードを define + pipeline でカバー」とあります。でも現時点の tramli は state machine の exemplar として完成している。**通信プログラム領域は別の exemplar を作るべき**で、tramli に混ぜるべきではない。

→ アイデア: **Option C 単独実施** — DataFlow-only Mermaid 出力モードだけ追加。ノード=processor、エッジ=FlowKey<T>。既存 API 不変、state を隠した可視化モード。可視化で「データ視点」を提供しつつ、tramli の state 中心性は崩さない。

→ アイデア: **stateless シュガーは導入しない（意図的に封じる）** — 期待ギャップを生むため。単一ステートで書きたければ `states: ['only']` と明示させる。1行増えるだけで、tramli は state machine だという看板を守れる。

→ アイデア: **ReactiveFlow は別プロジェクトで試作** — tramli のスキンを借りず、`tramli-reactive` のような別 crate/package として設計空間を探る。成熟したら本家に統合するかを判断。

---

## Scene 5: 統合診断

**先輩（ナレーション）**: ハレル教授が統合所見を述べる。ヤンが最後に削る。

---

**🔬 ハレル教授**: 統合診断です。

1. **tramli のアイデンティティは「型付き Statechart + data-flow overlay」**。これを崩す変更は避けるべき。
2. **可視化モード（Option C）は安全**。理論的には DataFlowGraph の別プロジェクションに過ぎず、tramli の意味論を変えない。
3. **通信プログラムは別問題**。Kahn network / actor model / Reactive Streams 側の知見を素直に参照すべきで、tramli を無理に拡張する必要はない。

**🎩 千石**: *頷く。* 私も同意します。**API の看板を守ることが、長期的にはユーザーへの誠実さ**です。

**⚔ リヴァイ**: *腕を解く。* 同意だ。汚く拡張するより、境界を守れ。

**👤 今泉**: えっと、整理すると **「明示的なステートなしで DataFlow 特化モードを作る」という元の問いは、No が答え**ってことですね？ ただし、**可視化の Option C は Yes**。通信プログラム向けは別プロジェクト。

**☕ ヤン**: *紅茶を飲み干す。* そうですね。**削りました**。元の問いは複合的すぎた。分解したら、ほとんどの構成要素は「やらない」が正解。**Option C だけやる**、それでいい。

→ アイデア: **Mermaid の "dataflow view" を Option C として v1.8 で実装** — 既存 `generateMermaid()` に `view: 'dataflow' | 'state'` オプションを追加。dataflow view はノード=processor/guard、エッジ=FlowKey<T> を描画。state は非表示。3言語パリティで実装。

---

## 抽出されたアイデア一覧

| # | アイデア | カテゴリ | 実現可能性 |
|---|---------|---------|-----------|
| 1 | Mermaid dataflow view 追加（ノード=processor、エッジ=FlowKey） | improvement | 高（既存 mermaid-generator 拡張） |
| 2 | stateless シュガーは**意図的に作らない**（期待ギャップ防止） | pivot | 高（設計判断のみ） |
| 3 | ReactiveFlow は別プロジェクト（tramli-reactive）で試作 | new_feature | 中（スコープ別れるため） |
| 4 | 先行研究（Kahn network, FBP）との位置づけを SPEC に明記 | improvement | 高（ドキュメント作業） |
| 5 | 長寿命・並列・再入のサポートは tramli スコープ外と明示 | improvement | 高（SPEC/README への追記） |

## 抽出された Gap 一覧

| # | Gap | Category |
|---|-----|----------|
| G1 | 先行研究との位置づけ未定義（FBP, Kahn network） | documentation |
| G2 | 「DataFlow 特化モード」が2つの異質な要求を混ぜていた | scope |
| G3 | 長寿命・並列・再入が tramli エンジンに存在しないことが明文化されていない | documentation |

---

## 決定事項（この session の合意）

- **stateless 特化モードは導入しない**（Option A 却下）
- **ReactiveFlow 別エンジンは tramli の看板では作らない**（Option B 却下）
- **Mermaid dataflow view は追加する**（Option C 採用）
- **通信プログラム向け領域は tramli スコープ外**と SPEC に明記

## 選択肢

1. **もう一回ブレスト** — 別角度（例: Mermaid dataflow view の詳細設計）から DGE を回す
2. **設計レビューに持ち込む** — Option C（Mermaid dataflow view）を design-review flow で詰める
3. **設計判断を記録する** — 「stateless を意図的に作らない」「通信領域はスコープ外」を DD として記録
4. **実装する** — Option C を v1.8 の実装タスクに落とす
5. **後で / 終わる**
