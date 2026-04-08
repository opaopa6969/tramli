# DGE Session R3: TransitionHintを疑う — requiresがルーティングそのものではないか

**Date:** 2026-04-08
**Participants:** David Harel, ヤン・ウェンリー, Pat Helland, リヴァイ
**Facilitator:** Opa
**Topic:** R2の案D（TransitionHint）に残る設計の匂いを追求する

---

## Act 1: 匂いの正体

**Opa:** R2で案D（TransitionHint）に落ち着きかけたが、まだ匂う。TransitionHintは制御情報をexternalDataに混ぜてる。tramliの哲学は「data-flowが全てを駆動する」。ルーティングのためだけのString型がcontextに入るのは筋が悪い。

**ヤン:** 整理しましょう。TransitionHintが解決した問題は2つでした。

```
問題1: どのguardを評価するか（ルーティング）
問題2: guard_failure_countをどのguardに帰属させるか
```

**Helland:** そして私が気になっているのは、**ルーティングは本当に新しい仕組みが必要か**ということだ。

**Opa:** どういうこと？

**Helland:** tramliの全てはrequires/producesで駆動されている。ビルド時検証も、DataFlowGraphも、available_atも。**guardのrequires()がイベントルーティングそのものではないか？**

```java
.from(ACTIVE).external(CHURNED, churnGuard)     // requires: [ChurnRequest]
.from(ACTIVE).external(BANNED, banGuard)         // requires: [BanOrder]
.from(ACTIVE).external(PAYMENT_FAILED, payFailGuard)  // requires: [PaymentFailure]
```

resumeで`BanOrder`をexternalDataに入れたら、banGuardのrequiresが満たされる。churnGuardの`ChurnRequest`は満たされない。**ルーティングは型が決めている。**

**リヴァイ:** ……TransitionHintは要らないのか？

**Harel:** 待て。それは案Cの「guardが自己選択する」と同じではないか。R2で否定した案だ。

**ヤン:** 否定した理由を思い出しましょう。

```
R2で案Cを否定した理由:
1. 複数guardがAcceptedを返す曖昧性
2. guard_failure_countの帰属先が不明
3. guardの評価順序が意味を持つ
```

**Helland:** 1つずつ再検討しよう。

---

## Act 2: 曖昧性の再検討 — 本当に起きるか

**Helland:** 複数guardがAcceptedを返すケース。R2の例を再掲する。

```java
banGuard.requires()   → [BanOrder]
churnGuard.requires() → [ChurnRequest]
```

**両方がAcceptedを返すには、externalDataにBanOrderとChurnRequestの両方が入っている必要がある。**

**リヴァイ:** 1回のresumeでBANと退会を同時にやる奴がいるか？

**ヤン:** いません。アプリがresumeを呼ぶとき、「これはBAN処理です」と認識してBanOrderを渡す。ChurnRequestを同時に渡すことはない。

**Harel:** しかし、こういうケースはどうだ。

```java
// 2つのguardが同じ型をrequireする
suspendGuard.requires() → [AdminAction]
banGuard.requires()     → [AdminAction]
```

**ヤン:** これは**設計が悪い**。AdminActionという汎用型ではなく、SuspendOrderとBanOrderという専用型を使うべき。tramliの型ベースcontext設計は「1型 = 1概念」を前提にしている。

**Helland:** つまり、**曖昧性はguardのrequiresが異なる型を使えば構造的に発生しない**。同じ型を使うのはアンチパターンであり、tramliの責務で防ぐ必要はない。

**リヴァイ:** ビルド時にwarningは出せるか？ 「このstateの複数guardが同じrequiresを持ってるぞ」と。

**Opa:** 出せる。check_external_guard_requiresで、同一stateの複数guardのrequires集合が重複してたらwarning。

**Harel:** ……認めよう。TypeIdによるキー設計が、イベントルーティングを暗黙的に解決している。**型がイベントだ。**

---

## Act 3: guard_failure_countの帰属 — 型ではなく遷移先で解決

**ヤン:** R2の問題2。guard_failure_countの帰属先。TransitionHintではヒント名をキーにHashMapで管理しました。TransitionHintなしでどうするか。

**Helland:** そもそもguard_failure_countは**何のために**ある？

**Opa:** 同じguardがN回Rejectedされたらerror transitionに流す。max_guard_retriesの制御。

**Helland:** 「同じguard」を識別する方法が必要だ。TransitionHintではStringだった。しかし、もっと自然な識別子がある。**遷移先（target state）だ。**

```java
.from(ACTIVE).external(CHURNED, churnGuard)     // target = CHURNED
.from(ACTIVE).external(BANNED, banGuard)         // target = BANNED
```

各`.external(TARGET, guard)`はユニークな`(from, to)`ペアを持つ。これをキーにすればいい。

```rust
// v1.7
guard_failure_count: usize

// v2.0
guard_failure_counts: HashMap<S, usize>  // target state → count
```

**リヴァイ:** banGuardが3回Rejectedされたら、guard_failure_counts[BANNED] = 3。churnGuardには影響なし。

**ヤン:** TransitionHintのStringキーより型安全ですね。ステートenumがキーなので、typoの余地がない。

**Harel:** しかし同一stateから同一targetへの複数externalは？

**ヤン:** それは許可しない。**同一(from, to)ペアに複数external禁止**。これは`check_external_uniqueness`の緩和版で、`check_external_unique_target`に置き換える。

```
v1.7: 1 state → 最大1 external（厳しすぎ）
v2.0: 1 state → 複数external OK、ただし同一targetは1つまで
```

**Helland:** 合理的だ。同一stateから同一targetへの複数ルートが必要なケースは思いつかない。

---

## Act 4: engineの評価ロジック

**Opa:** ルーティングとカウンタが解決した。engineの評価ロジックを書く。

```
resume_and_execute(flow_id, external_data):
  1. external_dataをcontextにput
  2. current stateから全externalのguardを取得
  3. 各guardのrequires()がcontextで充足されるかチェック（evaluateせずチェックだけ）
  4. 充足されるguardが:
     - 0個 → FlowError("NO_APPLICABLE_TRANSITION")
     - 1個 → そのguardをevaluate
     - 複数 → strict_modeならFlowError("AMBIGUOUS"), 通常は最初をevaluate + warning log
  5. guardの結果:
     - Accepted → 遷移
     - Rejected → guard_failure_counts[target] += 1 → max超過ならerror transition
     - Expired → flow complete
```

**リヴァイ:** ステップ3がポイントだな。**evaluateする前にrequiresの充足で絞り込む**。

**ヤン:** これは新しい概念ではなくて、ビルド時検証の`check_requires_produces`と同じロジックの実行時版。tramliの一貫性が保たれます。

**Harel:** ステップ3のチェックは`context.has_type_id()`で行えるな。guardの`validate()`は呼ばない。コストはHashMapのlookupだけ。

**Helland:** 補足。ステップ3で充足チェックをするなら、**guardが内部的にRejectedを返す必要はほぼなくなる**。requiresが充足されていればAccepted、されていなければそもそも評価されない。Rejectedが返るのは「型はあるが値が不正」のケースだけだ。

**ヤン:** 良い指摘ですね。guardの責務が明確になる。

```
requiresの充足: ルーティング（engine側で判定）
validate(): バリデーション（guard側で判定）
```

**リヴァイ:** ルーティングとバリデーションが分離される。綺麗だ。

---

## Act 5: Builder DSLの確認 — 新API vs 既存API緩和

**Opa:** ここで最初の問いに戻る。「.multiExternal()のような新メソッドが必要か、それとも既存の.external()の制約緩和で済むか」。

**ヤン:** R3の案では、変更点は以下だけです。

```
Builder側:
  ① check_external_uniqueness → check_external_unique_target に置換
  ② 新メソッド追加: なし

Engine側:
  ① resume_and_executeの引数: 変更なし
  ② 評価ロジック: requires充足チェック + 絞り込みを追加

FlowInstance側:
  ① guard_failure_counts: HashMap<S, usize> を追加
  ② guard_failure_count: deprecated（後方互換のため sum() を返す）

新しい型:
  なし（TransitionHintも不要）
```

**リヴァイ:** 新メソッドゼロ。新型ゼロ。既存の`.external()`をそのまま複数書けるようにするだけ。

**Harel:** 美しい。**APIの表面積が増えない。**

**Helland:** しかし確認させてくれ。既存のsingle-externalフローは本当に壊れないか。

```java
// v1.7: OrderFlow
.from(PAYMENT_PENDING).external(PAYMENT_CONFIRMED, paymentGuard)
engine.resumeAndExecute(flowId, data);
```

v2.0のエンジンで動かすと:
1. PAYMENT_PENDINGの全externalを取得 → paymentGuardだけ
2. requires充足チェック → 充足
3. paymentGuard.validate()を呼ぶ
4. 結果に従って遷移

v1.7と**完全に同一の動作**。✅

**ヤン:** guard_failure_counts は？

```
v1.7: guard_failure_count = 3 → error
v2.0: guard_failure_counts = {PAYMENT_CONFIRMED: 3} → error
      guard_failure_count(deprecated) = sum() = 3 → 同値
```

✅

---

## Act 6: external_dataがcontextに「残る」問題

**Helland:** 1つ見落としがある。ステップ1で「external_dataをcontextにput」しているが、Rejectedされたguardのexternal_dataがcontextに残る。次のresumeで別のguardが呼ばれたとき、前回のデータがcontextにある。

```
resume 1回目: BanOrder を渡す → banGuard Rejected → BanOrderがcontextに残る
resume 2回目: ChurnRequest を渡す → churnGuard の前に banGuard も充足される（BanOrderが残ってるから）
```

**リヴァイ:** ……これは問題だ。

**ヤン:** 3つの選択肢。

```
A) Rejected時にexternal_dataをcontextから除去する
B) requiresの充足チェックを「今回のexternal_dataに含まれるか」で行う
C) 何もしない（アプリの責務）
```

**Harel:** 案Aは危険だ。guardがRejectedを返すのは「データが不正」だからであって、「データが不要」だからではない。除去したら次のretryで再度渡す必要がある。

**Helland:** 案Bは実装が面倒だ。「今回渡されたデータ」と「以前からcontextにあるデータ」を区別する必要がある。

**ヤン:** ……でもこれ、**single-externalでも同じ問題がある**のでは？

```
v1.7: resume 1回目でBanOrderを渡す → Rejected → contextにBanOrderが残る
      resume 2回目でChurnRequestを渡す → paymentGuardが評価される
      → paymentGuardはBanOrderもChurnRequestも気にしない（requiresにないから）
      → 問題なし
```

**リヴァイ:** single-externalなら、guardは1つだから「前回の別のguardのデータが残る」問題が起きない。multi-externalだから起きる。

**Helland:** 正確に言うと、問題は「前回rejectedされたイベントのデータが残っていることで、今回別のイベントを意図しているのに前回のguardも充足されてしまう」こと。

**Opa:** ……ここだな。ここが匂いの根っこだ。

---

## Act 7: 分離すべきか — external_dataとcontextの関係

**ヤン:** 本質的な問いは、**external_dataはcontextにputすべきなのか**。

現状の設計:
```
resumeAndExecute(flowId, externalData)
  → externalData を context に put
  → guard.validate(context) を呼ぶ
  → guardはcontextから読む
```

**Helland:** external_dataをcontextにputするのは「guardの前」だ。guardがAcceptedを返す前に、データはcontextに入っている。

**Harel:** これはsingle-externalでは問題にならなかった。guardが1つしかないから、Accepted/Rejectedに関わらずcontextに入っていて良い。multi-externalでは——

**ヤン:** 解法が見えました。**Acceptedのguardに対応するexternal_dataだけをcontextに残す**のではなく、そもそも**guardの評価にcontextを使わない**。

いや、それは大きすぎる変更か。

**リヴァイ:** 落ち着け。問題をもう一度見ろ。

```
resume 1: BanOrder → banGuard Rejected → BanOrder残る
resume 2: ChurnRequest → banGuardもchurnGuardも充足 → 曖昧
```

これが起きるのは「BanOrderが残る」から。じゃあ**Rejected時にexternal_dataだけを消す**のはどうだ。

**ヤン:** 案Aですね。Harel博士が「次のretryで再度渡す必要がある」と指摘しました。

**リヴァイ:** それでいいだろ。retryするならデータも再度渡せ。**resumeは冪等であるべき**だ。前回のデータが残ってることに依存する設計のほうがおかしい。

**Helland:** ……リヴァイが正しい。**external_dataはリクエストスコープだ。contextはフロースコープだ。**この2つは寿命が違う。

```
contextに永続的に残るべき: guardがAccepted時にproducesしたデータ
contextに残るべきでない: resume呼び出しで渡されたが、Rejectedで使われなかったデータ
```

**ヤン:** つまり、こう。

```
resume_and_execute(flow_id, external_data):
  1. external_dataを一時的にcontextにput（全部）
  2. requires充足チェックで対象guardを絞り込む
  3. guardを評価
  4-a. Accepted → guard.produces() をcontextにput。external_dataはcontextに残す
  4-b. Rejected → external_dataをcontextから除去する（元に戻す）
```

**Harel:** ステップ4-bは、以前のsnapshot/restoreと同じ問題を引き起こさないか？

**Opa:** ……いや、違う。snapshot/restoreはcontext全体のcloneだった。ここで必要なのは「今回putしたキーだけを除去する」。TypeIdのリストを覚えておいてremoveするだけだ。cloneは不要。

```rust
// 実装
let inserted_keys: Vec<TypeId> = external_data.iter().map(|(tid, _)| *tid).collect();
for (tid, val) in external_data { ctx.put_raw(tid, val); }

// ... guard評価 ...

if rejected {
    for tid in &inserted_keys {
        // contextに元々あった場合は？
    }
}
```

**リヴァイ:** ……元々あった場合はどうする？

**Opa:** あー。external_dataで上書きされたキーがcontextに元々存在していた場合、removeすると元の値も消える。

**ヤン:** ここはsnapshot/restoreと同じ罠ですね。

**Helland:** しかし、**external_dataで既存のcontextキーを上書きすることは正常なユースケースか**？

**ヤン:** ……ない。external_dataは「新しいデータを外から注入する」もの。既存のcontextの値を上書きする意図はない。

**Opa:** じゃあ、**上書きでなく新規insertされたキーだけを追跡**すればいい。

```rust
let mut newly_inserted: Vec<TypeId> = Vec::new();
for (tid, val) in external_data {
    if !ctx.has_type_id(&tid) {
        newly_inserted.push(tid);
    }
    ctx.put_raw(tid, val);
}

// Rejected の場合
for tid in newly_inserted {
    ctx.remove_raw(tid);  // ← 新API: contextからキーを除去
}
```

**リヴァイ:** context.remove_raw()が必要だが、pub(crate)なら外に漏れない。

**Harel:** この設計なら、external_dataのリクエストスコープが正しく管理される。Rejectedで巻き戻し、Acceptedで永続化。cloneは発生しない。

---

## Act 8: 最終設計の確定

**ヤン:** R1→R2→R3の変遷を整理します。

```
R1: .on("event", target, guard) + resume引数変更
    → 全既存コード破壊。却下。

R2: .external()複数許可 + TransitionHint
    → resume APIは維持。しかしTransitionHintは制御とデータの混在。

R3: .external()複数許可 + requiresベースルーティング
    → resume APIは維持。新型なし。新メソッドなし。
    → guard_failure_countsはtarget stateキー。
    → external_dataのリクエストスコープ管理を追加。
```

**Harel:** 変更点を最小化した。

```
Builder:
  変更: check_external_uniqueness → check_external_unique_target
  追加: check_external_requires_disjoint（warning: 同一stateの複数guardが同じrequires）

Engine:
  変更: 評価前のrequires充足フィルタリング追加
  変更: Rejected時のexternal_dataロールバック追加

FlowInstance:
  追加: guard_failure_counts: HashMap<S, usize>
  変更: guard_failure_count → deprecated（sum()を返す）

FlowContext:
  追加: remove_raw(TypeId) — pub(crate)

新しいpublic型: なし
新しいpublicメソッド: なし
既存APIシグネチャ変更: なし
```

**Helland:** 美しい。外から見えるAPIの変更がゼロで、振る舞いだけが拡張される。**Open-Closed Principleそのもの**。

**リヴァイ:** 既存のOrderFlowテストは？

**ヤン:** 全部そのまま通ります。single-externalではrequires充足フィルタが常に1件に絞り込むので、現状と同一の動作パスを通る。Rejected時のロールバックも、single-externalでは元々外部データが1種類なので影響なし。

---

## Act 9: 残存リスクの最終確認

**Opa:** 穴がないか最後に確認。

### リスク1: requires充足チェックの偽陽性

```
guardA.requires() → [UserProfile]
guardB.requires() → [UserProfile, BanOrder]

external_dataに BanOrder だけ渡す。
contextには以前から UserProfile がある。

→ guardA: requires [UserProfile] → 充足（contextにある）
→ guardB: requires [UserProfile, BanOrder] → 充足（contextにUserProfile、external_dataにBanOrder）
→ 2つ充足 → 曖昧
```

**リヴァイ:** UserProfileは以前からcontextにある。今回のイベントとは無関係。なのにguardAが充足される。

**ヤン:** これがR2で指摘された「requiresの重複」問題。しかし観点が違う。guardAのrequiresがguardBのrequiresの**真部分集合**のとき、guardBが充足されれば必ずguardAも充足される。

**Harel:** 解決策は2つ。

```
A) ビルド時: 同一stateの複数guardのrequiresに包含関係がある場合warning
B) 実行時: 「今回のexternal_dataに含まれるrequires」が最も多いguardを優先（最特化マッチ）
```

**Helland:** 案Bは「最長一致」ルールだな。URLルーティングと同じ。

**ヤン:** しかし最長一致はオーバーエンジニアリングでは。**案Aのwarningだけで十分**です。

設計ガイドとして:
```
✅ 良い: 各guardのrequiresに、そのイベント固有の「トリガー型」を含める
   banGuard.requires()   → [BanOrder]          ← BanOrderがトリガー
   churnGuard.requires() → [ChurnRequest]      ← ChurnRequestがトリガー

❌ 悪い: 共通型だけでrequiresを構成する
   suspendGuard.requires() → [AdminAction]     ← どのguardか区別できない
   banGuard.requires()     → [AdminAction]
```

**リヴァイ:** 「1 guard = 1 トリガー型」をベストプラクティスとして文書化しろ。

### リスク2: FlowStoreのrestoreとguard_failure_counts

```
v1.7のDBスキーマ: guard_failure_count INTEGER
v2.0のDBスキーマ: guard_failure_counts JSON (追加)
```

restore時に`guard_failure_counts`がnull/未定義の場合:
```rust
guard_failure_counts: HashMap::new()  // 空で初期化
// guard_failure_count(deprecated) からの変換は行わない
// → 既存のsingle-externalフローでは guard_failure_counts は空のまま
// → 最初のRejectedで guard_failure_counts[target] = 1 が入る
```

**Helland:** 後方互換。追加フィールドなのでスキーマ破壊なし。✅

### リスク3: perpetualフローでの蓄積

```
ユーザーライフサイクルは数年。guard_failure_countsが蓄積し続ける。
BANを10回試みてRejected → guard_failure_counts[BANNED] = 10
1年後にBANが通る → guard_failure_counts[BANNED] は残ったまま
```

**リヴァイ:** Acceptedになったらそのtargetのカウンタをリセットすべきでは。

**ヤン:** いや、Acceptedになったらそもそもそのstateからは遷移してしまう。次にACTIVEに戻ったとき、guard_failure_countsをリセットすべきか。

**Helland:** **stateに入った時点で全カウンタをリセット**。これが自然だ。OrderFlowでも「PAYMENT_PENDINGに戻ったら」カウンタはリセットされるべき。

**Opa:** 現状のsingle-external版ではtransition_to()でリセットしてない。

**リヴァイ:** してないのか。

**Opa:** してない。incrementだけ。でも実害がないのは、OrderFlowでは同じstateに2回入ることがないから。ユーザーライフサイクルではACTIVE→SUSPENDED→ACTIVEで同じstateに再入する。

**ヤン:** transition_to()でguard_failure_countsをクリアする。これはsingle-external版でも正しい修正ですね。

```rust
pub(crate) fn transition_to(&mut self, state: S) {
    self.current_state = state;
    self.guard_failure_counts.clear();
}
```

✅

---

## 最終決定: DD-019 v3 — Multi-External via requires-based routing

### 変更一覧（全量）

```
■ Builder
  - check_external_uniqueness を check_external_unique_target に置換
    （同一(from, to)ペアに複数external禁止。異なるtoなら複数OK）
  - check_external_requires_disjoint を追加（warning）
    （同一stateの複数guardのrequiresに包含関係がある場合）

■ FlowContext
  - remove_raw(TypeId) を追加 [pub(crate)]

■ FlowEngine.resume_and_execute()
  - requires充足フィルタリングを追加（evaluate前にrequiresの充足で絞り込み）
  - Rejected時のexternal_dataロールバックを追加

■ FlowInstance
  - guard_failure_counts: HashMap<S, usize> を追加
  - guard_failure_count: deprecated（guard_failure_counts.values().sum()）
  - transition_to() で guard_failure_counts.clear() を追加

■ 新しいpublic型: なし
■ 新しいpublicメソッド: なし
■ 既存APIシグネチャ変更: なし
■ 既存テスト影響: なし
```

### ベストプラクティス（ドキュメント追加）

```
1. 各guardのrequiresに、そのイベント固有の「トリガー型」を含める
   → 型がイベントルーティングを決定する
2. 汎用型（AdminAction等）だけでrequiresを構成しない
3. resumeで渡すexternal_dataは、意図するguardのトリガー型のみを含める
4. strict_modeでは複数guard充足時にエラー
```

### R1→R2→R3の推移

```
                R1            R2              R3
新public型     なし          TransitionHint   なし
新メソッド     .on()         なし             なし
resume変更     引数追加      なし             なし
ルーティング   イベント名    ヒント文字列     requires型（暗黙）
failure帰属    イベント名    ヒントキー       target state
API互換性      ❌ 破壊       ✅ 維持          ✅ 維持
設計の純度     △ 新概念追加  △ 制御とデータ混在  ✅ 既存概念の延長
```

---

## このセッションで消えた「におい」

```
R2の匂い1: TransitionHintという制御情報がcontextに混在
  → R3: 消えた。ルーティングはrequiresが暗黙的に行う。

R2の匂い2: ヒント文字列のtypoリスク
  → R3: 消えた。文字列を使わない。型で決まる。

R2の匂い3: イベント名という新概念の導入
  → R3: 消えた。tramliの既存概念（requires/produces）だけで動く。
```

## 残存「におい」（許容する）

```
1. requiresの包含関係による偽陽性
   → ベストプラクティス + warning で対処。100%の型安全性は求めない。

2. guard_failure_countsの永続化
   → 追加フィールド。後方互換だが、FlowStoreの実装例にドキュメント追加が必要。

3. external_dataロールバックの複雑性
   → pub(crate)のremove_raw + newly_inserted追跡。内部実装の複雑性は増すが、
     外部APIは変わらないので許容する。
```
