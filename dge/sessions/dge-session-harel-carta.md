# DGE Session: Harelが一から設計するステートマシンライブラリ vs tramli

**Date:** 2026-04-08
**Participants:** David Harel（主役）, ヤン・ウェンリー, Pat Helland, リヴァイ
**Facilitator:** Opa
**Topic:** Harelが自分のStatechart理論に基づいてライブラリを設計したら何が違うか。tramliとの比較で何が見えるか。

---

## Act 1: 設計の出発点

**Opa:** Harel博士、もしあなたが2026年に、tramliと同じ問題空間——状態遷移の正当性をビルド時に検証するライブラリ——をゼロから設計するとしたら、どう作りますか？

**Harel:** いい問いだ。まず私の設計原則を明示する。

```
Harel's Axioms:
  H1: 状態は階層的である（flat enumは例外）
  H2: イベントは一級市民である（暗黙にしない）
  H3: 直交する関心事は直交させる（状態爆発を防ぐ）
  H4: 状態には入口と出口がある（entry/exit actions）
  H5: 図が仕様である（visual formalism）
```

tramliの設計原則はこうだろう：

```
tramli's Axioms:
  T1: data-flowが全てを駆動する（requires/produces）
  T2: ビルド時に検証できることは全てビルド時に検証する
  T3: コアはsync、I/Oは外部
  T4: 3言語で同一セマンティクス
  T5: ゼロ依存、最小API
```

**ヤン:** H1-H5とT1-T5で重なる部分がほとんどないですね。

**Harel:** そこが面白いところだ。tramliは**データの流れ**から設計されている。私は**制御の構造**から設計する。同じ問題を全く違う角度から攻めている。

---

## Act 2: Harelライブラリ「Carta」の設計

**Harel:** 仮に「Carta」と名付けよう。設計を始める。

### 2.1 状態の定義

```java
// tramli: flat enum
enum OrderState { CREATED, PAYMENT_PENDING, CONFIRMED, SHIPPED, CANCELLED }

// Carta: 階層的状態
State order = State.root("Order")
    .initial("Created")
    .state("Processing")
        .initial("PaymentPending")
        .state("PaymentConfirmed")
        .terminal("Shipped")
    .terminal("Cancelled");
```

**リヴァイ:** `Processing`が親状態で、`PaymentPending`と`PaymentConfirmed`がその子。tramliにはない概念だ。

**Harel:** 親状態の意味は「この中にいる間、共通のエラーハンドリングが適用される」ということだ。tramliの`on_any_error`と似ているが、より構造的。

```java
// Carta: Processing内のどの子状態でもエラーが起きたらCancelled
order.state("Processing").onError("Cancelled");

// tramli: 各状態に個別にerror transitionを設定（または on_any_error で一括）
.on_error(PAYMENT_PENDING, CANCELLED)
.on_error(CONFIRMED, CANCELLED)
// または
.on_any_error(CANCELLED)
```

**ヤン:** tramliの`on_any_error`は階層的エラーハンドリングの**フラット化**ですね。結果は同じだが、意図の表現力が違う。

### 2.2 イベント

```java
// Carta: イベントは明示的に定義
Event paymentReceived = Event.of("PaymentReceived");
Event shipmentReady   = Event.of("ShipmentReady");
Event cancel          = Event.of("Cancel");

order.transition()
    .from("PaymentPending").on(paymentReceived).to("PaymentConfirmed")
    .guard(ctx -> ctx.has(PaymentResult.class) && ctx.get(PaymentResult.class).isValid())
    .action(ctx -> ctx.put(new ConfirmedPayment(ctx.get(PaymentResult.class))));
```

**ヤン:** tramliとの最大の違いが見えます。

```
Carta:  from → on(event) → guard(条件) → action(処理) → to
tramli: from → external(to, guard)
        guardが条件判定とデータ注入を兼ねる
        processorが処理を担当（別の遷移で）
```

**Helland:** tramliはguardとactionを**分離していない**。TransitionGuardがvalidateでデータをproduceし、StateProcessorが別の遷移でcontextを変更する。Cartaは1つの遷移にguard（条件）+ action（副作用）を両方持たせる。

**Harel:** これは意図的な設計だ。Statechartではguardは純粋な条件式で、actionが副作用を持つ。**関心の分離**。tramliのTransitionGuardは`GuardOutput::Accepted { data }`でデータを返す——これはguardがactionを兼ねている。

**リヴァイ:** 実際にそれで困ったことがあるか？

**Opa:** ……ない。むしろ1箇所で完結するから楽。

### 2.3 Entry/Exit Actions

```java
// Carta: 状態に入るとき・出るときの自動処理
order.state("PaymentPending")
    .onEntry(ctx -> startPaymentTimeout(ctx, Duration.ofHours(24)))
    .onExit(ctx -> cancelPaymentTimeout(ctx));
```

**Harel:** これはtramliに**存在しない概念**だ。tramliではprocessorが遷移に紐づく。状態に紐づくアクションがない。

**ヤン:** 具体的に何が困りますか？

**Harel:** ユーザーライフサイクルで考えてみよう。

```
SUSPENDED に入ったとき:
  → アクセス制限を適用する
  → 管理者に通知する
  → 30日後の自動削除タイマーを開始する

SUSPENDED から出たとき（どこに遷移するかに関わらず）:
  → アクセス制限を解除する
  → 自動削除タイマーをキャンセルする
```

tramliでは:

```java
// tramliの対処: SUSPENDEDに入る全ての遷移のprocessorに書く
// ACTIVE → SUSPENDED の processor
// TRIAL → SUSPENDED の processor（もしあれば）
// 全部に同じ entry ロジックを書く……

// あるいは: SUSPENDEDから出る遷移のguard/processorの前に exit ロジックを書く
// SUSPENDED → ACTIVE の guard 内で制限解除
// SUSPENDED → BANNED の guard 内で制限解除
// SUSPENDED → CHURNED の guard 内で制限解除
// 全部に同じ exit ロジックを書く……
```

**リヴァイ:** それはDRY違反だ。同じコードを3箇所に書くことになる。

**ヤン:** ……これは本当に困る問題ですか？ tramliで対処する方法は2つあります。

```java
// 対処1: 共通処理を helper に切り出す
class SuspensionHelper {
    static void onEnter(FlowContext ctx) { /* 制限適用、通知、タイマー */ }
    static void onLeave(FlowContext ctx) { /* 制限解除、タイマー取消 */ }
}
// 各processor/guard内で SuspensionHelper.onEnter(ctx) を呼ぶ
// → DRYだが、呼び忘れリスクがある

// 対処2: 中間状態を挟む
// ACTIVE → SUSPENDING（entry processor） → SUSPENDED
// SUSPENDED → UNSUSPENDING（exit processor） → ACTIVE/BANNED/CHURNED
// → 呼び忘れリスクなし。ただし中間状態が増える
```

**Helland:** 対処2は本質的にentry/exit actionsの**エンコーディング**だ。tramliのフラットな遷移モデルにentry/exitを埋め込んでいる。動くが、意図が不明瞭になる。

**Harel:** そこが私の指摘だ。entry/exit actionsは**意図を構造として表現する**ためにある。helperメソッドの呼び忘れを防ぐためではなく、「この状態に入ったら必ずこれが起きる」を**宣言的に保証する**ためだ。

---

## Act 3: 比較表

**Opa:** ここまでの違いを表にする。

```
                    Carta (Harel)              tramli (Opa)
──────────────────────────────────────────────────────────────
状態構造            階層的（ネスト）            フラット enum + SubFlow
イベント            明示的 Event 型             暗黙（requires型で代替）
遷移の構造          on(event).guard.action.to   external(to, guard)
entry/exit actions  あり                       なし
guard の役割        純粋な条件判定              条件判定 + データ注入
action の役割       副作用実行                  processor（別遷移）
直交状態            orthogonal regions          別フロー + 将来のContract
history state       あり                       なし
ビルド時検証        型検査（event × state）      data-flow検証（requires/produces）
data-flow           検証なし（静的型に依存）     ビルド時完全検証
最大の強み          制御構造の表現力             データ整合性の保証
最大の弱み          データ整合性は未検証          制御構造が貧弱
```

**リヴァイ:** 綺麗に直交してる。CartaとtramliはほぼTradeoffの逆。

**Helland:** これは偶然ではない。Harelは**制御フロー**の専門家で、tramliの設計者は**データフロー**を重視している。

---

## Act 4: tramliがCartaから学べること

**Opa:** Cartaの設計でtramliに取り入れるべきものは何か。率直に。

**Harel:** 3つある。

### 4.1 Entry/Exit Actions

**Harel:** これは取り入れるべきだ。

```java
// 提案: tramliへの最小限の追加
.state(SUSPENDED)
    .onEntry(suspensionEntryProcessor)
    .onExit(suspensionExitProcessor)
```

**ヤン:** しかしこれはAPIの表面積を大きくします。T5（最小API）に反する。

**Harel:** 最小APIは目的ではなく手段だろう。DRY違反のほうが深刻な問題だ。

**リヴァイ:** 実装の複雑性は？

**Opa:** engine の `transition_to()` でentry/exitを呼ぶだけ。

```rust
fn transition_to(&mut self, from: S, to: S, ctx: &mut FlowContext) {
    // exit action of 'from'
    if let Some(exit_proc) = self.definition.exit_action(from) {
        exit_proc.process(ctx);  // エラーハンドリングは？
    }
    self.current_state = to;
    // entry action of 'to'
    if let Some(entry_proc) = self.definition.entry_action(to) {
        entry_proc.process(ctx);  // エラーハンドリングは？
    }
}
```

**Helland:** エラーハンドリングが問題だ。entry actionが失敗したら、状態遷移は成立したのか？ exitが失敗したら？

**ヤン:** ここが**entry/exitを入れない理由**の核心ですね。

```
遷移のライフサイクル:
  1. guard.validate()     → Accepted/Rejected
  2. from.exit_action()   → 成功/失敗 ← ここで失敗したら？
  3. state = to
  4. to.entry_action()    → 成功/失敗 ← ここで失敗したら？
  5. auto-chain           → ...
```

**Harel:** Statechart理論ではentry/exit actionsは**失敗しない**前提だ。しかし現実のプログラミングでは——

**リヴァイ:** 失敗する。タイマー起動が失敗する。通知送信が失敗する。

**Helland:** そしてそれらはI/Oだ。tramliのT3（コアはsync、I/Oは外部）に反する。

**ヤン:** つまり、entry/exit actionsの典型的なユースケース（タイマー、通知、外部システム連携）は**全てI/O**であり、tramliの「SMの中にI/Oを入れない」原則と矛盾する。

**Harel:** ……認めざるを得ない。entry/exit actionsの実用的なユースケースの大半がI/Oなら、tramliのモデルでは外部に出すのが正しい。

**Opa:** つまり、entry/exitは**入れない**。ただし**ドキュメントで対処パターンを示す**。

```
パターン: Entry/Exit の tramli 的実現

// 遷移後にentry相当の処理をアプリ側で行う
let result = engine.resume_and_execute(flow_id, data)?;
let flow = engine.store.get(flow_id).unwrap();
if flow.current_state() == SUSPENDED {
    suspension_service.apply_restrictions(flow_id);
    notification_service.notify_admin(flow_id);
    timer_service.schedule_auto_delete(flow_id, Duration::from_days(30));
}

// これは async-integration.md の延長パターン
```

**Helland:** flowの状態を見て外部処理を分岐する。SMの外で。tramliの哲学に完全に沿っている。

**リヴァイ:** でもその`if flow.current_state() == SUSPENDED`を書き忘れるリスクは？

**ヤン:** そこがentry actionsの本来の価値ですね。「書き忘れない保証」。

**Opa:** ……ここに本当の問題がある。entry actionsの価値は「I/Oを実行する」ことではなく、「**状態と処理の紐付けを宣言的に保証する**」こと。I/Oそのものはentry内でやらなくてもいい。**エンジンがentry呼び出しを保証し、entryの中で外部サービスを呼ぶかどうかはentryの実装次第**。

**Harel:** その通りだ。entry actionが`ctx.put(SuspensionApplied(timestamp))`するだけでもいい。実際のI/O（制限適用）はアプリが`SuspensionApplied`の存在を見て外部で行う。

**ヤン:** ……なるほど。entry actionがcontextにマーカーを置く。アプリが遷移後にマーカーを見て外部処理を行う。entry actionの中にI/Oはない。sync。requires/producesに乗る。**tramliの哲学と矛盾しない。**

```java
// entry action はマーカーを置くだけ（sync, no I/O）
.state(SUSPENDED)
    .onEntry(ctx -> ctx.put(new SuspensionApplied(Instant.now())))

// アプリ側（async, I/O）
engine.resumeAndExecute(flowId, data);
Flow flow = engine.store.get(flowId);
if (flow.context().find(SuspensionApplied.class).isPresent()) {
    suspensionService.apply(flow);  // I/O は外
}
```

**リヴァイ:** entry actionがデータ変換だけで、I/Oは外。これならtramliに入れても壊れない。

**Helland:** しかし、data-flow検証に乗るか？ entryのrequires/producesをDataFlowGraphに組み込めるか？

**Opa:** ……乗る。entry actionもStateProcessorと同じinterface。requires/producesを宣言する。DataFlowGraphの`available_at(state)`にentryのproducesが反映される。

**Harel:** これは美しい。entry/exit actionsをtramliのdata-flow検証に統合する。**Statechartとdata-flow検証の融合**。

---

## Act 5: entry/exitのdata-flow検証の詳細

**ヤン:** 具体的に検証ロジックを書きましょう。

```
遷移の data-flow:
  available_at(from)
    → exit_action.requires ⊆ available    ← exit が使えるデータ
    → available += exit_action.produces
    → guard.requires ⊆ available           ← guard が使えるデータ
    → available += guard.produces
    → processor.requires ⊆ available
    → available += processor.produces
    → available_at(to) = available
    → entry_action.requires ⊆ available   ← entry が使えるデータ
    → available += entry_action.produces   ← to 状態での available に追加
```

**Harel:** 注意。entry_actionのproducesは**その状態に入った全てのパスで**追加される。exitのproducesは**その状態から出る全てのパスで**追加される。これはDataFlowGraphの走査に自然に統合できる。

**Helland:** 自己遷移のときは？ `ACTIVE → profileUpdateGuard → ACTIVE`。

```
exit_action(ACTIVE)が走る → guard → entry_action(ACTIVE)が走る
```

**ヤン:** 自己遷移でexit/entryが走るかどうかは設計判断です。UMLでは:

```
external self-transition: exit + entry が走る
internal self-transition: exit + entry が走らない
```

**Harel:** tramliの自己遷移は全てexternalだ。exit/entryは走る。これでいい。profileUpdateのたびにentry actionが走ることに問題はないか？

**リヴァイ:** entry actionが「SuspensionAppliedマーカーを置く」ならACTIVEには不要。SUSPENDEDだけにentry actionを設定すればいい。ACTIVEにentry actionがなければ走らない。

**ヤン:** 全状態にentry/exitを設定する義務はない。**オプショナル**。設定した状態だけ走る。

---

## Act 6: Cartaがtramliのdata-flow検証から学べること

**Opa:** 逆方向。Cartaにあってtramliにないものは検討した。tramliにあってCartaにないものは？

**Harel:** data-flow検証だ。正直に言う。Statechart理論は**制御構造の正当性**（到達可能性、非決定性の除去、活性など）に注力してきた。**データの整合性**は拡張状態変数（extended state）として扱うが、型レベルの検証は行わない。

```
Carta (Statechart) のビルド時検証:
  ✅ 到達可能性
  ✅ 非決定性の検出（同一event + 同一guard → 2つの遷移）
  ✅ 活性（terminal到達可能性）
  ❌ データ整合性（「このactionが必要なデータは利用可能か」は検証しない）

tramli のビルド時検証:
  ✅ 到達可能性
  ✅ terminal到達可能性
  ✅ data-flow整合性（requires/producesの充足）
  ✅ DAG検証（auto-chainの循環検出）
  ✅ Dead Data Detection
  ❌ 非決定性（DD-019 R4でwarningとして対応）
```

**Helland:** つまりtramliは**Statechart理論が手を付けなかった領域**を検証している。

**Harel:** その通りだ。そしてこれは**重要な貢献**だ。私のStatechart論文（1987年）以降、制御構造の形式化は多くの研究者が進めた。しかしデータフローとの統合は——特に実用的なライブラリレベルでは——ほとんど行われていない。

**ヤン:** tramliのrequires/producesは、ある意味で**型付きペトリネット**に近い。遷移の発火条件がトークン（型）の存在で決まる。

**Harel:** 良い類推だ。しかしペトリネットは階層構造を持たない。tramliは……SubFlowで階層を持つ。**階層的型付きペトリネット**。学術的にも新しいかもしれない。

---

## Act 7: 融合の可能性 — entry/exit + data-flow

**Opa:** entry/exitをtramliに入れる場合のAPI案を具体化する。

```java
// Builder API（Java）
Tramli.define("user-lifecycle", UserState.class)
    .state(SUSPENDED)
        .onEntry(suspensionMarker)    // StateProcessor<UserState> を受ける
        .onExit(suspensionCleanup)
    .from(ACTIVE).external(SUSPENDED, suspendGuard)
    .from(SUSPENDED).external(ACTIVE, unsuspendGuard)
    ...
```

```rust
// Builder API（Rust）
Builder::<UserState>::new("user-lifecycle")
    .state(UserState::Suspended)
        .on_entry(SuspensionMarker)
        .on_exit(SuspensionCleanup)
    .from(UserState::Active).external(UserState::Suspended, SuspendGuard)
    ...
```

**ヤン:** `.state(S)`が新しいBuilderメソッド。StateBuilderを返して、`.onEntry()`と`.onExit()`を受ける。

```rust
pub struct StateBuilder<S: FlowState> {
    builder: Builder<S>,
    state: S,
}

impl<S: FlowState> StateBuilder<S> {
    pub fn on_entry(mut self, proc: impl StateProcessor<S> + 'static) -> Self { ... }
    pub fn on_exit(mut self, proc: impl StateProcessor<S> + 'static) -> Self { ... }
    pub fn end_state(self) -> Builder<S> { self.builder }
}
```

**リヴァイ:** 既存の`.from()`と`.state()`が混在する。混乱しないか。

**ヤン:** `.state()`はオプショナル。entry/exitが不要な状態には書かない。既存コードは一切変更不要。

**Helland:** FlowDefinition にentry/exit情報を保持する。

```rust
pub struct FlowDefinition<S: FlowState> {
    ...
    entry_actions: HashMap<S, Box<dyn StateProcessor<S>>>,  // 追加
    exit_actions: HashMap<S, Box<dyn StateProcessor<S>>>,   // 追加
}
```

**Harel:** DataFlowGraph への影響は？

**Opa:** `DataFlowGraph::build()`の走査で、状態に到達した時点でentry actionのrequires/producesを計算に含める。状態から出る時点でexit actionのrequires/producesを計算に含める。

```
check_rp_from(def, state, available):
  // 状態に入った → entry action
  if let Some(entry) = def.entry_action(state):
    for req in entry.requires():
      if req ∉ available → error
    available += entry.produces()

  // 遷移を走査
  for t in def.transitions_from(state):
    // 状態から出る → exit action
    if let Some(exit) = def.exit_action(state):
      for req in exit.requires():
        if req ∉ available → error
      available += exit.produces()
    // guard, processor の検証（現状通り）
    ...
```

**ヤン:** entry actionのproducesは**その状態での全遷移で利用可能**。これはavailable_at(state)に加算される。

```
available_at(SUSPENDED) = 
    (全パスの入力の積集合) + entry_action(SUSPENDED).produces()
```

**Harel:** Dead Data Detectionにも影響する。exit actionがproduceした型が後続の遷移でrequireされなければdead data。

**リヴァイ:** DataFlowGraphの拡張は自然だな。entry/exitも「型ノードと処理ノードの二部グラフ」に組み込まれる。

---

## Act 8: entry/exitの実装コストと判断

**Opa:** entry/exitの追加で壊れるものを確認。

```
既存APIへの影響:
  ✅ .from().external() — 変更なし
  ✅ .from().auto() — 変更なし
  ✅ resume_and_execute() — 変更なし
  ✅ FlowEngine — transition_to()にentry/exit呼び出し追加（内部変更）
  ✅ FlowInstance — 変更なし
  ✅ 既存テスト — entry/exitなしのフローは従来通り動作

新規追加:
  🆕 Builder.state(S) → StateBuilder
  🆕 StateBuilder.on_entry(proc) / .on_exit(proc)
  🆕 FlowDefinition.entry_actions / exit_actions
  🆕 DataFlowGraph にentry/exitの requires/produces を反映
  🆕 MermaidGenerator にentry/exitラベルを表示

コスト見積り:
  Java: 80行
  Rust: 60行
  TS:   50行
```

**ヤン:** entry/exitは**additive change**。既存APIを壊さない。v1.8.0で入れられる。

**Helland:** ただし——

**ヤン:** ただし？

**Helland:** **本当に必要か**をまだ検証していない。entry/exitの典型的ユースケースで「マーカーを置くだけ」パターンが実用的かどうか。SUSPENDEDに入ったときにマーカーを置いて、アプリが見る。これは**イベント発行と同じ**だ。なぜentry actionが必要で、なぜアプリが遷移後にstateをチェックするだけでは駄目なのか。

**リヴァイ:** ……確かに。アプリは遷移後に`flow.current_state()`を見る。`SUSPENDED`ならsuspension処理を呼ぶ。entry actionなしで同じことができる。

**ヤン:** entry actionの価値は「宣言的保証」でした。つまり「どのパスからSUSPENDEDに入っても必ずマーカーが置かれる」。アプリ側のif文は「呼び出し元が書き忘れるリスク」がある。

**Helland:** しかし呼び出し元が1箇所（resume_and_executeの直後）なら、書き忘れリスクは低い。呼び出し元が10箇所に散在していたら高い。

**リヴァイ:** 通常、resume呼び出しはAPIハンドラの中。エンドポイントごとに1箇所。共通ミドルウェアにすれば散在しない。

**Opa:** ……つまり、entry/exitの価値は「SM内で保証する」か「SM外で保証する」かの選択。tramliは「SM外で保証する」設計を選んでいる。entry/exitを入れると「SM内で保証する」に切り替わる。

**Harel:** どちらが正しいかは、**ユーザーの増え方**で決まる。ライブラリのユーザーが1人（Opa自身）なら、SM外で十分。ユーザーが100人になったら、SM内で保証する方が安全だ。

**ヤン:** 今はユーザーゼロです。

**リヴァイ:** 入れるな。YAGNIだ。

**Harel:** ……私の設計を提案したばかりだが、リヴァイが正しい。ユーザーがいない段階で入れるべきではない。ただし**設計上の拡張点は確保しておけ**。将来`.state(S).onEntry()`を足しても既存APIが壊れない構造にしておくこと。

**ヤン:** 現状のBuilder構造で、`.state()`メソッドを追加しても既存の`.from()`との互換性は維持できます。問題なし。

---

## Act 9: 結論 — CartaとtramliのGap分析

**Opa:** セッションの成果をまとめる。

### tramliがCartaから学んだこと

```
① entry/exit actions の価値は「宣言的保証」
   → 今は入れない（YAGNI）。ただし拡張点は確保。
   → 入れるときはdata-flow検証に統合（requires/produces）。
   → I/Oは入れない。マーカーを置くだけ。

② 階層的状態の表現力
   → SubFlowで対応済み。Harelもcompositionで十分と認めた（R1 Act 4）。

③ イベントの明示化
   → DD-019 R4で「型がイベント」として解決済み。Harel的な明示Eventは不要。
```

### Cartaがtramliから学んだこと

```
① data-flow検証（requires/produces）
   → Statechart理論に存在しない検証。tramliの独自貢献。
   → Harelが「学術的にも新しい」と認めた。

② I/Oの外部化
   → entry/exit actionsの典型ユースケースがI/Oであることは
     「SMの中にI/Oを入れない」原則と矛盾する。
   → tramliのアプローチが実用的に正しいケースが多い。
```

### 今回の最大の発見

```
tramli の最大の独自性は「data-flow検証」であり、
これは Statechart 理論（1987年以降の40年の研究）が
手を付けなかった領域である。

tramliは「制御構造が貧弱」だが、それは意図的なトレードオフ。
制御構造の表現力を上げる（entry/exit, orthogonal regions）と、
data-flow検証の複雑性が指数的に増す。

tramliが「フラットenum + requiresルーティング + data-flow検証」に
留まっているのは、検証可能性を最大化するための正しい選択。
```

**Harel:** 最後に一つ。tramliのアプローチを論文にするなら、タイトルはこうだ——

**「Data-Flow Verified State Machines: Build-Time Guarantees for State Transition Data Integrity」**

制御フローの検証は40年の歴史がある。データフローの検証をステートマシンに統合したのはtramliが初めてかもしれない。

**ヤン:** かもしれない、ではなく、**調べるべき**ですね。先行研究があるかどうか。

**Harel:** typed Petri nets、session types、behavioral types——近い概念はあるが、「ビルド時にステートマシンのデータ整合性を検証する実用的なライブラリ」は見たことがない。
