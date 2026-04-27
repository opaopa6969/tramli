[English version](review-volta-gateway.md)

# ユーザーレビュー: volta-gateway での tramli-rust

> レビュアー: Claude Opus 4.6 (実装パートナーとして)
> プロジェクト: [volta-gateway](https://github.com/opaopa6969/volta-gateway) — tramli SM エンジン駆動の Rust リバースプロキシ
> 日付: 2026-04-07
> tramli バージョン: 0.1.0 (crates.io)

## コンテキスト

Traefik を置き換えるリバースプロキシを構築。tramli でリクエストのライフサイクルを駆動:

```
RECEIVED → VALIDATED → ROUTED → [認証] → AUTH_CHECKED → [転送] → FORWARDED → COMPLETED
```

6 状態、5 ターミナル、4 プロセッサ、2 ガード。volta-auth-proxy で E2E 検証済み。

---

## 良かった点

### 1. build() がセーフティネット

flow.rs を30分で書いた。「requires/produces の繋がりは合ってるかな？」と心配する必要がなかった。間違えたら `build()` が即座に教えてくれるから。フィードバックループ:

```
flow を書く → cargo check → build() が明確なエラー → 修正 → 完了
```

ランタイムのサプライズなし。8項目検証が初回で `initially_available` の不足を検出してくれた。

### 2. get() → Result vs find() → Option

この使い分けが完璧:

```rust
// Processor: 「RequestData は必ずある」（start_flow で設定済み）
let req = ctx.get::<RequestData>()?;

// Guard: 「AuthData はあるかもしれない」（resume 間に外部から注入）
match ctx.find::<AuthData>() {
    Some(data) => GuardOutput::Accepted { ... },
    None => GuardOutput::Rejected { ... },
}
```

`get()` は不変条件用、`find()` は外部入力用。どちらを使うか迷うことがなかった。

### 3. Sync 設計が Rust で正解

`ASYNC_STACK_ISSUE.md` を読んだ後では、sync の判断が完全に正しいとわかる。B 方式（sync SM + async I/O は外）がプロキシに自然にマッピングされた:

```rust
let flow_id = engine.start_flow(...)?;           // sync, ~1μs
let auth = volta_client.check_auth(&req).await;  // async, SM の外
engine.resume_and_execute(&flow_id, auth_data)?;  // sync, ~300ns
let resp = backend.forward(&req).await;           // async, SM の外
engine.resume_and_execute(&flow_id, resp_data)?;  // sync, ~300ns
```

SM は async に触れない。async は SM に触れない。きれいな分離。

### 4. Builder DSL が仕様そのもの

```rust
Builder::new("proxy")
    .from(Received).auto(Validated, RequestValidator { routing })
    .from(Validated).auto(Routed, RoutingResolver { routing })
    .from(Routed).external(AuthChecked, AuthGuard)
    .from(AuthChecked).external(Forwarded, ForwardGuard)
    .from(Forwarded).auto(Completed, CompletionProcessor)
    .on_any_error(BadGateway)
    .build()
```

これ**が**仕様。この8行を読めば、リクエストのライフサイクル全体がわかる。構造を理解するのに proxy.rs や auth.rs を読む必要がない。

### 5. 遷移ログが無料で手に入る

```json
{"state":"COMPLETED", "transitions":5, "duration_ms":13}
```

SM の全遷移が `InMemoryFlowStore` に記録される。Processor にロギングコードを書かなくても、リクエストごとの可観測性が得られた。

---

## 改善できる点

### 1. ~~GuardOutput::Accepted のボイラープレート~~ (v3.8 で解決)

**解決済み。** tramli にヘルパーメソッドと `guard_data!` マクロを追加:

```rust
// 単一データ — accept_with
GuardOutput::accept_with(AuthData { token: tok.clone() })

// 複数データ — guard_data! マクロ
GuardOutput::accepted(guard_data![AuthData { token: tok.clone() }, UserId(42)])

// データなし
GuardOutput::accepted_empty()

// リジェクトの省略記法
GuardOutput::rejected("invalid token")
```

### 2. リクエストごとの FlowEngine 割り当て

プロキシ用途では、リクエストごとに `FlowEngine` + `InMemoryFlowStore` を新規作成している。HashMap が毎回 alloc/dealloc。~2μs なので今は問題ないが、100K+ req/sec では検討の余地あり。

### 3. Processor trait の Send + Sync 要件

ドキュメントに明記すると助かる。`Arc<T>` は OK だが `Rc<RefCell<T>>` は使えない。意図的な制約（SM はスレッドセーフであるべき）だが、初見では引っかかる可能性。

---

## パフォーマンス

```
リクエストあたりの SM オーバーヘッド:
  start_flow:           ~1μs (3 auto 遷移)
  resume (認証):        ~300ns (1 external 遷移)
  resume (転送):        ~300ns (1 external + 1 auto 遷移)
  SM 合計:              ~1.6μs

比較:
  volta 認証 HTTP 呼出:  ~500μs (localhost)
  バックエンド HTTP 呼出: ~1-50ms
  SM / 全体:             0.003% — 0.16%
```

実測不能。SM は構造を追加するが、レイテンシは追加しない。

---

## 結論

**また使う。** 「build() がミスを検出してくれる」性質のおかげで、1日かかるかもしれないデバッグが30分の確信を持ったコーディングになった。sync 設計は Rust にとって完全に正しい。

主な価値はパフォーマンス（すでに無視できる）ではない。**安心感** — build() が通れば、フローが構造的に正しいという確信。セキュリティが重要なリバースプロキシでは、それが全てに勝る。
