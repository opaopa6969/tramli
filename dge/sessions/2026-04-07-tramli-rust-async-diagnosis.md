# DGE Session: tramli-rust async stack overflow 診断

- **Date**: 2026-04-07
- **Flow**: 🏥 症例検討
- **Pattern**: escalation-chain
- **Characters**: ☕ ヤン, 👤 今泉, 🦀 Rust Async 専門家 (ad-hoc), ⚔ リヴァイ, 🏥 ハウス
- **Input**: ASYNC_STACK_ISSUE.md, docs/async-integration.md

## 診断

**症状**: stack overflow (3状態以上のフロー)
**誤診**: async Future のスタックサイズ爆発
**正診**: **不要な async 化** — tramli のエンジン処理 (2μs) に async は不要

## 根拠

1. `docs/async-integration.md` が「tramli is intentionally synchronous」と明記
2. エンジン内部に I/O 待ちは一切ない（HashMap lookup, clone, enum set のみ）
3. Rust の async は Future state machine のサイズ増大、Pin 制約、Send bound 伝播のコストを伴う
4. 2μs の処理にこのコストを払う理由がない
5. DD-010「native async fn in trait」は設計ミス

## 処方

1. **FlowEngine を完全 sync 化** — async fn → fn, Pin<Box<Future>> 不要
2. **StateProcessor/TransitionGuard/BranchProcessor も sync** — process(&mut ctx) -> Result<(), FlowError>
3. **take/put_back パターン不要** — &mut self の borrow が .await をまたがない
4. **volta-gateway では Mutex<FlowEngine> で包む** — ロック保持 μs、contention 実質ゼロ
5. **DD-010 を Supersede** → DD-012 作成

## TS 版への影響

なし。DD-006 (async) は維持。TS では async のコストが小さく、エコシステム的にも自然。
