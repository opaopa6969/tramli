# Feedback: volta-auth-proxy tramli 1.2.2 → 1.15.0 移行 + 本番運用

> Date: 2026-04-08
> Project: volta-auth-proxy (ForwardAuth multi-tenant identity gateway)
> Flows: OIDC (9 states), Passkey (6), MFA (4), Invite (6)
> tramli: 1.2.2 → 1.15.0 (API 互換、コード変更ゼロでアップグレード)

---

## 良かった点

### 1. API 後方互換性が完璧

v1.2.2 → v1.15.0 で **コード変更ゼロ**。pom.xml のバージョン番号を変えるだけで全 90 テストが通った。13 バージョン分のアップグレードでこれは素晴らしい。

### 2. Logger API が実運用で即効性がある

今回の認証ループ障害では、手動で `System.getLogger` を各 Processor に仕込んでデバッグした（30行以上の手動ログ追加）。tramli 1.9.0 の Logger API があれば **3行で済んだ**:

```java
engine.setTransitionLogger(t -> log.info("[transition] {0} → {1}", t.from(), t.to()));
engine.setGuardLogger(g -> log.info("[guard] {0} {1}: {2}", g.guardName(), g.result(), g.reason()));
engine.setErrorLogger(e -> log.error("[error] {0} → {1}: {2}", e.from(), e.to(), e.cause()));
```

本番障害の初動調査が大幅に短縮される。

### 3. strictMode がバグを未然に防ぐ

MFA verify 後の redirect 先を `produces(MfaVerified.class)` で宣言していたが、特定パスで `ctx.put(MfaVerified.class, ...)` が呼ばれないケースがあった。strictMode ON なら build() 後のランタイムで即座に検出できる。

### 4. warnings() で設計リスクが見える

フロー定義の `warnings()` を起動時にログ出力するようにした。「この state は external transition がないが terminal でもない」等のリスクが起動時に分かるのは運用上ありがたい。

### 5. lastError() でエラー診断が改善

`FlowInstance.lastError()` で「なぜフローが失敗したか」が取れる。以前は `exitState == "TERMINAL_ERROR"` しか分からなかった。

---

## 本番障害で学んだこと（tramli に関連する部分）

### 障害 1: SET LOCAL + SELECT の複合文

`SqlFlowStore.loadForUpdate()` で `SET LOCAL lock_timeout = '5s'; SELECT ...` を1つの PreparedStatement に入れたら、JDBC が SET LOCAL の結果（結果なし）を返して SELECT に到達しなかった。

**tramli への示唆**: FlowStore の実装ガイド（`docs/patterns/flowstore-schema.md`）に「PostgreSQL の SET LOCAL は別 Statement で実行すべき」という注意書きがあると助かる。

### 障害 2: Flow cookie の再利用

MFA flow が TERMINAL_ERROR で完了済みなのに、ブラウザに残った flow cookie で `resumeAndExecute()` を呼んで「flow not found」。

**tramli への示唆**: `resumeAndExecute()` が Optional を返す or 「flow が完了済み」を示す専用例外があると、呼び出し側でリカバリーしやすい。現状は `FlowException("FLOW_NOT_FOUND", ...)` で、「存在しない」と「完了済み」の区別がつかない。

### 障害 3: 複数フロー定義の競合

AUTH-010 で `/auth/verify` だけ新しい FlowDefinition に切り替えたが、`/callback` は旧 FlowDefinition のまま。state パラメータに埋め込まれた flow ID が新フローのもので、旧フローの `resumeAndExecute()` で見つからなかった。

**tramli への示唆**: これは tramli の問題ではなくアプリケーション設計の問題。ただし「1つの認証フロー内で複数の FlowDefinition を混在させるな」という設計ガイダンスがあると他のユーザーも助かる。

---

## 機能リクエスト

### 1. FlowException に完了済み/存在しない/期限切れの区別

```java
// 現状: 全部同じ
throw new FlowException("FLOW_NOT_FOUND", "Flow xxx not found or already completed");

// 要望: 区別できるように
public enum FlowErrorType {
    NOT_FOUND,        // DB に存在しない
    ALREADY_COMPLETED, // exit_state != null
    EXPIRED           // TTL 超過
}
```

これがあれば `MFA_NO_FLOW` のエラーハンドリングで「期限切れなら新しいフローを作り直す」「完了済みなら結果を返す」を明確に分岐できる。

### 2. FlowStore.loadForUpdate() の拡張

現状は `exit_state IS NULL` で完了済みフローを除外している。完了済みフローの「読み取り専用アクセス」があると、「このフローは成功で完了した」を確認できて便利。

```java
// 新規 API 案
Optional<FlowInstance<S>> loadCompleted(String flowId, FlowDefinition<S> definition);
```

### 3. Logger API に flow name を含める

現状の `LogEntry.Transition` は `flowId, from, to, trigger`。`FlowDefinition.name()` も含まれると、OIDC / MFA / Passkey / Invite のどのフローかがログだけで分かる。

```java
// 現状
record Transition(String flowId, String from, String to, String trigger) {}

// 要望
record Transition(String flowId, String flowName, String from, String to, String trigger) {}
```

---

## 採用状況

| tramli 機能 | 採用状況 | 効果 |
|------------|---------|------|
| FlowDefinition + build() | v1.2.2 から使用 | 4フロー全て定義時検証 |
| requires/produces | v1.2.2 から使用 | データ依存の構造保証 |
| MermaidGenerator | v1.2.2 から使用 | README に自動生成図 |
| FlowInstance.restore() | v1.2.2 から使用 | SqlFlowStore の永続化 |
| FlowInstance.withVersion() | v1.2.2 から使用 | optimistic locking |
| **Logger API** | v1.15.0 で採用 | 構造化ログ（手動ログ 30行 → 3行） |
| **strictMode** | v1.15.0 で採用 | produces ランタイム検証 |
| **warnings()** | v1.15.0 で採用 | 起動時の設計リスク検出 |
| **lastError()** | v1.15.0 で採用 | エラー診断 |
| SubFlow | 未使用 | MFA は sequential flow で実装 |
| DataFlowGraph | 未使用（今後検討） | 移植計画に活用予定 |
| Pipeline API | 未使用 | 認証フローでは不要 |
| onStepError | 未使用（今後検討） | 例外型ルーティングに興味 |

---

## 環境

- Java 21 + Javalin 6.7
- PostgreSQL 16 (JSONB FlowContext, SELECT FOR UPDATE)
- Redis (sessions)
- Cloudflare Tunnel → Traefik → volta-auth-proxy
