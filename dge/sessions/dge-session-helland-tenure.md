# DGE Session: Hellandが一から設計するエンティティライフサイクルライブラリ vs tramli

**Date:** 2026-04-08
**Participants:** Pat Helland（主役）, David Harel, ヤン・ウェンリー, リヴァイ
**Facilitator:** Opa
**Topic:** Hellandが「Life beyond Distributed Transactions」の思想に基づいてライブラリを設計したら何が違うか

---

## Act 1: 設計の出発点

**Opa:** Hellandさん、前回Harelに同じことを聞いた。あなたが2026年にtramliと同じ問題空間をゼロから設計するなら、どう作りますか。

**Helland:** まず明確にさせてくれ。私は「同じ問題空間」を違う角度から見ている。tramliは**フロー**を設計の中心に置いている。私は**エンティティ**を中心に置く。

```
tramli の世界観:
  「フローがある。フローは状態を持ち、遷移する。データがフローの中を流れる」

Helland の世界観:
  「エンティティがある。エンティティは長く生き、メッセージを受けて反応する。
   フローはエンティティの生涯の一部に過ぎない」
```

**Harel:** 興味深い。私は「制御構造」から始めた。Hellandは「存在するもの」から始める。

**Helland:** 私の設計原則を明示しよう。

```
Helland's Axioms:
  P1: エンティティは長く生きる（数分ではなく数年）
  P2: エンティティはメッセージで駆動される（メソッド呼び出しではない）
  P3: 冪等性は設計に組み込む（後付けではない）
  P4: ロールバックではなく補償（compensation）
  P5: 状態はイベントの関数である（event sourcing）
  P6: エンティティ間にトランザクションはない
```

**リヴァイ:** P5はEvent Sourcingか。tramliのFlowContextとは根本的に違う。

**Helland:** そうだ。tramliのFlowContextは**可変状態**だ。putで上書き、getで読む。私のライブラリでは、**イベントのログが真実であり、現在の状態はログから導出される**。

---

## Act 2: Hellandライブラリ「Tenure」の設計

**Helland:** 「Tenure」（在職期間）と名付けよう。エンティティの生涯を管理するライブラリだ。

### 2.1 エンティティ定義

```java
// tramli: フロー定義
Tramli.define("order", OrderState.class)
    .from(CREATED).auto(PAYMENT_PENDING, orderInit)
    ...

// Tenure: エンティティ定義
Tenure.entity("User")
    .identity(UserId.class)
    .initialState("Registered")
    .on(EmailVerified.class)
        .from("Registered").to("Verified")
        .apply((state, event) -> state.withEmailVerified(event.email()))
    .on(PlanSelected.class)
        .from("Verified").to("Trial")
        .apply((state, event) -> state.withPlan(event.plan()))
    .on(BanIssued.class)
        .fromAny().to("Banned")
        .apply((state, event) -> state.withBanReason(event.reason()))
    .build();
```

**ヤン:** 最初に目立つ違い。

```
tramli:  .from(STATE).external(TO, guard)      — 遷移先とguardのペア
Tenure:  .on(Event).from(STATE).to(TO).apply() — イベントが遷移を駆動
```

**Harel:** Tenureはイベントが一級市民だ。私のCartaと同じ。しかしCartaはEvent.of("name")で文字列ベースだった。Tenureはイベントが**型**だ。

**Helland:** 型にするのは意図的だ。イベントは**永続化される**。JSONにシリアライズされ、ログに残る。型であればスキーマが明確になる。

### 2.2 イベントストア

```java
// tramli: FlowContext（可変HashMap）
ctx.put(new PaymentResult(...));
PaymentResult result = ctx.get(PaymentResult.class);

// Tenure: イベントログ（追記のみ）
entity.apply(new EmailVerified("user@example.com"));
entity.apply(new PlanSelected(Plan.TRIAL));
// 現在の状態はイベントの畳み込みで導出
UserState current = entity.state();  // fold(initial, events)
```

**リヴァイ:** 追記のみか。putで上書きしない。

**Helland:** 上書きしないことで**監査ログが自動的に得られる**。「いつ、何が起きたか」が完全に記録される。tramliのFlowContextは可変なので、過去の状態を再構築できない。

**ヤン:** tramliのTransitionRecordがあるのでは？

**Helland:** TransitionRecordは遷移の記録だ。**コンテキストの変化の記録ではない**。「PaymentPendingからPaymentConfirmedに遷移した」は記録されるが、「PaymentResult{status=OK, amount=1000}が追加された」は記録されない。

---

## Act 3: 冪等性

**Helland:** P3の冪等性。これはtramliに**完全に欠如している**概念だ。

```java
// tramli: resumeを2回呼ぶと状態が2回遷移する可能性
engine.resumeAndExecute(flowId, data);  // 1回目: PENDING → CONFIRMED
engine.resumeAndExecute(flowId, data);  // 2回目: CONFIRMED → ???（予期しない）

// Tenure: 同じイベントを2回applyしても結果は同じ
entity.apply(new PaymentReceived(txnId: "txn-001", amount: 1000));
entity.apply(new PaymentReceived(txnId: "txn-001", amount: 1000));  // 冪等: 無視
```

**リヴァイ:** 冪等性の判定はどうする？

**Helland:** イベントに**一意識別子**を持たせる。txnId, eventId, correlationId——名前は何でもいい。同じIDのイベントが既にログにあれば、2回目は無視。

```java
Tenure.entity("User")
    .idempotencyKey(event -> event.eventId())  // 全イベントに適用
    ...
```

**ヤン:** tramliで同等のことをするなら？

**Helland:** guardの中で重複チェックをするしかない。しかし**ビルド時に保証できない**。冪等性は実装者の責務になる。

**Harel:** 私のCartaでも冪等性は扱わなかった。これはStatechart理論の範囲外だ。

**Helland:** だからこそ重要なんだ。理論が扱わない領域を、実用ライブラリは扱わなければならない。

---

## Act 4: 補償（Compensation）

**Helland:** P4。tramliのv0.1.0にはsnapshot/restoreがあった。processorが失敗したらcontextを巻き戻す。Opaはこれを**廃止**した。正しい判断だ。しかし理由が違う。

```
Opa の理由: stack overflow が起きるから（技術的問題）
Helland の理由: ロールバックは分散システムでは不可能だから（設計原則）
```

**リヴァイ:** 何が違う？

**Helland:** tramliのsnapshot/restoreは**ローカルなロールバック**だ。1つのFlowContext内で巻き戻す。これは小さなスコープでは動く。しかしprocessorが**外部システムに副作用を起こしていたら**、snapshot/restoreではその副作用は戻せない。

```
processor: 支払い処理
  1. ctx.put(PaymentIntent)
  2. paymentGateway.charge(amount)  ← 外部副作用
  3. 例外発生
  → snapshot/restore で ctx は戻るが、
    paymentGateway.charge() は実行済み。戻せない。
```

**ヤン:** だからtramliは「processorにI/Oを入れない」ルールがあるんですよね。

**Helland:** そうだ。しかし長寿命エンティティでは、**遷移間に外部副作用が必然的に入る**。支払い、通知、外部API呼び出し。これらはSM外で行われるが、失敗したときの**補償**が必要だ。

```java
// Tenure: 補償アクションの宣言
Tenure.entity("User")
    .on(PaymentCharged.class)
        .from("Trial").to("Active")
        .apply((state, event) -> state.activated(event.txnId()))
        .compensate(PaymentRefunded.class)  // ← 補償イベント
```

**Harel:** 補償イベントは「逆方向の遷移」ではないのか。

**Helland:** 違う。Active→Trialに戻すのではない。**PaymentRefundedという新しいイベントをログに追記する**。状態は`fold(initial, [..., PaymentCharged, PaymentRefunded])`で再計算される。結果としてTrialに戻るかもしれないし、別の状態（RefundPending）になるかもしれない。

**ヤン:** event sourcingだからこそできる設計ですね。可変状態モデルでは、「巻き戻し」は本質的に困難。

---

## Act 5: data-flow検証の位置づけ

**Opa:** ここまでTenureの特徴を見た。で、data-flow検証は？

**Helland:** ……ない。

**リヴァイ:** ないのか。

**Helland:** 正直に言おう。Tenureの設計では、**イベントが型付き**であることで型安全性は担保される。`PaymentCharged`イベントには`txnId`と`amount`がある。applyのラムダ内で型チェックが効く。

しかしtramliのrequires/produces的な、**「このイベントを処理するにはこのデータが先にないとダメ」というビルド時検証は存在しない**。

```java
// Tenure: 型安全だが、順序依存性は検証できない
.on(PaymentCharged.class)
    .from("Trial").to("Active")
    .apply((state, event) -> state.activated(event.txnId()))
    // event 内に txnId がある → 型チェック ✅
    // しかし Trial に到達するのに PlanSelected が先に必要か → 検証なし ❌
```

**Harel:** tramliのrequires/producesは**遷移間の順序依存性**を検証する。Tenureのevent sourcingは**単一イベント内の型安全性**を保証する。レイヤーが違う。

**ヤン:** 整理します。

```
                    tramli                  Tenure
型安全性            TypeId + downcast       イベント型 + ラムダ引数型
遷移間の順序依存    requires/produces で検証  検証なし
イベント内のデータ  guardのvalidate()        apply()のラムダ型
ビルド時保証        data-flow整合性          なし（型チェックのみ）
```

**Helland:** ……認めよう。Tenureにtramliのdata-flow検証を入れたくなってきた。

---

## Act 6: Tenureにdata-flow検証を入れるとどうなるか

**Opa:** やってみよう。

**Helland:** event sourcingとdata-flow検証の統合。イベントのapply()が何を必要とし、何を生むか。

```java
Tenure.entity("User")
    .on(EmailVerified.class)
        .from("Registered").to("Verified")
        .requires()             // ← 何もrequireしない（初回イベント）
        .produces(VerifiedEmail.class)
        .apply((state, event) -> state.withEmail(event.email()))

    .on(PlanSelected.class)
        .from("Verified").to("Trial")
        .requires(VerifiedEmail.class)       // ← EmailVerifiedの後でないとダメ
        .produces(SelectedPlan.class)
        .apply((state, event) -> state.withPlan(event.plan()))
```

**ヤン:** しかし待ってください。event sourcingでは**状態はイベントの畳み込み**。requires/producesが検証するのは**コンテキスト内のデータ**。この2つはどう対応する？

**Helland:** 良い問いだ。Tenureでは状態がイベントログから導出される。「VerifiedEmailがavailable」とは、イベントログに`EmailVerified`が含まれていることを意味する。

```
available_at("Verified") = { VerifiedEmail }
  ← EmailVerified イベントの produces に VerifiedEmail がある
  ← "Registered" → "Verified" の遷移で追加
```

**Harel:** tramliの`available_at()`がそのまま使える。違いはavailableのソースが「FlowContextのput」ではなく「イベントログのapply」であること。

**Opa:** 面白い。tramliではprocesforが`ctx.put()`する。Tenureではイベントのapplyがproducesに相当するデータを生む。検証ロジックは同じ。**データの保管場所が違うだけ**。

```
tramli:   processor → ctx.put(T)       → available_at に T が追加
Tenure:   event.apply → state.with(T)  → available_at に T が追加
```

**Helland:** つまり、data-flow検証は**状態管理モデルに依存しない**。可変コンテキストでもイベントログでも、「この遷移でこの型が利用可能になる」という情報があれば検証できる。

**リヴァイ:** data-flow検証はtramliの実装詳細ではなく、**汎用的な概念**だということか。

---

## Act 7: Tenure + data-flow vs tramli — 比較

**Opa:** Tenure + data-flow検証の全体像を比較する。

```
                    tramli                      Tenure+DF
─────────────────────────────────────────────────────────────
中心概念            フロー（状態遷移）          エンティティ（長寿命）
状態管理            FlowContext（可変HashMap）   イベントログ（追記のみ）
data-flow検証       ✅ requires/produces         ✅ requires/produces
冪等性              なし                         組み込み（eventId）
補償                なし（error transition）      補償イベント
監査ログ            TransitionRecord（遷移のみ） イベントログ（データ含む）
時間モデル          TTL / perpetual              エンティティの寿命（年単位）
外部イベント        resume_and_execute           entity.apply(event)
状態の再構築        不可（可変状態）              可能（fold）
スナップショット    廃止済み                     N/A（全履歴保持）
メモリモデル        FlowInstance in memory/DB     イベントログ + 導出状態
```

**ヤン:** Tenure+DFはtramliの上位互換に見えますが……。

**リヴァイ:** 複雑性は？

**Helland:** 高い。event sourcingの実装は、可変状態より本質的に複雑だ。

```
tramli の実装コスト:
  FlowContext: HashMap<TypeId, Box<dyn CloneAny>>  — 50行
  FlowEngine: start + resume + auto_chain          — 150行

Tenure の実装コスト:
  EventStore: Vec<Event> + snapshot間隔 + 再構築     — 300行
  Entity: fold(initial, events) + apply + validate   — 200行
  IdempotencyFilter: eventId重複チェック              — 50行
  CompensationRegistry: 補償イベントのマッピング      — 100行
  合計: 最低でも tramli の 3-4倍
```

**Harel:** ゼロ依存で3言語対応するとなると、この複雑性は重い。

**Helland:** ……そうだ。これが現実だ。

---

## Act 8: tramliはどこに立っているか

**Opa:** 3つのライブラリの設計空間を並べてみる。

```
              制御構造の表現力
              高
               │
          Carta│(Harel)
               │          ★ Carta+DF
               │
               │                    ★ Tenure+DF
               │
               │     ★ tramli
               │
              低├─────────────────────────── 高
              低   data-flow検証の精度

              ※ 円の大きさ ≈ 実装複雑性
              Carta: 中   tramli: 小   Tenure+DF: 大
```

**ヤン:** tramliは左下——制御構造の表現力は低いがdata-flow検証は高い。Cartaは左上——制御は高いがdata-flowがない。Tenure+DFは右上寄り——両方高いが実装が巨大。

**Helland:** そしてCarta+DFは前回のセッションで「tramliに収束する」ことがわかった。Tenure+DFは？

**Opa:** Tenure+DFの実装複雑性を下げるとどうなるか。

```
Tenure+DFから削るもの:
  - event sourcing → 可変状態に戻す = tramli の FlowContext
  - 冪等性 → アプリの責務にする = tramli と同じ
  - 補償 → error transition にする = tramli と同じ
  - 長寿命エンティティモデル → perpetual フローで代替 = tramli と同じ
```

**リヴァイ:** ……また tramli になるぞ。

**Helland:** ……なるな。

**Harel:** 面白い。Cartaから出発しても、Tenureから出発しても、data-flow検証を維持しながら複雑性を下げると**tramliに収束する**。

---

## Act 9: 収束しない部分 — tramliが本当に足りないもの

**ヤン:** 2回連続で「tramliに収束する」と言っていますが、**それはtramliが完璧だという意味ではない**ですよね。

**Helland:** その通りだ。収束するのは「コアの状態遷移エンジン」の部分。しかしTenureが持っていてtramliに**本当に足りないもの**がある。

### 9.1 監査ログ（Audit Trail）

```
tramli: TransitionRecordは遷移（from, to, trigger）を記録。データの中身は記録しない。
Tenure: イベントログはデータの中身を含む完全な履歴。
```

**Helland:** 「ユーザーがBANされた理由」を知りたいとき、tramliでは`BanOrder`の中身がTransitionRecordに残らない。Tenureでは`BanIssued{reason: "spam", admin: "alice"}`がそのまま残る。

**リヴァイ:** これは実用上かなり重要だ。

**ヤン:** tramliのTransitionRecordに**スナップショット**を追加する？

```java
// 案: TransitionRecordにcontextのスナップショットを追加
store.recordTransition(flowId, from, to, trigger, ctx.snapshot());
//                                                ^^^^^^^^^^^^^^
```

**Helland:** snapshot/restoreは廃止したはずだ。

**Opa:** 監査ログ用のsnapshotと、ロールバック用のsnapshotは別の話。監査用なら**読み取り専用のコピー**を作るだけ。ロールバックの問題（restoreのstack overflow）は発生しない。

**ヤン:** しかし全遷移でcontext全体をコピーするとメモリコストが高い。

**Helland:** **差分**だけ記録すればいい。「この遷移で追加されたデータ」だけ。

```rust
pub struct TransitionRecord {
    pub flow_id: String,
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub produced_data: HashMap<String, String>,  // alias → JSON serialized
    pub timestamp: Instant,
}
```

**Opa:** producesで宣言された型だけをserializeして記録。alias APIでTypeId→文字列キーに変換済み。

**Harel:** これはevent sourcingの**エッセンス**だけを取り入れている。全履歴からの状態再構築はしないが、「各遷移で何が起きたか」の記録は残る。

**Helland:** 良い妥協だ。完全なevent sourcingの複雑性なしに、監査の実用性を得られる。

### 9.2 冪等性

**Helland:** もう1つ。冪等性。

**リヴァイ:** これは本当に tramli の責務か？

**Helland:** 考えてみよう。resumeAndExecuteを2回呼んだとき——

```
1回目: PaymentPending → guard Accepted → PaymentConfirmed
2回目: PaymentConfirmed → external探す → INVALID_TRANSITION error
```

**ヤン:** 2回目はエラーになります。状態が変わっているので。これは冪等ではないが、**安全**ではあります。

**Helland:** OrderFlowでは安全だ。しかしユーザーライフサイクルでは？

```
1回目: ACTIVE → banGuard Accepted → BANNED
2回目: BANNED → resumeで何が起きる？
  → BANNEDのexternalにunbanGuardがある
  → unbanGuardのrequires(UnbanOrder)が充足されない
  → NO_APPLICABLE_TRANSITION error
```

**ヤン:** これも安全ですね。2回目のresumeは**正しくエラー**になる。

**Helland:** しかし呼び出し側は「成功した」のか「既に処理済み」のかを区別できない。どちらもフローの状態は変わっている。

**Opa:** ……resumeの戻り値に情報を追加する？

```rust
pub enum ResumeResult {
    Transitioned { from: S, to: S },
    AlreadyCompleted,
    NoApplicableTransition,
    GuardRejected { reason: String },
}
```

**リヴァイ:** これはAPIの改善であって冪等性ではない。

**Helland:** その通り。冪等性を本当にやるなら、イベントIDが必要で、ストアに重複チェックが必要で——それはTenureの世界だ。**tramliの責務ではない**。

**ヤン:** 結論: 冪等性はtramliに入れない。しかし**resumeの戻り値の改善**は入れる価値がある。

---

## Act 10: 最終総括

**Opa:** まとめよう。

**Helland:** CartaとTenureの2つの設計実験から見えたこと。

```
Cartaから出発してdata-flow検証を足す → tramli に収束
Tenureから出発して複雑性を下げる    → tramli に収束

tramli は以下の設計空間の「最小構成最適解」:
  - data-flow検証が完全に効く
  - 実装が最小限（ゼロ依存、750行）
  - 3言語で同一セマンティクス
```

**Harel:** 2つの方向から収束したことで、tramliが**Pareto最適**に近いことが確認された。制御構造の表現力かevent sourcingの完全性を足すと、複雑性が急増してdata-flow検証の精度か実装の簡潔さが犠牲になる。

**Helland:** しかしtramliに持ち帰れるものが2つある。

```
持ち帰り1: 遷移ログに produced data の差分を記録する
  → 完全なevent sourcingではないが、監査ログとしての実用性
  → TransitionRecordの拡張（produced_dataフィールド）
  → alias APIと組み合わせてJSON serializable

持ち帰り2: resumeの戻り値を改善する
  → 「遷移した」「既に完了」「該当なし」「Rejected」を区別
  → 冪等性の代わりに、呼び出し側の判断材料を提供
```

**ヤン:** 前回のHarelセッションの持ち帰りと合わせます。

```
Harelセッションの持ち帰り:
  H-1: entry/exit は将来入れる価値あり（今はYAGNI）
  H-2: 表現力と検証精度のトレードオフの言語化
  H-3: 階層的データスコープ（SubFlow withGuaranteed）

Hellandセッションの持ち帰り:
  P-1: 遷移ログにproduced dataの差分記録
  P-2: resumeの戻り値改善
```

**リヴァイ:** H-1, H-3は将来。P-1, P-2は今すぐ入れられるか？

**ヤン:** P-2（resume戻り値）はAPI変更なので慎重に。P-1（produced data記録）はTransitionRecordの追加フィールドで後方互換。

**Opa:** P-1を先に入れよう。DD-019 R4（Multi-External）と一緒にv2.0に含める。P-2はv2.1。

---

## このセッションの最大の発見

**Helland:** 最後に1つ。今回のセッションで**私自身が驚いた**ことがある。

Tenureを設計しているとき、data-flow検証を入れようとしたら「event sourcingのイベントにrequires/producesを付ける」という形になった。そしてそれはtramliのprocessorにrequires/producesを付けるのと**構造的に同一**だった。

つまり、**data-flow検証という概念は、状態管理のパラダイム（可変状態 vs event sourcing vs Statechart）に依存しない、直交した概念である**。

tramliがこれを発見し、実用的なライブラリとして実装したことは、どのパラダイムの上にも載せられる汎用的な貢献だ。論文を書くなら、この点を強調すべきだ。

```
「data-flow検証はステートマシンの実装パラダイムに直交する。
  可変コンテキスト、イベントログ、階層状態のいずれの上にも
  requires/producesの概念を載せることで、ビルド時の
  データ整合性検証が可能になる。」
```

**Harel:** 私もこの発見に同意する。前回のセッションで「Statechart理論の40年が手を付けなかった領域」と言ったが、より正確には「**全ての状態管理パラダイムが手を付けなかった、直交する検証レイヤー**」だ。

---

## DD候補の更新

```
DD-019 (R4確定): Multi-External via requires-based routing
DD-020 (future): entry/exit actions with requires/produces
DD-021 (future): SubFlow withGuaranteed — 階層的データスコープ
DD-022 (v2.0候補): TransitionRecord に produced_data 差分を記録
DD-023 (v2.1候補): resume の戻り値を enum 化（Transitioned/AlreadyCompleted/NoApplicable/Rejected）
```
