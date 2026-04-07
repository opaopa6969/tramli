# DD-012: Rust 版 FlowEngine は完全 sync

**Date:** 2026-04-07
**Session:** [rust-async-diagnosis](../sessions/2026-04-07-tramli-rust-async-diagnosis.md)
**Supersedes:** DD-010 (CloneAny + TypeId + native async — async 部分のみ撤回)

## Decision

Rust 版の FlowEngine, StateProcessor, TransitionGuard, BranchProcessor は全て同期（sync）とする。DD-010 の async 部分を撤回。CloneAny + TypeId の設計は維持。

## Rationale

tramli のエンジン処理は ~2μs。async にする理由がない。async 化は：
- Future state machine のサイズ爆発 → stack overflow
- Pin<Box<dyn Future>> → trait の dyn 非互換
- Send bound の伝播 → 型制約の爆発
- take/put_back パターン → 不自然なコード

`docs/async-integration.md` のパターンが正解:
```
SM start() (sync, μs) → async I/O (外部) → SM resume() (sync, μs)
```

External 遷移が async 境界のマーカー。SM 内部は sync。

volta-gateway では `Mutex<FlowEngine>` で包んで async 世界に晒す。ロック保持 μs で contention は実質ゼロ。

ハウス: 「症状は stack overflow。病名は不要な async 化」
Rust Async 専門家: 「sync コアを Mutex で包んで async 世界に晒す。hyper, axum, tonic — 全て同じパターン」
ヤン: 「三つ目の言語で、設計の本質が見えた。tramli は sync」

## TS 版への影響

なし。DD-006 (async) は維持。TS では async のコストが小さく stack overflow も起きていない。

## Alternatives considered

- **全メソッドを Pin<Box<dyn Future>> で返す**: 試行済み。stack overflow は解決せず
- **store を Arc<Mutex> にする**: 複雑さが増すだけで根本解決にならない
- **processor に owned FlowContext を渡す**: API が Java/TS と大きく乖離
