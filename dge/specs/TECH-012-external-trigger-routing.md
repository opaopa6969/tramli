---
status: accepted
generated_by: DGE
session: ../sessions/2026-09-04-external-trigger-routing.md
implemented_by: issue-103
---

# TECH-012: External trigger routing

> DGE によって生成され、3言語の parity test で受け入れた仕様。

## 目的

External 遷移の識別を guard のデータ依存から分離し、空 `requires`、宣言順依存、不一致 fallback を安全に扱う。

## API

### TypeScript

```typescript
.from('READY').externalOn(DrainRequested, 'DRAINING', drainGuard)
```

```typescript
externalOn(
  trigger: FlowKey<unknown>,
  to: S,
  guard: TransitionGuard<S>,
  processorOrOptions?: StateProcessor<S> | { processor?: StateProcessor<S>; timeout?: number },
): Builder<S>
```

### Java

```java
.from(READY).externalOn(DrainRequested.class, DRAINING, drainGuard)
```

`externalOn(Class<?> trigger, S to, TransitionGuard guard)` を追加し、既存 `external` と同じ processor / timeout の組み合わせを提供する。

### Rust

```rust
.from(State::Ready).external_on::<DrainRequested>(State::Draining, DrainGuard)
```

`external_on<T: 'static>(to, guard)` と `external_on_with_processor<T: 'static>(to, guard, processor)` を追加する。既存 timeout builder と合成可能にする。
timeout 用に `external_on_with_timeout` と
`external_on_with_processor_and_timeout` も同じ規則で提供する。

## Routing metadata

public `Transition` の形は変更しない。trigger metadata は `TransitionGuard` の後方互換 hook に置く。

- TypeScript: optional `externalTrigger?: FlowKey<unknown>`
- Java: default method `Class<?> externalTrigger()`（既定値 `null`）
- Rust: default methods `external_trigger() -> Option<TypeId>` と診断用の型名

`externalOn` は元の guard の全メソッドへ委譲し、trigger metadata だけを追加する内部 wrapper を生成する。これにより Java record constructor と Rust struct literal の互換性を保つ。

trigger key は遷移選択だけに使う。guard が値を読む場合は、その key を `requires` にも明示する。

## Build validation

同一 state に複数 External がある場合:

1. 全て `externalOn`、または全て legacy `external` でなければ `EXTERNAL_ROUTING_MIXED`。
2. 明示 mode では trigger key の重複を `EXTERNAL_TRIGGER_NOT_DISTINCT`。
3. legacy mode では既存どおり同一 `requires` 集合を `EXTERNAL_REQUIRES_NOT_DISTINCT`。
4. single External は明示・legacy のどちらも許可する。

## Runtime selection

### Explicit trigger mode

今回の `externalData` に trigger key が含まれる遷移だけを候補にする。

- 候補1件: その遷移を評価
- 候補0件: `EXTERNAL_EVENT_NOT_MATCHED`
- 候補2件以上: `EXTERNAL_EVENT_AMBIGUOUS`

### Legacy requires mode

- single External: 従来どおりその遷移を評価
- Multi-External: `requires` が今回の externalData に全て含まれる候補を集める
- 候補のうち `requires` 要素数が最大の遷移を選ぶ
- 最大候補が複数: `EXTERNAL_EVENT_AMBIGUOUS`
- 候補0件: `EXTERNAL_EVENT_NOT_MATCHED`

宣言順は選択結果に影響してはならない。

## Introspection

`waitingFor()` / `waiting_for()` は現在 state の全 External を対象にする。

- explicit mode: 全 trigger key の重複なし和集合
- legacy mode: 全 guard `requires` の重複なし和集合
- active sub-flow がある場合: 最深 sub-flow の同じ結果

Mermaid の External label に明示 trigger の型名を `on TriggerName` として含める。

## Compatibility

- `resumeAndExecute` / `resume_and_execute` のシグネチャは変更しない。
- 既存 single External の動作は変更しない。
- 既存 legacy Multi-External の正常な一意一致は維持する。
- 以前は宣言順で動いていた同時一致と、不一致時 fallback は明示エラーへ変わる。これは誤遷移を止める安全修正とする。

## Acceptance criteria

1. 3言語に同等の builder API、transition model、validation、runtime selection がある。
2. shared S10 に explicit trigger、空 requires、最長一致、同率曖昧、不一致、mixed mode、waitingFor の cases がある。
3. 既存テストが全て通る。
4. SPEC、日英 README、language guide、Mermaid 表示が実装と一致する。
5. 公開 API の移行例がある。
6. public `Transition` の field / record component は増やさない。
