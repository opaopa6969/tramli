# DD-008: Rust 版は volta-proxy 向けに作る。Python/C# は作らない

**Date:** 2026-04-07
**Session:** [multilang-strategy](../sessions/2026-04-07-tramli-multilang-strategy.md)
**Supersedes:** DD-004 の「Rust/Python/C# は需要発生時」を具体化

## Decision

- **Rust**: volta-proxy（Traefik/nginx 代替）の設計フェーズで tramli-rust を作る
- **Python**: 作らない。大きなものを作らない言語なので需要なし
- **C#**: 作らない。GUI 系で出番はあるが優先度低

## Rationale

volta-proxy は本番インフラ（リバースプロキシ）であり、状態遷移のバグが直接障害につながる。Rust のコンパイル時保証 + tramli のビルド時バリデーション 9 種で二重に防御する意義がある。

Python は ユーティリティ/CLI 系のプロジェクトが中心で、フロー制御の需要がない。C# は Windows GUI 系で tramli が活きる場面はあるが、プロジェクト数（1件）に対して移植コストが見合わない。

## Rust 版の事前検討事項

DGE Round 1 素の LLM レビューで指摘された課題:

1. **所有権モデルと snapshot/restore の衝突** — processor 実行中に context の `&mut self` を持ちつつ snapshot の不変参照も保持する必要がある。`Clone` + 値渡し、または processor にクローンを渡して結果を merge する設計への変更が必要
2. **FlowContext のキー** — `TypeId` + `Any` トレイトオブジェクト、または `HashMap<TypeId, Box<dyn Any>>` で Java の `Class<?>` キーを模倣
3. **GuardOutput** — Rust の `enum` で自然に表現可能（最も Java に近い）
4. **FlowState** — `enum` + trait impl で Java の `Enum<S> & FlowState` に対応
5. **async** — `async-trait` または Rust 1.75+ のネイティブ async trait

volta-proxy の設計フェーズに入ったら、これらを DGE で詰めてから実装に入る。
