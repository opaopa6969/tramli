---
name: choose-flow-pattern
description: tramli で FlowDefinition と Pipeline のどちらを使うか、3種遷移（Auto/External/Branch）の使い分けを判断する基準
volta:
  version: 1
  namespace: tramli
  locality: repo
  tags: [tramli, flow-definition, pipeline, design-decision]
  applies_when:
    - repo.has_file: lang/
  requires:
    tools: []
    resources: []
  min_role: viewer
  export: allowed
---
# tramli のフローパターン選択

tramli には2つのトップレベル構造がある: **FlowDefinition** と **Pipeline**。外部イベントの有無で選択する。

## 1. FlowDefinition vs Pipeline

| 観点 | FlowDefinition | Pipeline |
|------|---------------|---------|
| **外部イベント** | あり（HTTP callback, webhook, user action 等） | なし |
| **状態** | 明示的な状態遷移（enum） | 順次実行（状態を持たない） |
| **遷移の種類** | Auto / External / Branch / SubFlow | step（直線的） |
| **一時停止** | External 遷移で flow を一時停止し、外部イベントで resume | 不可（最後まで一気に実行） |
| **タイムアウト** | External 遷移に per-state timeout を設定可能 | なし |
| **エラールーティング** | onError / onStepError / onAnyError | PipelineException（failedStep + completedSteps） |
| **DataFlowGraph** | あり（build 時に構築） | あり（pipeline.dataFlow()） |
| **用途** | 認証フロー、決済フロー、承認チェーン | CSV インポート、データ変換パイプライン |

### 選択基準

- **外部イベントを待つ必要がある** → FlowDefinition
- **順次処理で十分、一時停止しない** → Pipeline
- **状態遷移を明示的に追跡したい** → FlowDefinition
- **シンプルな変換チェーン** → Pipeline

## 2. 3種遷移の使い分け（FlowDefinition）

### Auto transition（`from(S).auto(to, processor)`）

いつ: 前のステップ直後に**即座に**内部処理を実行するとき。

```java
.from(CREATED).auto(PAYMENT_PENDING, orderInit)
// CREATED → OrderInit が実行 → PAYMENT_PENDING（一時停止なし）
```

特徴:
- 同期的（マイクロ秒単位）
- 複数の auto を連鎖できる（auto-chain）
- 外部イベントを待たない
- auto-chain にループがあると build() の DAG チェックで失敗する

### External transition（`from(S).external(to, guard)`）

いつ: 外部イベント（HTTP callback、webhook、ユーザー操作）を待つとき。

```java
.from(PAYMENT_PENDING).external(CONFIRMED, paymentGuard)
// PAYMENT_PENDING で一時停止 → resumeAndExecute() が呼ばれるまで待機
```

特徴:
- flow が一時停止する（状態をストレージに永続化可能）
- guard が外部イベントのデータを検証
- per-state timeout を設定可能（`external(to, guard, timeout)`）
- auto/branch と同じ状態で併用すると build() が失敗する（チェック #7）

### Branch transition（`from(S).branch(branch).to(S, label).endBranch()`）

いつ: コンテキストデータに基づいて**条件分岐**するとき。

```java
.from(RISK_CHECKED).branch(riskBranch)
    .to(COMPLETE, "low_risk", sessionIssue)
    .to(MFA_REQUIRED, "high_risk", mfaInit)
    .to(BLOCKED, "blocked")
    .endBranch()
// riskBranch.decide() が "low_risk"/"high_risk"/"blocked" を返す
```

特徴:
- `BranchProcessor.decide()` がラベル文字列を返す
- ラベルに対応する `.to()` に遷移する
- auto と同じく同期的（一時停止しない）
- branch の全ラベルが `.to()` で定義されている必要がある（チェック #5）

### SubFlow transition（`from(S).subFlow(def).onExit(...).endSubFlow()`）

いつ: 子フローを親フローに埋め込むとき。

```java
.from(PAYMENT).subFlow(paymentDetailFlow)
    .onExit("DONE", PAYMENT_COMPLETE)
    .onExit("FAILED", PAYMENT_FAILED)
    .endSubFlow()
```

特徴:
- 子フローの terminal 状態を親フローの状態にマッピング
- ネスト深さは最大3段
- 循環参照は build() が検出する（チェック #11）

## 3. 非同期統合パターン

tramli は**同期的**な判定エンジン。非同期 I/O は SM の外で行う。

```
SM start()（同期、μs）→ async I/O（外部）→ SM resume()（同期、μs）
```

- **Java**: virtual threads で blocking I/O を扱う。async 不要
- **Rust**: async を SM 内部に入れると Future が FlowContext の `&mut` を保持して stack overflow の危険。SM の外で async を扱う
- **TypeScript**: `AsyncStateProcessor` が External 遷移でのみ使用可能。Auto 遷移は同期必須

## 4. tramli と carta の設計思想の対比

tramli は **flat enum**（階層なし）を意図的に選択している。carta は階層状態機械を許容する。

- tramli の選択理由: flat は到達可能性・DAG チェックが単純。並行状態を持たないことで検証が閉じる
- carta のアプローチ: 階層で複雑な状態モデリングが可能だが、検証がより複雑
- どちらが良いわけではない。ユースケースによる（DGE セッション dge-session-harel-carta.md で対比）

## 判断基準

- 外部イベントが1つでもある → FlowDefinition
- 純粋な順次変換 → Pipeline
- auto-chain でループを作らない（build() が検出するが、設計時に避ける）
- external と auto/branch を同じ状態に混ぜない
- 非同期処理は SM の外で。TS だけ AsyncStateProcessor が External で使える
