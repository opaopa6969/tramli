# DGE Session: ReactiveFlow が埋める穴 / アプリ全体を宣言的に定義するに足りないもの

**Decisions:**
- [DD-042](../decisions/DD-042-tramli-exemplar-completion.md) — tramli は exemplar として完結
- [DD-043](../decisions/DD-043-tramli-family-model.md) — アプリ全体は tramli ファミリー合成（tramli-sdd は吸収）

- **Date**: 2026-04-24
- **Flow**: 💡 brainstorm
- **Structure**: 🗣 座談会（roundtable）
- **Characters**: ☕ ヤン, 👤 今泉, 🔬 ハレル教授, 🧮 ロビン・ミルナー (ad-hoc), 🎨 深澤
- **Facilitator**: Opa
- **Previous session**: [2026-04-24-tramli-dataflow-mode.md](./2026-04-24-tramli-dataflow-mode.md)

---

## テーマ

- **Q1**: ReactiveFlow（tramli 系の別エンジン）を作るとき、tramli がカバーできていない領域をどう埋めるか
- **Q2**: アプリケーション全体を宣言的・構造的に定義するために他に何が必要か

## 前提（前セッションの結論）

- tramli は **型付き Statechart + data-flow overlay** として完成に向かっている
- 長寿命・並列・再入は tramli の設計スコープ**外**
- 通信プログラム向けは **別エンジン（tramli-reactive）** として試作する判断

---

## Scene 1: tramli の境界線を確定する — 「何が足りないか」を並べる

**先輩（ナレーション）**: まずは欠けているピースを列挙する。ミルナー教授の理論的視点が今回の核になる。

---

**🔬 ハレル教授**: 整理から始めましょう。tramli は **「有限状態と型付きデータ依存」** の領域を埋めています。

```
tramli が扱える:
  - 有限かつ離散的な state
  - state 遷移に紐づく副作用（processor）
  - 型付きデータの前後依存（requires/produces）
  - 静的検証可能な到達性・残存データ

tramli が扱えない:
  - 並行プロセスの合成
  - チャネル越しのメッセージパッシング
  - 長寿命セッション
  - 非決定的選択（select/receive）
  - backpressure と流量制御
```

**🧮 ミルナー**: *静かに、しかし明確に。* そうですね。私の CCS (1980) と π-calculus (1992) が扱ったのは、まさに **チャネルが一級市民** である世界です。tramli の FlowKey は「型付きデータのラベル」。これに **「送信/受信の名前」** と **「セッション型」** を加えれば、Reactive 層の骨格になります。

```
π-calculus の基本:
  P ::= 0                  (nil process)
      | x(y).P              (receive y on x, then P)
      | x̄⟨y⟩.P             (send y on x, then P)
      | P | Q               (parallel composition)
      | !P                  (replication — 永続プロセス)
      | (νx)P               (new channel x, scoped)
```

tramli の pipeline は **P;Q（sequential composition）のみ** を持ちます。並列合成 `P | Q` も、名前創造 `νx` も、受信 `x(y).P` もありません。これが「通信が書けない」理由です。

**☕ ヤン**: *紅茶を啜る。* ミルナーさん、それ「足りないもの」が **6個もある** って話ですよね。全部足したら tramli じゃなくなる。**Reactive 層は理論的には別物で、別言語と考えるべき**、ということでしょう？

**🧮 ミルナー**: 正確です。ただし、**FlowKey の拡張として channel を導入**するなら、概念的連続性は保てます。tramli-reactive は tramli の兄弟であって子孫ではない、という関係が自然です。

**👤 今泉**: えっと、素人質問ですけど、**それって Erlang や Akka と何が違うんですか？** 既にあるものをなぞってるだけに聞こえます。

**🧮 ミルナー**: 良い問いです。Erlang/Akka は動的型で、メッセージ契約は実行時に破れます。tramli-reactive の差別化点は、**π-calculus のセッション型（Honda 1998）を静的に検証する** ことです。`channel.send<Request>()` の後に `channel.receive<Response>()` を書き忘れたらビルド時エラー、という世界です。

→ Gap 発見: **並行合成・メッセージパッシング・セッション型が tramli に不在** — これらは理論的に独立した軸で、state machine の延長では扱えない。ReactiveFlow の中核はこの3点。

→ アイデア: **セッション型による静的検証を tramli-reactive の差別化点に** — `Channel<Req ⊸ Resp>` のような型で、通信プロトコルの順序違反をビルド時に検出。Erlang/Akka では動的にしか捕まえられない領域。

---

## Scene 2: ReactiveFlow の API スケッチ — tramli 兄弟としての体裁

**先輩（ナレーション）**: 理論的には独立。しかし tramli の設計美学（型付き、ビルド時検証、3言語パリティ）は継承したい。ハレル教授とミルナー教授が具体像を描く。

---

**🔬 ハレル教授**: tramli の `define` に対応する `reactive.define` を考えます。

```typescript
const echo = reactive.define<EchoCtx>()
  .channel('in',  Channel<Message>())        // 受信
  .channel('out', Channel<Message>())        // 送信
  .process('loop')
    .receive('in', (msg, ctx) => {
      ctx.send('out', transform(msg));
    })
    .replicate()                              // !P = 永続プロセス
  .build();
```

ここで重要なのは:
- `channel` が FlowKey と同等の「一級市民」
- `receive` は非決定的選択（複数 channel のどれかから到着したメッセージを処理）
- `replicate` は「このプロセスは消費されず、何度でも発火する」を宣言

**🧮 ミルナー**: *頷く。* 良い骨格です。ただし、**並行合成と scope 導入**が要ります。

```typescript
const system = reactive.compose([
  authProcess,       // P
  sessionProcess,    // | Q
  dispatchProcess,   // | R
])
  .scope('sessionId', Channel<SessionId>())  // (νsessionId) 内部チャネル
  .expose('in', 'out');                       // 外部インターフェース
```

scope で宣言された channel は **外部から不可視**。これで「サービス内部の通信」と「サービス間の通信」を区別できます。

**🎨 深澤**: *静かに口を開く。* …僕は理論の話は分からないけど、一つ気になります。このコード、**読んだ人は何を作ればいいと感じるでしょうか**。`channel('in')`、`process('loop')`、`replicate()`。**名前が抽象的で、手に取る感覚がない**。tramli の `.states(['cart', 'paid'])` は「商品を買う物語」が見える。こっちは見えない。

**☕ ヤン**: *微笑む。* 深澤さんの指摘、鋭いですね。確かに tramli の良さは「define を読めば何のアプリか分かる」ことでした。Reactive で `channel.receive` が並ぶと、**構造は見えるけどアプリは見えない**。

**👤 今泉**: えっと、それって **抽象レベルが違う** ってことですか？ tramli はドメイン層（注文、決済）で、ReactiveFlow はインフラ層（メッセージ、セッション）。混ぜたら「手に取る感覚」が失われる？

**🎨 深澤**: *そう思う。* デザインの言葉で言うと、**「超抽象」と「超具象」は分離すべき** です。tramli が担うのは「このビジネスは注文を受ける」という具象。ReactiveFlow が担うのは「プロセスは並行する」という抽象。**両者の API を同じレイヤーに混ぜると、どちらの良さも死にます**。

→ Gap 発見: **ReactiveFlow の API は抽象レベルが tramli と違う** — tramli はドメイン語彙で書ける。ReactiveFlow は通信プリミティブで書く。同じファイル内で混ぜると両者の美しさが失われる。

→ アイデア: **tramli（ドメイン層） と tramli-reactive（トランスポート層） を別ファイルで書き、合成する境界を作る** — 例: `define.stateless().broughtFrom(reactive.channel('orders'))` のように、tramli の外から reactive が供給する形。reactive はデータの入口/出口だけ提供し、ドメインは tramli で書く。

---

## Scene 3: アプリ全体を宣言的に書くには何が足りないか（Q2）

**先輩（ナレーション）**: 話題を Q2 に移す。state machine + data-flow + reactive だけでアプリが書けるか？ 深澤さんが「まだ足りないもの」を挙げる。

---

**🎨 深澤**: アプリを作った経験から言うと、宣言的に書きたいのに書けていないものが **6つ** あります。

```
1. UI コンポーネントの構造と状態
2. 入力フォームと検証（バリデーション）
3. データの永続化（スキーマ、マイグレーション）
4. API 契約（誰が何を受け渡すか）
5. 認可（誰がどの操作を許されるか）
6. 配置（どこで何が動くか）
```

tramli + reactive でカバーできるのは **1.5 個くらい**。UI の「状態」は書けるけど「レイアウト」は書けない。API の「状態遷移」は書けるけど「エンドポイント形状」は別で書く必要がある。

**🧮 ミルナー**: これは古典的な問題です。**Constructive Type Theory (Martin-Löf, 1984)** の系譜にある言語（Idris, Agda）では、すべてを型として統一する試みがあります。しかし実用性を犠牲にしています。tramli の「発見 (discovery)」の姿勢から言えば、**既にある良い宣言系を tramli 圏の外から取り込む**方が健全です。

**🔬 ハレル教授**: *同意する。* Harel 自身、Statechart だけで全てを書こうとはしませんでした。後年の **Live Sequence Charts** は Statechart を補完する別記法でした。**複数の宣言系を合成する構造**こそが、アプリ全体の記述を可能にします。

**👤 今泉**: えっと、つまり **tramli 1つで全部を書こうとするのは間違い** で、**tramli を中核とした「家族」で書く** のが正解ってことですか？

**☕ ヤン**: *紅茶を置く。* その整理、いいですね。家族構成を考えましょう。

```
tramli 家族（仮）:
  ├ tramli         : Statechart + data-flow       ← ドメイン
  ├ tramli-reactive: 並行・通信                    ← トランスポート
  ├ tramli-form    : 入力・検証                    ← 入力層
  ├ tramli-view    : UI 構造と state bind          ← 表示層
  ├ tramli-store   : 永続化スキーマ                ← 記憶層
  ├ tramli-guard   : 認可ポリシー                  ← 規律層
  └ tramli-topo    : 配置 / 配線                   ← 配線層
```

全部作る必要はないです。でも **「tramli が担わない領域は、家族の誰が担うか」を決めておく**と、アプリ全体が家族の合成として書けます。

**🎨 深澤**: *頷く。* それは美しい。各家族は **単機能** だから、一つ一つは手に取れる大きさになります。合成のルールだけ明確なら。

→ アイデア: **tramli 家族モデル** — 単機能の宣言系を複数用意し、明示的な合成境界で接続する。1つの DSL で全部やろうとしない。

→ Gap 発見: **合成境界の設計が未定義** — 家族を導入するなら、各家族間のインターフェース（どの型・どのチャネル・どの命名規則で接続するか）を最初に決めないと、後から破綻する。

---

## Scene 4: 何から作るか — 最小構成の選定

**先輩（ナレーション）**: 家族構想は大きい。現実的に次の1歩は何か？

---

**☕ ヤン**: *現実的に。* 家族を全部作るのは10年仕事です。**一番薄い価値が高い1個は何か**。

**🎨 深澤**: 経験から言うと **tramli-form** です。フォームとバリデーションはどのアプリでも書く。しかも繰り返し同じパターンで書く。**FlowKey に似た形で「入力スキーマ」が書ければ、tramli と自然に繋がる**。

**🔬 ハレル教授**: 異議あります。理論的には **tramli-reactive** が先です。Q1 で議論したように、通信層がないと「ドメインを外界と繋ぐ」部分が抽象化されません。フォームは tramli-reactive の上に載ります。

**🧮 ミルナー**: *穏やかに。* 両者とも正しい。**研究の順序**と**実用の順序**が違うのです。理論的には reactive が下。実用的には form が先に価値が出ます。

**👤 今泉**: えっと、**ユーザーが一番先に「tramli って便利」って感じるのはどっち** ですか？

**🎨 深澤**: form です。CRUD アプリを書くなら、入力→検証→tramli→保存、が最短動線。reactive は WebSocket や streaming を書く人にしか刺さりません。

**☕ ヤン**: *紅茶を飲み干す。* ユーザー数で言えば form が広い。理論的整合性で言えば reactive が深い。**両方スタブを作る**のはどうです？ tramli-form は薄く動くところまで。tramli-reactive は API スケッチだけ。手を動かして **家族モデルが本当に機能するか** を検証する段階。

→ アイデア: **tramli-form スタブ実装** — 入力スキーマを FlowKey 互換で定義し、検証結果を Context に入れる最小実装。tramli と最短接続。

→ アイデア: **tramli-reactive API スケッチのみ** — 実装せず、型と define スケッチで「こう書きたい」を確立。家族モデルの最初の2辺（tramli → form, tramli → reactive）を図示。

→ アイデア: **家族モデルを Mermaid で可視化する spec ドキュメント** — 前セッションの Option C で追加する Mermaid dataflow view を、家族間の合成にも使う。tramli 圏全体が1つの図で見える状態を作る。

---

## Scene 5: 統合 — tramli 圏の輪郭

**先輩（ナレーション）**: 大きな方向性をまとめる。ハレル教授・ミルナー教授が理論的ラベルを与え、深澤がユーザー体験の輪郭を描き、ヤン・今泉が削る。

---

**🔬 ハレル教授**: 整理した結論です。

1. **tramli は state machine + data-flow の exemplar として完成に向かう**。拡張せず、完結させる。
2. **tramli-reactive は π-calculus 系譜の別エンジン**。静的セッション型を差別化点に。
3. **アプリ全体は「tramli 家族」の合成**として書く。単一 DSL で書こうとしない。
4. **最初の家族拡張は form と reactive API スケッチ**。家族モデルの仮説検証。

**🧮 ミルナー**: 私が付け加えるなら、**「合成 (composition)」が家族モデルの中心概念**です。ここが緩いと、家族は単なる寄せ集めになります。圏論的に言えば、各家族は圏であり、家族間の接続は函手です。**函手が型検査されること** が tramli 圏の知的骨格になります。

**🎨 深澤**: 僕の言葉で言うと、**「読んだ人がアプリの全体像を感じられる」** ことが目標です。tramli だけでは見えない UI や入力が、家族の他メンバーで補完されて、全部を合わせると「このアプリは何か」が伝わる。それが到達点です。

**☕ ヤン**: *微笑む。* 削るなら、**「tramli 家族のマニフェスト」を先に書く**ことです。実装より先に「何をやらないか」を宣言する。実装は家族ごとに独立に進む。

**👤 今泉**: *まとめる。* えっと、今回の DGE の結論って、

- Q1（ReactiveFlow が埋める穴） → 並行・通信・セッション型の3点が核
- Q2（アプリ全体を宣言的に） → 単一 DSL は諦めて「家族モデル」で合成する

で、**具体的な次のアクションは「家族マニフェスト」と「tramli-form スタブ」と「tramli-reactive API スケッチ」** ってことですね？

**☕ ヤン**: *頷く。* そういうことです。

→ アイデア: **「tramli 家族マニフェスト」を SPEC レベルで先に書く** — 各家族の担当領域、命名規則、合成境界、非ゴール（やらないこと）を明文化。実装より先に。

---

## 抽出されたアイデア一覧

| # | アイデア | カテゴリ | 実現可能性 |
|---|---------|---------|-----------|
| 1 | セッション型（静的）を tramli-reactive の差別化点に（Erlang/Akka は動的） | new_feature | 中（理論負荷高） |
| 2 | tramli（ドメイン層）と tramli-reactive（トランスポート層）は別ファイル、境界で合成 | new_feature | 高（設計原則） |
| 3 | tramli 家族モデル — 単機能の宣言系を合成（form / view / store / guard / topo / reactive） | pivot | 中（規模大） |
| 4 | tramli-form スタブ実装（入力スキーマ + 検証 → Context へ） | new_feature | 高（薄く開始可） |
| 5 | tramli-reactive API スケッチのみ（型と define 形まで） | new_feature | 高（実装なしで価値） |
| 6 | 家族モデルを Mermaid 圏全体図で可視化する SPEC ドキュメント | improvement | 高（前セッション Option C と連動） |
| 7 | 「tramli 家族マニフェスト」を SPEC 先行で書く（非ゴールを含む） | improvement | 極高（実装着手前の必須） |
| 8 | 家族間インターフェース（函手）の型検査を可能にする設計 | wild | 低（研究レベル） |

## 抽出された Gap 一覧

| # | Gap | Category |
|---|-----|----------|
| G4 | 並行合成・メッセージパッシング・セッション型が tramli に不在（ReactiveFlow 中核） | scope |
| G5 | ReactiveFlow と tramli の抽象レベルが違う（混ぜると両者の美しさが死ぬ） | design |
| G6 | 家族間の合成境界の設計が未定義（命名・型・接続規則） | architecture |

---

## 決定事項（この session の合意）

- **tramli は state machine + data-flow の exemplar として完結させる**（拡張しない）
- **アプリ全体の記述は「tramli 家族モデル」による合成**で行う（単一 DSL 断念）
- **次の一歩は「家族マニフェスト」執筆**。実装より先に非ゴールを含む全体像を SPEC 化
- **家族拡張の最初のスタブは tramli-form**（CRUD での実用価値が最大）
- **tramli-reactive は API スケッチのみ**を先行（実装は後、π-calculus 系譜をベースに）

## 選択肢

1. **もう一回ブレスト** — 家族マニフェストの骨子を別 DGE で作る
2. **設計レビューに持ち込む** — tramli-form スタブ設計を design-review flow で詰める
3. **設計判断を記録する** — 「家族モデル採用」「tramli は exemplar として完結」を DD として記録
4. **実装する** — 家族マニフェストの SPEC 下書きから着手
5. **後で / 終わる**
