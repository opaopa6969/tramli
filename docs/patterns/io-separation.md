# I/O Separation Patterns

Processors contain business logic. When that logic includes I/O (HTTP, DB, file),
cross-language migration becomes harder. This guide shows three patterns for separating
I/O from data transformation, ranked by recommendation.

## Pattern 1: External + Auto-Chain (Recommended)

I/O happens **outside the engine**. Results are passed via `resumeAndExecute()`.
Processors are pure transformations.

```java
// Engine 外で I/O
var tokens = oidcService.exchangeCode(callback);
engine.resumeAndExecute(flowId, def, Map.of(OidcTokens.class, tokens));

// Processor は純粋変換のみ
class TokenValidationProcessor implements StateProcessor {
    @Override public Set<Class<?>> requires() { return Set.of(OidcTokens.class); }
    @Override public Set<Class<?>> produces() { return Set.of(ValidatedTokens.class); }
    @Override public void process(FlowContext ctx) {
        var tokens = ctx.get(OidcTokens.class);
        ctx.put(ValidatedTokens.class, validate(tokens));  // 純粋変換
    }
}
```

```typescript
// Engine 外で I/O
const tokens = await oidcService.exchangeCode(callback);
await engine.resumeAndExecute(flowId, def, new Map([['OidcTokens', tokens]]));
```

```rust
// Engine 外で I/O
let tokens = oidc_service.exchange_code(&callback).await?;
engine.resume_and_execute(&flow_id, vec![(TypeId::of::<OidcTokens>(), Box::new(tokens))]);
```

**Pros**: Processor が純粋関数。テスト容易。言語間で移植しやすい。
**Cons**: External transition が増える。1 リクエストで複数 I/O がある場合、auto-chain が分断。
**When**: I/O が 1 つずつ順に発生するフロー（OAuth, 決済 webhook 等）。

## Pattern 2: Port/Adapter — Constructor Injection (Good)

Processor が I/O を直接呼ばず、インターフェース経由で呼ぶ。

```java
interface TokenExchangePort {
    OidcTokens exchange(String code, String redirectUri);
}

class OidcTokenExchangeProcessor implements StateProcessor {
    private final TokenExchangePort port;  // コンストラクタ注入
    OidcTokenExchangeProcessor(TokenExchangePort port) { this.port = port; }

    @Override public void process(FlowContext ctx) {
        var callback = ctx.get(OidcCallback.class);
        var tokens = port.exchange(callback.code(), callback.redirectUri());
        ctx.put(OidcTokens.class, tokens);
    }
}
```

```typescript
const tokenExchangeProcessor = (port: TokenExchangePort): StateProcessor<S> => ({
  name: 'TokenExchange',
  requires: [OidcCallback], produces: [OidcTokens],
  async process(ctx) {
    const cb = ctx.get(OidcCallback);
    ctx.put(OidcTokens, await port.exchange(cb.code, cb.redirectUri));
  },
});
```

```rust
struct OidcTokenExchangeProcessor<P: TokenExchangePort> { port: P }
impl<P: TokenExchangePort> StateProcessor<S> for OidcTokenExchangeProcessor<P> { ... }
```

**Pros**: Hexagonal Architecture。テスト時は mock port。I/O の契約が明示的。
**Cons**: 本質的にコンストラクタ注入と同じ。移植時は port + processor 両方書き直し。
**When**: 複数の I/O を1つの Processor で扱うフロー。

## Pattern 3: DataProcessor + ServiceBinding (Complex Flows Only)

Processor を「変換ロジック（移植可能）」と「I/O 配線（言語固有）」に分離。

```java
// 移植可能: 純粋変換
interface DataProcessor<In, Out> { Out transform(In input); }

// 言語固有: I/O 配線
class OidcTokenExchangeBinding implements StateProcessor {
    private final OidcService service;
    private final DataProcessor<RawTokens, ValidatedTokens> validator;

    @Override public void process(FlowContext ctx) {
        var raw = service.exchangeCode(ctx.get(OidcCallback.class));  // I/O
        ctx.put(ValidatedTokens.class, validator.transform(raw));      // 変換
    }
}
```

**Pros**: 変換ロジックだけ移植。テスト時は DataProcessor 単体テスト可能。
**Cons**: 2 層に分ける分コード増。小規模フローにはオーバーエンジニアリング。
**When**: 大規模フロー（10+ Processor）で変換ロジックが複雑な場合。

## 選び方

```
Processor に I/O がない → そのまま（分離不要）
I/O が 1 つ → Pattern 1（External に寄せる）
I/O が複数、DI で管理 → Pattern 2（Port/Adapter）
大規模、変換が複雑 → Pattern 3（DataProcessor 分離）
```
