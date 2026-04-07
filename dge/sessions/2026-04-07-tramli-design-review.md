# DGE Session: tramli フローエンジン設計レビュー

- **Date**: 2026-04-07
- **Flow**: 🔍 design-review
- **Structure**: 🗣 座談会
- **Template**: api-design
- **Pattern**: pre-release (concurrent-operation, escalation-chain, scale-break, security-adversary)
- **Characters**: ☕ ヤン, 👤 今泉, 🏥 ハウス, 🕵 右京, ⚔ リヴァイ

## Scene 1: 基本契約 — 「そもそも誰が使うの？」

**先輩（ナレーション）**: tramli は Java 21 向けの制約付きフローエンジンだ。ビルド時に8つのバリデーションで不正な状態遷移を弾き、ランタイムの「あれ、このデータどこ？」を撲滅する設計思想。FlowEngine は約120行。今日は v0.1.0 のリリース前レビューとして、設計の「書いてないこと」を洗い出す。

---

**👤 今泉**: えっと、基本的なことを聞いていいですか。この FlowDefinition って、一度 `build()` したら不変なんですよね。で、FlowEngine はステートレスで、FlowStore に状態を預ける。…そもそも、**同じフローを2人が同時に resume したらどうなるんですか？**

**🕵 右京**: *紅茶のカップを置く。* 細かいことが気になるんですよ。`FlowInstance` には `version` フィールドがあります。`FlowInstance.java:15` に。そして `setVersion()` も `FlowInstance.java:48` に。しかしですね、**FlowEngine のどこにも version を読んでいる箇所がない**。`InMemoryFlowStore.save()` も version を一切チェックしていません。楽観ロックの *骨格だけ* 作って、 *肉がない* 状態です。

**☕ ヤン**: *紅茶を啜る。* それ、InMemoryFlowStore はテスト用でしょう？本番の FlowStore 実装者が楽観ロックを入れればいい話じゃないですか。

**🕵 右京**: いいえ、ヤンさん。問題はそこではありません。FlowStore *インターフェース* に楽観ロックの契約が **書かれていない** んです。`loadForUpdate` という名前は「更新のためにロードする」と読めますが、Javadoc もない。実装者は何を保証すべきかわからない。SELECT FOR UPDATE なのか、version チェックなのか、何もしなくていいのか。

**👤 今泉**: 要するに、FlowStore を自分で実装する人は、**何を守ればいいのかわからない** ってことですか？

**🕵 右京**: その通りです。

→ Gap 発見: **FlowStore の永続化契約が未定義** — loadForUpdate のセマンティクス、version による楽観ロック、atomicity の要件が FlowStore インターフェースに明文化されていない。

---

**🏥 ハウス**: *椅子を後ろに傾ける。* 全員嘘をついている。version フィールドの話はいい。だが **もっと根本的な問題がある**。FlowEngine.startFlow() を見ろ。24行目で UUID を生成して、34行目で `store.create(flow)`。ここまではいい。だがその直後、35行目で `executeAutoChain(flow)` を呼んでいる。auto-chain の中で状態が3回遷移する。そして36行目で `store.save(flow)`。

**☕ ヤン**: …何が問題なんです？

**🏥 ハウス**: **auto-chain の途中で JVM が死んだらどうなる？** store.create() は呼ばれた。フローは初期状態で永続化されている。だが auto-chain で3つ進んだ途中の状態遷移は recordTransition() で記録されてるのか？ *いや、されている*。だが最終状態は save() されていない。**transition log と flow の状態が不整合になる**。

**⚔ リヴァイ**: *腕を組む。* 汚い。つまり startFlow も resumeAndExecute も、**auto-chain 全体が one atomic operation になっている前提** で書かれてるが、FlowStore にはその保証がない。recordTransition が途中まで書かれて save が来ない、というのは本番で確実に起きる。

→ Gap 発見: **auto-chain のアトミシティが保証されていない** — executeAutoChain 中の recordTransition と最終 save が一つのトランザクションで実行される保証がない。JVM クラッシュ時にログと状態が不整合になる。

---

## Scene 2: 例外と回復 — 「死に方が雑」

**先輩（ナレーション）**: コードレビューで「processor 例外時のロールバックなし」が指摘されていた。ここをもう少し深掘りする。

---

**👤 今泉**: processor が例外を投げた場合の話ですよね。えっと、FlowEngine の129行目、`autoOrBranch.processor().process(flow.context())` — これが飛んだら？

**⚔ リヴァイ**: executeAutoChain にはtry-catchがない。例外はそのまま startFlow か resumeAndExecute の呼び出し元に飛ぶ。だが問題は、**processor の中で context.put() していたら、その途中のデータは残る** ということだ。

**🏥 ハウス**: *立ち上がる。* しかも、もっと面白いケースがある。FlowEngine.java の83行目を見ろ。`resumeAndExecute` の guard Accepted ブロック。

```java
flow.transitionTo(transition.to());        // 状態遷移完了
store.recordTransition(...);                // ログ記録
if (transition.processor() != null) {
    transition.processor().process(flow.context());  // ← ここで爆発
}
```

状態遷移は **もう済んでいる**。store にも記録されている。だが processor が死んだ。で、例外が飛ぶ。**呼び出し元は何を見る？** flow オブジェクトは遷移済みの状態。だが `store.save(flow)` は108行目だからまだ呼ばれていない。**メモリ上の flow とストア上の flow が乖離する**。

**👤 今泉**: そもそも、エラーが起きたときに **どこに遷移すべきか** って決まってるんですか？ `onError` と `onAnyError` はありますけど、これって guard の maxRetries 超過時しか使われてないですよね？

**🕵 右京**: *資料をめくる。* その通りです。`handleError` は `FlowEngine.java:156` にありますが、呼び出し元は89行目の `guard rejection maxRetries 超過時` のみです。**processor 例外時には handleError が呼ばれない**。error transition という仕組みがあるのに、processor の例外ではそれが使われない。これは設計の矛盾です。

**☕ ヤン**: まあ、processor は「例外を投げない」のが契約だ、と言い張ることもできますけど。

**🏥 ハウス**: *首を振る。* 契約だと言い張るなら、**どこかに書け**。StateProcessor のJavadocにも FlowEngine のドキュメントにも「processor は例外を投げてはならない」とは書かれていない。暗黙の契約は契約じゃない。

→ Gap 発見: **processor/branch 例外時のエラーハンドリング戦略が未定義** — error transition は guard 失敗にのみ対応。processor 例外時は状態とストアが不整合になり、error transition にも遷移しない。例外契約も明文化されていない。

---

**⚔ リヴァイ**: それに関連して。BranchProcessor.decide() が例外を投げた場合も同じだ。FlowEngine.java:137 で `branch.decide(flow.context())` が飛んだら、何の保護もない。

**👤 今泉**: あと、decide() が知らないラベルを返した場合は140行目で `UNKNOWN_BRANCH` 例外になりますけど、**これも error transition に行かない** ですよね？ FlowException が飛ぶだけ。

**🕵 右京**: 細かいことですが、`UNKNOWN_BRANCH` は FlowException、つまり RuntimeException です。つまりフローの利用者は **全ての resumeAndExecute / startFlow 呼び出しを try-catch で囲まなければ安全ではない**。しかし、どの例外がどの状況で飛ぶかのリストが… *紅茶を飲む* …ありませんね。

→ Gap 発見: **例外カタログの欠如** — FlowException のエラーコード一覧はあるが、どのメソッドがどの例外をどの条件で投げるかの体系的な文書がない。利用者は防御的にならざるを得ない。

---

## Scene 3: 時間と生存 — 「TTL の穴」

**先輩（ナレーション）**: tramli には TTL（Time To Live）がある。フロー定義で Duration を指定し、FlowInstance に expiresAt を設定する。だが、その TTL チェックのタイミングに議論がある。

---

**☕ ヤン**: *紅茶を注ぎ足す。* TTL チェックは FlowEngine.java:58 の一箇所だけ。`resumeAndExecute` の冒頭で `Instant.now().isAfter(flow.expiresAt())` を見て、超えてたら EXPIRED で complete。シンプルでいいんじゃないですか。

**🏥 ハウス**: シンプルすぎる。2つのシナリオを考えろ。

**シナリオ A**: auto-chain が10ステップある。最初の resumeAndExecute 時点では TTL 内だった。だが auto-chain の途中で TTL を超えた。**フローは最後まで走り切る**。10ステップ目が「決済確定」だったら？ TTL 超過後に決済が走る。

**👤 今泉**: そもそも、auto-chain って最大深度10ですよね。10ステップあるフローで、1ステップに数秒かかったら… **TTL が1分とかだと普通に超えますよね？**

**🏥 ハウス**: **シナリオ B** はもっと悪い。`startFlow` には TTL チェックがない。FlowEngine.java:21-38 を見ろ。expiresAt を計算して（31行目）flow を作って、そのまま executeAutoChain に入る。**startFlow の時点で既に TTL が 0 秒だったとしても、auto-chain は全部走る**。

**☕ ヤン**: …まあ、TTL 0秒で startFlow する奴がいるかって話ですけど。

**🏥 ハウス**: いるかどうかは問題じゃない。**仕様としてどうあるべきかが決まっていない** のが問題だ。TTL は「最初の external resume までの猶予」なのか、「フロー全体の生存期間」なのか。

**🕵 右京**: *メモを取る。* ハウスさんの指摘を補強しますと、TransitionGuard にも `Expired` という GuardOutput がありますね。これは guard が自主的に「期限切れ」を返すもの。しかし、**この Expired と FlowInstance の TTL ベースの EXPIRED は別物** です。同じ概念に見えて、実は独立したメカニズム。利用者はどちらを使うべきなのか。

→ Gap 発見: **TTL のセマンティクスが未定義** — TTL チェックは resumeAndExecute 冒頭のみ。auto-chain 中の超過は無視される。startFlow には TTL チェックがない。GuardOutput.Expired との関係も不明確。

---

## Scene 4: 拡張性と運用 — 「本番に持っていけるか」

**先輩（ナレーション）**: v0.1.0 としての完成度は高い。だがライブラリとして外部に公開するなら、利用者が本番で使うときのことを考える必要がある。

---

**⚔ リヴァイ**: 本番の話をしよう。**フロー定義を変えたい場合**。例えば v1 の定義で作られたフローが store に残ってる状態で、v2 の定義をデプロイする。`loadForUpdate` は FlowDefinition を引数に取る。だが **store に保存されているフローが v1 で作られたことを知る手段がない**。

**👤 今泉**: FlowInstance に definition への参照がありますよね。`FlowInstance.java:11` に `private final FlowDefinition<S> definition`。

**⚔ リヴァイ**: それは **メモリ上の** 参照だ。永続化して復元したとき、**どの FlowDefinition で作られたか** は失われる。InMemoryFlowStore は FlowInstance をそのまま保持してるから問題にならないが、RDB に保存して復元するとき、フロー定義のバージョンをどう扱うかの指針がない。

**🕵 右京**: もう一つ。FlowInstance のコンストラクタで `definition` を受け取りますが、`loadForUpdate` で渡される definition は **呼び出し側が指定する現在のバージョン** です。つまり、v1 で作られたフローを v2 の definition で resume できてしまう。状態遷移マップが変わっていたら… *紅茶を飲む* …何が起きるか予測がつきませんね。

→ Gap 発見: **フロー定義のバージョニング戦略がない** — FlowInstance にはどの定義バージョンで作られたかの記録がない。定義変更時の互換性チェック、マイグレーション戦略が未定義。

---

**🏥 ハウス**: 運用の話をしよう。フローが途中で止まった。**なぜ止まったか、どうやって調べる？**

**☕ ヤン**: transition log があるでしょう。InMemoryFlowStore.transitionLog() で。

**🏥 ハウス**: *杖で床を叩く。* ログに何が入ってる？ `flowId, from, to, trigger`。以上。**タイムスタンプがない**。`TransitionRecord` は `FlowEngine.java` の recordTransition で作られるが、InMemoryFlowStore の `TransitionRecord` レコードを見ろ。`record TransitionRecord(String flowId, String from, String to, String trigger)`。**いつ遷移したかわからない**。

**👤 今泉**: あと、guard が Rejected を返したとき、**なぜ reject されたかのログもない** ですよね？ `rejected.reason()` は取れるけど、どこにも記録されない。FlowEngine.java:87-93 で `flow.incrementGuardFailure()` して終わり。

**🏥 ハウス**: つまり本番で「このフローなぜ CANCELLED になったんですか」と聞かれたとき、答える手段がない。

→ Gap 発見: **可観測性（Observability）の欠如** — TransitionRecord にタイムスタンプがない。guard rejection の reason が記録されない。フローの「なぜこの状態にいるか」を後から追跡する手段が不足。

---

**⚔ リヴァイ**: テストの話もしておく。InvalidTransitionTest は全状態ペアの補集合を自動生成して検証している。堅い。だが **auto-chain の異常系テストがない**。processor が例外を投げたら？ BranchProcessor が未知のラベルを返したら？ MAX_CHAIN_DEPTH に到達したら？ これらは OrderFlowTest で暗黙的にカバーされてるかもしれないが、**境界値テストが独立して存在しない**。

**☕ ヤン**: まあ、v0.1.0 だし、テストは後から足せばいいんじゃないですか。

**⚔ リヴァイ**: *冷たい目。* テストを「後で」と言った奴で、後で書いた奴を見たことがない。

→ Gap 発見: **異常系・境界値テストの不足** — processor 例外、branch 未知ラベル、MAX_CHAIN_DEPTH 到達、TTL 境界などの異常系テストがない。

---

**🕵 右京**: 最後に一つ。 *資料を広げる。* FlowContext のデータモデルについてです。`Map<Class<?>, Object>` でキーが Class。つまり **同じ型のデータは1つしか持てない**。例えば `String` 型のデータが2つ必要なとき — 注文IDと顧客ID — どちらも `String.class` では入らない。

**☕ ヤン**: だから OrderRequest とか PaymentConfirmation とかラッパー型を作る設計でしょう。

**🕵 右京**: はい。ですが **その設計方針がドキュメント化されていない**。初めて使う人が `ctx.put(String.class, orderId)` と書いて、次の processor で `ctx.put(String.class, customerId)` と書いたら、**黙って上書きされます**。エラーにもなりません。

**🏥 ハウス**: 症状は「データが消えた」。原因は「同じ型で2回 put した」。**最も診断しづらいバグの一つだ**。

→ Gap 発見: **FlowContext の Class キー制約が暗黙的** — 同一型は1エントリのみの制約がドキュメント化されていない。プリミティブ型やString での上書き事故が起きうる。checkRequiresProduces は型の存在チェックのみで、上書き衝突は検出しない。

---

**☕ ヤン**: *紅茶を飲み干す。* まとめると、**コードの品質は高い**。120行のエンジン、8つのビルド時バリデーション、sealed interface — unlaxer 譲りの「制約で正しさを保証する」哲学はしっかり生きてる。ただ、**「書いてあること」は綺麗だけど、「書いてないこと」が多い**。特に FlowStore の契約、例外時の挙動、TTL のセマンティクス。v0.1.0 としては十分だけど、他人に使わせるなら…

**⚔ リヴァイ**: 書け。契約を。テストを。

**🏥 ハウス**: Vicodin くれ。
