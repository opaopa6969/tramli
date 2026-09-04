# DGE Session: External trigger と guard requires の責務分離

**Date:** 2026-09-04  
**Flow:** design-review（座談会型）  
**Theme:** Multi-External の選択をデータ依存から分離し、3言語で後方互換を保つ  
**Characters:** 先輩、今泉（前提）、ヤン（簡素化）、千石（API品質）、リヴァイ（実装）

## 共有アーティファクト

- Issue #91: 骨組み段階で複数 guard が `requires: []` になり、公開版では検証を通過した
- DD-020: 新APIを増やさず、guard の `requires` 集合で External を選択する判断
- Java / TypeScript / Rust の engine: 一致した最初の External を選択し、不一致なら先頭へ fallback
- Java の `Transition` は public record、Rust の `Transition` は public struct で、利用者が直接構築できる
- shared test S10: 異なる単一キーでの選択と、同一 `requires` 集合の build 拒否を確認
- `waitingFor`: 現在は先頭の External guard の `requires` だけを返す
- 過去 DGE R3: 部分集合が同時一致する場合は最長一致を候補に挙げ、最終決定にも記載

## Scene 1: そもそも何を識別しているのか

**先輩:** `requires` は guard が読むデータの宣言として始まった。DD-020 では API を増やさず Multi-External を実現するため、今回渡された外部データのキー集合と `requires` を照合するルーターにもなった。

**今泉:** そもそも「処理に必要なもの」と「どの出来事が起きたか」は同じですか。状態確認だけで通せる disconnect guard は、何も読まないから `requires: []` です。でも disconnect という出来事は存在しますよね。

→ Gap found: `requires` がデータ依存とイベント識別の二つの責務を持ち、依存なしイベントを表現できない

**ヤン:** 今泉の指摘に賛成です。新APIを避けた結果、複雑さが消えたのではなく `requires` に隠れただけでした。骨組みで空配列を置く利用者を責めても、設計上の二重責務は消えません。

**千石:** 賛成します。しかも README は `requires` を「必要なデータ」と説明しています。利用者がその説明どおり空にしたら、ルーティング規則に違反する。これは利用者の誤用ではなく、APIが二つの意味を同じ名前で要求している状態です。

**リヴァイ:** 実装でも証拠がある。engine は `guard.requires` をルーティングに使い、build は同一集合を拒否する。名前と動作がずれている。分けろ。

## Scene 2: 現在の選択規則は決定的か

**先輩:** 現在の3言語実装は、外部データが guard の全 `requires` を含む最初の遷移を選ぶ。該当がなければ先頭の遷移を選ぶ。

**リヴァイ:** 次の順なら `UserProfile` 側が選ばれる。

```text
guardA.requires = [UserProfile]
guardB.requires = [UserProfile, BanOrder]
externalData     = [UserProfile, BanOrder]
```

過去 DGE は guardB を選ぶ最長一致を決めている。実装は first-match だ。テストは subset を build できることしか見ていない。

→ Gap found: 部分集合が同時一致すると宣言順で遷移先が変わり、過去の設計判断と実装がずれている

**千石:** リヴァイに賛成です。同じ定義を並べ替えただけで業務結果が変わるのは許容できません。「subset は許可」と仕様に書くなら、選択規則まで決定的でなければなりません。

**ヤン:** 最長一致なら一部は直ります。ただし同じ要素数の異なる集合が両方一致する場合は残ります。そこでまた宣言順を使うのはやめましょう。同率なら明示的な曖昧エラーで十分です。

**今泉:** 該当がないのに先頭を選ぶのは、要するに「分からないから最初でいい」ということですか。誰が困るのですか。

**リヴァイ:** 間違った guard が retry count を増やし、error route へ行く利用者だ。fallback は削除対象。ただし External が1本だけの既存フローは、その guard を評価する今の動作を残せる。

→ Gap found: 複数 External で一致候補がない場合の先頭 fallback が誤った guard を実行する

## Scene 3: どのAPIなら責務を分けられるか

**先輩:** 候補は三つある。Aは `resumeAndExecute` にイベント名を追加する。Bは guard に任意の matcher を追加する。Cは遷移に単一の型付き trigger key を持たせ、既存の外部データ Map にそのキーを含める。

**ヤン:** Aには反対です。全呼び出しを変え、文字列イベントなら typo も増える。Bにも反対です。任意 predicate は build 時に曖昧性を証明できない。Cなら既存の `FlowKey`、`Class<?>`、`TypeId` を再利用でき、resume の引数も変わりません。

**今泉:** Cは新しい型を増やさないのですか。前に「新APIを増やしたくない」と言って `requires` に寄せたのに、また複雑になりませんか。

**ヤン:** 新しい概念は一つですが、新しいキー体系は不要です。`externalOn(triggerKey, to, guard)` だけを追加する。複雑さの総量は減ります。ルーティングは trigger、guard が読むものは requires、と一文ずつで説明できます。

**千石:** ヤンに賛成します。ただし半端な互換モードには反対です。同じ state で `externalOn` と従来の `external` を混ぜたら、どちらの規則が優先か利用者には分かりません。build で拒否すべきです。

→ Gap found: 明示 trigger と legacy requires routing を同じ state で混在させた場合の優先規則が未定義

**リヴァイ:** 実装案は明快だ。

```text
TypeScript: .externalOn(DrainRequested, 'DRAINING', guard)
Java:       .externalOn(DrainRequested.class, DRAINING, guard)
Rust:       .external_on::<DrainRequested>(Draining, guard)
```

guard に default / optional な trigger metadata を1個持たせ、`externalOn` が元の guard を内部 wrapper で包む。明示モードでは externalData に含まれる trigger が0個なら NOT_MATCHED、2個以上なら AMBIGUOUS。重複 trigger と mixed mode は build で落とす。

**今泉:** trigger の値を guard が読みたい場合はどうなりますか。

**千石:** 読むなら `requires` にも宣言します。同じキーが trigger と requires の両方に現れても、責務は異なります。片方は遷移選択、片方は guard の入力契約です。省略して暗黙に読めるようにする方が品質を落とします。

## Scene 4: 周辺APIと移行

**先輩:** `waitingFor()` は現在、先頭 External の `requires` だけを返している。Mermaid は guard 名を表示するが trigger は表示しない。

**今泉:** 複数待っているのに一つしか返さないなら、名前が単数でも複数形でも事実と違います。新しい trigger を入れても、利用者が待機イベントを発見できないのでは。

→ Gap found: `waitingFor()` が複数 External の候補を網羅せず、明示 trigger 導入時の返却契約もない

**リヴァイ:** 全 External の trigger を和集合で返す。legacy は全 guard の requires の和集合。sub-flow も同じ規則にする。テストを3言語で書け。

**千石:** リヴァイに賛成です。Mermaid にも `on TriggerName` を表示すべきです。モデルを図にする製品が、最重要の選択条件を隠してはいけません。

→ Gap found: 明示 trigger が図・診断・shared test に現れないと、宣言と実行の対応をレビューできない

**ヤン:** ただし legacy を即削除する必要はありません。single External は従来どおり動かす。legacy Multi-External は最長一致に直し、同率または不一致だけ明示エラーにする。新規コードは `externalOn` を推奨する。それで移行は段階的です。

**今泉:** 前も「APIを増やさない」が正しいと言っていました。今回はなぜ変えるのですか。

**ヤン:** 実利用の反証が出たからです。ゼロAPIという局所最適が、空 `requires`、宣言順依存、fallback、誤った `waitingFor` を生みました。判断を守るより、前提が崩れたことを記録する方が簡単です。

**先輩:** セッション構造にも小さな不整合がある。project 指示は default flow を `roundtable` と呼ぶが、実際の `dge/flows/` には `roundtable.yaml` がなく、座談会型に最も近い実在定義は `design-review.yaml` だった。

**今泉:** ヤンの「隠れた複雑さを名前で覆わない」という話に賛成です。DGE自身も、存在しない名前を既定として案内すべきではありません。

→ Gap found: project 指示の `roundtable` と実在 flow 名 `design-review` が不一致

## 素のAPI互換レビュー（auto-merge）

対話とは独立に公開型の変更影響を確認した。

- TypeScript の `Transition` へ optional field を足すだけなら互換性は高い。
- Java の `Transition` は public record であり、record component 追加は canonical constructor の形を変える。
- Rust の `Transition` は public struct であり、field 追加は downstream の struct literal をコンパイル不能にする。

→ Gap found: trigger を public Transition field として追加すると、特に Rust の既存利用者を破壊する

**統合判断:** Transition の形は変えない。`TransitionGuard` に後方互換な trigger metadata hook を追加する。Java / Rust は default method、TypeScript は optional property とし、`externalOn` が元 guard を委譲する内部 wrapper を作る。engine、validation、Mermaid、`waitingFor` は guard の hook を読む。

## Gap 一覧

| # | Gap | Category | Severity |
|---|-----|----------|----------|
| 1 | `requires` が依存宣言とイベント識別を兼務 | Spec-impl mismatch | High |
| 2 | subset 同時一致が宣言順依存で、過去DGEの最長一致と不一致 | Spec-impl mismatch | High |
| 3 | 一致なしで先頭 External を実行する fallback | Safety gap | High |
| 4 | 明示 trigger と legacy routing の混在規則が未定義 | Missing logic | High |
| 5 | `waitingFor()` が先頭候補しか返さない | Integration gap | Medium |
| 6 | trigger の Mermaid・診断・shared test 契約がない | Test coverage | Medium |
| 7 | project 指示の `roundtable` と実在 flow 名 `design-review` が不一致 | Integration gap | Low |
| 8 | public Transition field 追加が downstream 構築コードを破壊 | Type/coercion gap | High |

## Gap 詳細

### Gap 1: 二重責務

- **Observe:** 読むデータがない guard は `requires: []` が正しいが、Multi-External routing では識別不能になる。
- **Suggest:** 遷移に単一の型付き trigger key を宣言する `externalOn` を追加する。
- **Act:** [TECH-012](../specs/TECH-012-external-trigger-routing.md) の API と build 規則を3言語で実装する。

### Gap 2: 宣言順依存

- **Observe:** legacy requires routing は最初の一致を採用し、subset 許可時に順序で結果が変わる。
- **Suggest:** 最大要素数の requires 集合を選び、最大候補が複数なら曖昧エラーにする。
- **Act:** S10 に順序反転、最長一致、同率曖昧の shared scenarios を追加する。

### Gap 3: 不一致 fallback

- **Observe:** 複数 External で候補0件でも先頭 guard が実行される。
- **Suggest:** Multi-External は `EXTERNAL_EVENT_NOT_MATCHED` を返す。single External の互換動作は維持する。
- **Act:** engine error と3言語テストを追加する。

### Gap 4: mixed mode

- **Observe:** 同一 state で明示 trigger と legacy requires routing が混ざると優先順位を定義できない。
- **Suggest:** Multi-External state では全遷移を同じ routing mode に統一する。
- **Act:** build error `EXTERNAL_ROUTING_MIXED` を追加する。

### Gap 5: 待機候補

- **Observe:** `waitingFor()` は先頭遷移しか見ず、Multi-External の候補を欠落させる。
- **Suggest:** 明示 mode は全 trigger、legacy mode は全 requires の和集合を返す。
- **Act:** 親フローと sub-flow の両方に回帰テストを追加する。

### Gap 6: 可視化と検証

- **Observe:** trigger が図や共有仕様に出なければ、新しい契約をレビューできない。
- **Suggest:** Mermaid label、SPEC、language guide、shared scenario を同期する。
- **Act:** 実装 PR の受け入れ条件に3言語 parity を含める。

### Gap 7: flow 名の不一致

- **Observe:** project 指示は default を roundtable とするが `dge/flows/roundtable.yaml` は存在しない。
- **Suggest:** project 指示を実在する `design-review` または `quick` に合わせる。
- **Act:** DGE toolkit 整備の別修正として扱う。

### Gap 8: 公開 Transition の互換性

- **Observe:** Java record component / Rust public struct field の追加は既存 constructor / struct literal を壊す。
- **Suggest:** trigger metadata は guard の default / optional hook と内部 wrapper で表現する。
- **Act:** `Transition` の公開形を変えないことを TECH-012 の受け入れ条件にする。

## 設計判断

1. 新規 Multi-External には `externalOn(triggerKey, to, guard)` を推奨する。
2. `triggerKey` は既存の型付きキー体系を再利用し、新しいイベント名型は作らない。
3. `resumeAndExecute` のシグネチャは変えず、trigger key を従来の externalData に含める。
4. `requires` は guard が読むデータだけを表す。trigger の値も読む場合だけ両方へ宣言する。
5. 同一 state の明示 trigger は一意とし、明示 mode と legacy mode の混在を build で拒否する。
6. legacy Multi-External は最長一致へ修正し、同率・不一致を明示エラーにする。
7. `waitingFor()` は全候補の和集合を返し、Mermaid に明示 trigger を表示する。
8. public `Transition` の形は変えず、guard の後方互換 hook と内部 wrapper で trigger を保持する。

## 次のアクション

1. TECH-012 を採用し、3言語実装・shared tests・SPEC更新へ進む
2. legacy 最長一致の不具合だけ直し、`externalOn` は保留する
3. APIは変えず、固有キーを `requires` に入れる文書化だけ行う
4. DD-020 を維持し、今回の Gap を許容する

**採用:** 1。実利用で DD-020 の「新APIゼロなら単純」という前提が崩れ、後方互換な追加APIで責務を分離できるため。
