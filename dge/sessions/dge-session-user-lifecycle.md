# DGE Session: tramli × ユーザーライフサイクル — 暗黙stateの明示化

**Date:** 2026-04-08
**Participants:** David Harel, ヤン・ウェンリー, Pat Helland, リヴァイ
**Facilitator:** Opa
**Topic:** tramli を長寿命トランザクション（ユーザーライフサイクル）に適用する設計

---

## Act 1: 問題の提示

**Opa:** 今のtramliはOrderFlowみたいな短寿命フローに最適化されてる。でもユーザーのサインアップから退会までの状態遷移——これも本質的にはステートマシンだよね。DBのフラグ列で暗黙管理されてる状態を明示化したい。

**Harel:** 待ってくれ。まず事実を確認させてほしい。君のtramliは、私のStatechartのどの部分を採用して、どの部分を捨てたんだ？

**Opa:** DD-017で、Statechartのorthogonal regionsとhistory stateは却下した。代わりにFlow Compositionで階層を実現してる。

**Harel:** ……それは、私の1987年の論文の*核心*を捨てたということだ。Statechartを作った動機は何だったか覚えているか？ **状態爆発の問題**だ。フラットなFSMでは直交する関心事を組み合わせると状態数が掛け算になる。ユーザーライフサイクルはまさにその問題を持っている。

**ヤン:** Harel博士の指摘は正しい。ただ、全部を一度に解く必要はないでしょう。まず問いを整理しませんか。tramliをユーザーライフサイクルに適用するとき、**具体的に何が壊れるのか**。

**リヴァイ:** 俺もそれが聞きたい。理論はいい。で、実際にコード書いたら何が詰まるんだ？

---

## Act 2: 最初の壁 — Multi-External

**Opa:** 一番先に詰まるのはここ。tramliは1つのstateにExternalが1つだけ。でもACTIVEなユーザーには複数のイベントが来る。退会、BAN、支払い失敗、プラン変更……。

```
ACTIVE状態:
  ← ユーザーが退会     → CHURNED
  ← 管理者がBAN       → BANNED
  ← 支払い失敗         → PAYMENT_FAILED
  ← プラン変更         → ACTIVE（自己遷移）
  ← 何もしない（日常）  → ACTIVE（滞留）
```

**Helland:** これは私がずっと言ってきたことだ。現実のエンティティは**複数の外部イベントに対して開いている**。注文のような直線的なプロセスは例外であって、ユーザー、口座、在庫——長く生きるエンティティは常にマルチイベントだ。

**ヤン:** ……つまりOrderFlowが特殊で、ユーザーライフサイクルが普通なんですね。tramliが`check_external_uniqueness`で1つに制限しているのは、OrderFlowに最適化した結果であって、本質的な制約ではない。

**Harel:** 当然だ。古典的なFSMでも1つの状態から複数の遷移は基本中の基本だ。制限する理由がない。

**リヴァイ:** なんで1つに絞ったんだ？

**Opa:** 安全側に倒した。Externalが複数あると、同時に2つのイベントが来たときの競合を考える必要がある。1つなら考えなくていい。

**Helland:** それは正しい判断だった——**当時は**。しかしユーザーライフサイクルでは避けられない。競合は設計で解決すべきで、APIの制限で回避すべきではない。

**ヤン:** 具体的なAPI案を出しましょう。2つあると思います。

```java
// 案A: イベント名付きExternal（新API）
.from(ACTIVE)
    .on("churn", CHURNED, churnGuard)
    .on("ban", BANNED, banGuard)
    .on("payment_fail", PAYMENT_FAILED, paymentFailGuard)

// 案B: External + Branch（現APIの組み合わせ）
.from(ACTIVE).external(ACTIVE, routingGuard)  // guardがイベント種別を判定
// → guardがcontextに EventType を put
// → ACTIVE自己遷移後、Branch で分岐
```

**リヴァイ:** 案Bは回りくどい。ACTIVE→ACTIVE の自己遷移を経由するとか、実戦で「何やってんだこれ」って言われる。

**Harel:** 案Aだ。これはイベント駆動FSMの標準的な形だ。UMLのステートマシン図もこの形を採用している。

**Helland:** 案Aに賛成だが、1つ条件がある。**イベントの排他性を検証できるか**？ 同じstateに`churn`と`ban`が同時に来たとき、どちらが優先されるか。これはビルド時に検証できる問題ではなく、実行時のポリシーだ。

**Opa:** つまり、resume時にイベント名を渡すAPIが要る。

```java
// 現在
engine.resumeAndExecute(flowId, externalData);

// 変更後
engine.resumeAndExecute(flowId, "ban", externalData);
```

**ヤン:** engineはイベント名を見て、対応するguardだけを評価する。これなら競合は呼び出し側が制御する。同時に2つ呼ぶならアプリ層でロックを取る。tramliの責務ではない。

**リヴァイ:** それでいい。tramliに並行制御を入れるな。責務が増えすぎる。

---

### ▶ 設計決定候補: DD-019 Multi-External Transition

```
.from(STATE)
    .on("event_name", TARGET, guard)

engine.resumeAndExecute(flowId, "event_name", data)
```

- 1つのstateに複数のon()を許可
- build時検証: 同一stateの全guardのrequiresがそのstateのavailableで充足されること
- 実行時: イベント名が一致するguardのみ評価
- 競合制御はtramliの責務外（アプリ層）
- **既存のsingle external APIとの互換**: `.external(to, guard)` は `.on("_default", to, guard)` の糖衣構文として維持

---

## Act 3: 時間スケールと永続化

**Helland:** 次の問題。ユーザーライフサイクルは数年続く。FlowInstanceをメモリに持ち続けるのは非現実的だ。

**Opa:** perpetualフロー + DBに永続化して都度restoreを想定してる。

**Helland:** いいだろう。しかしここで私の「Life beyond Distributed Transactions」の論点が出てくる。**長寿命エンティティの状態管理は、トランザクションの問題ではなく、エンティティの自然な寿命の問題だ**。OrderFlowは「作って、処理して、完了」。ユーザーは「存在し続ける」。

**ヤン:** 具体的に何が変わりますか？

**Helland:** 3つ。

1. **バージョニング**: ユーザーが2年前にサインアップしたとき、FlowDefinitionはv1.0だった。今はv1.5だ。restoreするとき、どのFlowDefinitionを使う？
2. **マイグレーション**: v1.0でACTIVEだったユーザーを、v1.5のACTIVEにマッピングできるか？ 状態名が同じでも、v1.5では新しいcontextデータが必要かもしれない。
3. **スナップショットの整合性**: DBに保存された状態が「PAYMENT_FAILED」で、contextに`PaymentResult`があるべきなのに欠落していたら？

**Harel:** バージョニングはStatechartの標準的な問題で、標準的な解はない。しかしtramliの`DataFlowGraph.diff()`が使えるのではないか？ v1.0とv1.5のdata-flow graphを比較して、マイグレーションの安全性を検証する。

**Opa:** `versionCompatibility()`も1.4.0で入れた。

**Helland:** 問題は、**マイグレーションの実行**だ。検証だけでは足りない。v1.0のACTIVEからv1.5のACTIVEへの遷移で、足りないcontextデータをどう補うか？

**ヤン:** これは……tramliの責務なのか？ FlowStoreのrestore時にマイグレーションスクリプトを走らせるのはアプリの責務では？

**リヴァイ:** そうだ。tramliにマイグレーションエンジンまで入れるな。**検証だけ**提供しろ。「v1.0→v1.5でこのデータが足りなくなる」と教えてくれれば、あとは開発者が対処する。

**Helland:** 合理的だ。tramliは**マイグレーションの安全性を検証**し、**実行はアプリに任せる**。これは`checkRequiresProduces`の哲学と一貫している。

---

### ▶ 設計ガイドライン: 長寿命フローの永続化

```
1. TTL: Duration::MAX または perpetual フロー
2. FlowStore: DB実装必須（InMemoryは不可）
3. restore時のFlowDefinitionバージョン: 常に最新を使用
4. マイグレーション安全性: DataFlowGraph.diff() + versionCompatibility() で検証
5. マイグレーション実行: アプリの責務（tramliは検証のみ）
6. FlowContext永続化: alias APIでTypeId→文字列キーに変換してJSON保存
```

---

## Act 4: 直交状態 — 最大の論点

**Harel:** さて、避けて通れない問題だ。ユーザーの「アカウント状態」と「サブスクリプション状態」は**直交**している。

```
アカウント: REGISTERED → VERIFIED → ACTIVE → SUSPENDED → BANNED → DELETED
サブスク:   NONE → TRIAL → PAID → EXPIRED → CANCELLED
```

BANされたユーザーの課金は続くかもしれない。ACTIVEなユーザーのサブスクが切れるかもしれない。これをフラットにすると——

**リヴァイ:** 5×5で25状態。しかも遷移は掛け算以上に増える。やってられん。

**Harel:** だからorthogonal regionsを作ったんだ。2つの独立した状態機械を並行実行して、interactionは共有変数（tramliでいうFlowContext）経由で行う。

**ヤン:** ……Harel博士、お聞きしますが。orthogonal regionsを実装した結果、**誰がそれを正しく使えましたか**？ UML Statechartのorthogonal regionsを正しく実装しているツールがどれだけあるか。

**Harel:** ……多くはない。

**ヤン:** tramliの価値は「シンプルさ」です。orthogonal regionsを入れたら、builder DSLの複雑さが倍増する。DD-017の判断は正しかった。

**Helland:** 私はヤンに同意する。しかし問題は残る。直交状態をどう扱うか。

**Opa:** 前回のレビューで「2つのフローを並行実行してFlowContextで連携する」案を出した。

```java
// 2つの独立したFlowDefinition
var accountFlow = Tramli.define("account", AccountState.class)...;
var subscriptionFlow = Tramli.define("subscription", SubscriptionState.class)...;

// 同じFlowContextを共有する2つのFlowInstance
engine.startFlow(accountFlow, sessionId, sharedData);
engine.startFlow(subscriptionFlow, sessionId, sharedData);
```

**Harel:** これは本質的にはorthogonal regionsと同じことだ。ただし**暗黙的に**やっている。2つのフローの相互作用を**誰が検証する**？

**ヤン:** そこがポイントですね。フローAのguardがフローBの状態を読む場合——

```java
// subscriptionFlowのguard内
GuardOutput validate(FlowContext ctx) {
    // accountFlowの状態をcontextから読む
    AccountState accountState = ctx.get(AccountState.class);
    if (accountState == BANNED) {
        return GuardOutput.rejected("Account is banned");
    }
    ...
}
```

これは動くが、tramliの**ビルド時検証が効かない**。accountFlowが`AccountState`をcontextに入れることをsubscriptionFlowのビルドは知らない。

**リヴァイ:** それ、バグの温床じゃねえか。

**Helland:** そうだ。しかし解決策は2つある。

**案1: Coordinator Flow**

```java
// 3つ目のフロー: 2つのフローを統括
var lifecycleFlow = Tramli.define("lifecycle", LifecycleState.class)
    .from(ACTIVE)
        .subFlow(accountFlow)
        .subFlow(subscriptionFlow)
    ...
```

しかしこれはDD-017のSubFlowと矛盾する。SubFlowは直列であって並列ではない。

**案2: Cross-Flow Contract**

```java
// 新API: フロー間のデータ契約を宣言
Tramli.crossFlowContract()
    .flow("account").produces(AccountState.class)
    .flow("subscription").requires(AccountState.class)
    .verify();  // ビルド時に両フローのdata-flow graphを突合
```

**ヤン:** 案2が面白い。tramliの「検証はする、実行はしない」の哲学に合っている。フローの並行実行はアプリが管理し、tramliはデータ契約の整合性だけを検証する。

**Harel:** ……認めよう、それは実用的だ。orthogonal regionsの形式的な力は失われるが、**実際に開発者が使えるレベルの検証**は得られる。

**リヴァイ:** 案2でいい。ただし、v1.xで入れるな。まず単一フローのMulti-Externalで十分に使えることを確認してからだ。

---

### ▶ 設計判断候補: 直交状態の扱い

**結論: orthogonal regionsは入れない。Cross-Flow Contractを将来の候補とする。**

段階:
```
Phase 1 (DD-019): Multi-External → 単一フローでユーザーライフサイクルの80%をカバー
Phase 2 (future): Cross-Flow Contract → 残り20%（直交状態が本当に必要なケース）
```

Phase 1だけで十分に実用的かを、volta-gatewayとDGEシナリオで検証してからPhase 2を判断する。

---

## Act 5: 80%カバレッジの検証

**ヤン:** Phase 1の「80%カバー」は本当ですか？ 具体的にユーザーライフサイクルを1つのフローで書いてみましょう。

```java
enum UserState {
    REGISTERED,         // initial
    EMAIL_VERIFIED,
    TRIAL,
    ACTIVE,
    PAYMENT_FAILED,
    SUSPENDED,
    BANNED,
    CHURNED,            // terminal
    DELETED             // terminal
}

var userFlow = Tramli.define("user-lifecycle", UserState.class)
    .ttl(Duration.ofDays(365 * 10))  // 10年

    // 登録 → メール認証
    .from(REGISTERED)
        .on("verify_email", EMAIL_VERIFIED, emailVerifyGuard)

    // メール認証済み → トライアル開始
    .from(EMAIL_VERIFIED)
        .on("select_plan", TRIAL, planSelectionGuard)

    // トライアル中
    .from(TRIAL)
        .on("payment_success", ACTIVE, paymentGuard)
        .on("trial_expired", PAYMENT_FAILED, trialExpiredGuard)
        .on("ban", BANNED, banGuard)

    // 有料会員
    .from(ACTIVE)
        .on("churn", CHURNED, churnGuard)
        .on("payment_fail", PAYMENT_FAILED, paymentFailGuard)
        .on("suspend", SUSPENDED, suspendGuard)
        .on("ban", BANNED, banGuard)

    // 支払い失敗（猶予期間）
    .from(PAYMENT_FAILED)
        .on("payment_retry_success", ACTIVE, retryPaymentGuard)
        .on("grace_period_expired", CHURNED, graceExpiredGuard)
        .on("ban", BANNED, banGuard)

    // 一時停止
    .from(SUSPENDED)
        .on("unsuspend", ACTIVE, unsuspendGuard)
        .on("ban", BANNED, banGuard)
        .on("churn", CHURNED, churnGuard)

    // BAN
    .from(BANNED)
        .on("unban", SUSPENDED, unbanGuard)
        .on("delete", DELETED, deleteGuard)

    // 退会（soft delete）
    .from(CHURNED)
        .on("reactivate", ACTIVE, reactivateGuard)
        .on("delete", DELETED, deleteGuard)

    .build();
```

**リヴァイ:** 書けるな。しかも読める。

**Harel:** ……サブスクリプション状態は？

**ヤン:** ここが判断の分かれ目です。サブスクを別フローにするか、このフローに混ぜるか。

**Helland:** 実務的な判断基準を出そう。**サブスクリプションの状態遷移が、アカウントの状態遷移と独立に起きるか？**

- 独立に起きる（例: ACTIVEユーザーのプランアップグレード）→ 別フロー
- 常にアカウント状態と連動する（例: BANされたら課金停止）→ 同一フロー

**リヴァイ:** 実際のサービスだと……半々だな。プラン変更はアカウント状態と無関係に起きる。でもBAN時の課金停止はアカウント遷移に連動する。

**ヤン:** ならばPhase 1では**サブスクリプションを同一フローに入れない**。アカウントライフサイクルだけで十分に価値がある。サブスク管理は別の独立したフローにして、連携が必要になったらPhase 2のCross-Flow Contractを検討する。

**Harel:** その判断なら、80%はカバーできるだろう。残りの20%は、実際にPhase 2が必要だと証明されてから考えればいい。

---

## Act 6: data-flow検証の威力

**Opa:** このフローでdata-flow検証が効くか確認したい。

**ヤン:** 例えば`reactivateGuard`。CHURNEDからACTIVEに戻すとき、何が必要ですか？

```java
struct ReactivateGuard implements TransitionGuard<UserState> {
    requires: [PaymentMethod, ReactivationRequest]
    produces: [ActiveSubscription]
}
```

**Helland:** CHURNEDに到達した時点で、contextに`PaymentMethod`があるか？ ユーザーが退会時にカード情報を削除していたら？

**ヤン:** それがtramliのビルド時検証で検出される。`churnGuard`が`PaymentMethod`をcontextから**消す**なら（……ああ、processorの契約で「消さない」のか）、`PaymentMethod`は残っている。しかし`reactivateGuard`の`requires`に`ReactivationRequest`がある。これはCHURNED到達時点では存在しない。

**Opa:** External transitionだから、resumeの呼び出し側が`ReactivationRequest`をexternal_dataとして渡す。

**リヴァイ:** ……ちょっと待て。external_dataの型がrequiresと一致してるかは検証できるのか？

**Opa:** 現状できてない。guardのrequiresは「contextに存在すること」を要求するが、external_dataで渡されるものはビルド時に不明。

**Harel:** これは重要な穴だ。**Externalのrequiresのうち、contextにないものはexternal_dataで提供される必要がある**。この差分を「外部契約」として明示できないか。

```
reactivateGuard:
  requires from context:  [UserProfile]       ← ビルド時検証可
  requires from external: [ReactivationRequest, PaymentMethod]  ← APIドキュメント生成
```

**ヤン:** `MermaidGenerator.generateExternalContract()`がv1.4.0にある。まさにこれでは？

**Opa:** ……ある。使えるな。

**Helland:** 素晴らしい。これが意味するのは、**ユーザーライフサイクルのフロー定義が、そのまま外部APIのドキュメントになる**ということだ。「CHURNEDからACTIVEに戻すには、ReactivationRequestとPaymentMethodを渡してreactivateイベントを送れ」と。

**リヴァイ:** それはいい。APIドキュメントが嘘をつかなくなる。

---

## Act 7: 総括と優先順位

**Opa:** まとめよう。

**ヤン:** 3つの決定と、1つの保留ですね。

### 決定1: DD-019 Multi-External Transition
```
.from(STATE).on("event", TARGET, guard)
engine.resumeAndExecute(flowId, "event", data)
既存の .external() は .on("_default", ...) の糖衣構文
```

### 決定2: 長寿命フロー設計ガイドライン
```
perpetual or 超長TTL + DB FlowStore + 最新FlowDefinitionでrestore
マイグレーション検証はDataFlowGraph.diff()、実行はアプリ責務
```

### 決定3: Phase 1 スコープ
```
単一フローでユーザーアカウントライフサイクルを実装
サブスクリプションは別フロー（連携なし）
Phase 1の成果でPhase 2（Cross-Flow Contract）の必要性を判断
```

### 保留: Cross-Flow Contract（Phase 2）
```
複数フローのデータ契約を宣言・検証するAPI
orthogonal regionsの代替
Phase 1完了後に需要を評価
```

**Harel:** 私の理想からは遠いが、実用的な判断だ。1つだけ忠告する。Phase 1で直交状態の問題が「本当に起きない」ことを確認してくれ。起きたら、そのときはorthogonal regionsを真剣に検討すべきだ。

**Helland:** 長寿命エンティティの設計は、短寿命のそれとは本質的に違う。tramliがその両方をカバーできるなら、ユニークなポジションを取れる。

**リヴァイ:** いいから早くMulti-External実装して、volta-gatewayに入れろ。議論は十分だ。

**ヤン:** リヴァイ兵長に賛成です。まずは動くものを。

---

## 設計上の発見（このDGEセッションで浮上した論点）

| # | 発見 | 重要度 | 対応 |
|---|------|--------|------|
| 1 | 1 stateに複数Externalが必要（Multi-External） | **Critical** | DD-019 |
| 2 | external_dataの型が検証されない（外部契約の穴） | High | generateExternalContract()の強化 |
| 3 | 長寿命フローのFlowDefinitionバージョニング | High | 設計ガイドライン |
| 4 | 直交状態はPhase 1では不要（80%カバー検証済み） | Medium | Phase 2で再評価 |
| 5 | BANが複数stateから到達可能（共通イベント） | Medium | .on("ban", BANNED, banGuard) を複数stateに書く（冗長だが明示的） |
| 6 | フロー定義 = 外部APIドキュメント（副次的価値） | Medium | MermaidGenerator拡張 |
| 7 | processorの「contextを破壊しない」契約は長寿命で特に重要 | Low | doc強化 |

## Next Actions

1. **DD-019ドラフト作成** — Multi-External Transition API
2. **ユーザーライフサイクルのShared Test YAML** — 上記の9状態フローを3言語で
3. **volta-gatewayにtramli-rust組み込み** — 並行して実施
