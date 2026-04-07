<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-008: tramli-ts コアライブラリ

**Status:** draft
**Decision:** [DD-003](../decisions/DD-003-native-over-http.md), [DD-004](../decisions/DD-004-typescript-only-v010.md), [DD-005](../decisions/DD-005-flowkey-branded-string.md), [DD-006](../decisions/DD-006-async-flow-engine.md)
**Session:** [multilang-r2](../sessions/2026-04-07-tramli-multilang-r2.md)

## 概要

Java 版 tramli の TypeScript ネイティブ移植。`@unlaxer/tramli` として npm publish。

## リポジトリ

`tramli-ts` — Java 版とは独立リポ。

## パッケージ

```json
{
  "name": "@unlaxer/tramli",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "license": "MIT",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2.0",
    "yaml": "^2.5"
  }
}
```

ゼロ runtime 依存。

## ファイル構成 (~800 lines)

```
src/
  index.ts           (~15)  — public API re-exports
  tramli.ts          (~20)  — static factory (define, engine)
  types.ts           (~80)  — FlowState, Transition, StateProcessor, TransitionGuard, etc.
  flow-key.ts        (~10)  — FlowKey<T> branded type + flowKey() helper
  flow-context.ts    (~50)  — FlowContext (snapshot, restoreFrom)
  flow-definition.ts (~300) — FlowDefinition + Builder + 9 validations
  flow-engine.ts     (~180) — FlowEngine (async)
  flow-instance.ts   (~40)  — FlowInstance + restore()
  flow-error.ts      (~30)  — FlowError + static factories
  in-memory-flow-store.ts (~40) — InMemoryFlowStore
  mermaid-generator.ts (~50) — MermaidGenerator
```

## 主要設計パターン（Java → TypeScript）

### 1. FlowState: string literal union + Record

```typescript
// ユーザー定義
type OrderState = 'CREATED' | 'PAYMENT_PENDING' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'CANCELLED';

const stateConfig = {
  CREATED:           { terminal: false, initial: true },
  PAYMENT_PENDING:   { terminal: false, initial: false },
  PAYMENT_CONFIRMED: { terminal: false, initial: false },
  SHIPPED:           { terminal: true,  initial: false },
  CANCELLED:         { terminal: true,  initial: false },
} as const satisfies Record<OrderState, { terminal: boolean; initial: boolean }>;
```

### 2. FlowKey: branded string

```typescript
type FlowKey<T> = string & { __type: T };
function flowKey<T>(name: string): FlowKey<T> { return name as FlowKey<T>; }

// ユーザー定義
interface OrderRequest { itemId: string; quantity: number }
const OrderRequest = flowKey<OrderRequest>('OrderRequest');
```

### 3. GuardOutput: discriminated union

```typescript
type GuardOutput =
  | { type: 'accepted'; data?: Map<string, unknown> }
  | { type: 'rejected'; reason: string }
  | { type: 'expired' };
```

### 4. StateProcessor / TransitionGuard / BranchProcessor

```typescript
interface StateProcessor<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  produces: FlowKey<unknown>[];
  process(ctx: FlowContext): Promise<void> | void;
}

interface TransitionGuard<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  produces: FlowKey<unknown>[];
  maxRetries: number;
  validate(ctx: FlowContext): Promise<GuardOutput> | GuardOutput;
}

interface BranchProcessor<S extends string> {
  name: string;
  requires: FlowKey<unknown>[];
  decide(ctx: FlowContext): Promise<string> | string;
}
```

### 5. Builder DSL

```typescript
const def = Tramli.define<OrderState>('order', stateConfig)
  .ttl(hours(24))
  .maxGuardRetries(3)
  .initiallyAvailable(OrderRequest)
  .from('CREATED').auto('PAYMENT_PENDING', orderInit)
  .from('PAYMENT_PENDING').external('PAYMENT_CONFIRMED', paymentGuard)
  .from('PAYMENT_CONFIRMED').auto('SHIPPED', ship)
  .onAnyError('CANCELLED')
  .build();
```

### 6. FlowEngine (async)

```typescript
class FlowEngine {
  async startFlow<S extends string>(
    definition: FlowDefinition<S>, sessionId: string,
    initialData: Map<string, unknown>
  ): Promise<FlowInstance<S>>

  async resumeAndExecute<S extends string>(
    flowId: string, definition: FlowDefinition<S>,
    externalData?: Map<string, unknown>
  ): Promise<FlowInstance<S>>
}
```

## 9 Build-time Validations (build() ランタイム)

Java 版と同一:
1. checkInitialState
2. checkReachability
3. checkPathToTerminal
4. checkDag
5. checkExternalUniqueness
6. checkBranchCompleteness
7. checkRequiresProduces (intersection 方式)
8. checkAutoExternalConflict
9. checkTerminalNoOutgoing

## テスト

- vitest
- Java 版と同等のテストケース（OrderFlow, FlowContext, InvalidTransition, FlowEngineError）
- shared-tests YAML ハーネス (TECH-009)

## 実装順序

1. types.ts + flow-key.ts + flow-error.ts (基盤)
2. flow-context.ts (データ層)
3. flow-definition.ts + Builder + 9 validations (定義層)
4. flow-instance.ts + in-memory-flow-store.ts (永続化層)
5. flow-engine.ts (実行層)
6. mermaid-generator.ts (ユーティリティ)
7. テスト
8. npm publish
