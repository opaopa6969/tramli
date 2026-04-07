# DD-001: TTL は external resume の有効期限

**Date:** 2026-04-07
**Session:** [tramli-design-review-r2](../sessions/2026-04-07-tramli-design-review-r2.md)
**Gap:** #5 (TTL のセマンティクス未定義)

## Decision

TTL は「フロー全体の生存期間」ではなく「external resume（resumeAndExecute）の有効期限」とする。auto-chain 中の TTL チェックは行わない。startFlow 時の TTL チェックも行わない。

## Rationale

- auto-chain のプロセッサは高速（外部 I/O を含まない）であることが契約。TTL が問題になる時間スケールでは動かない。
- startFlow は開始直後であり、TTL 超過は論理的に起きない。
- auto-chain 中に TTL チェックを入れると、途中の状態で EXPIRED 完了するケースが増え、フロー設計が複雑になる。
- GuardOutput.Expired は guard 独自の期限切れメカニズムであり、FlowInstance の TTL とは独立。guard が業務的な期限を判断する手段として使う。

千石: 「書いてないことを書くだけです」  
ヤン: 「auto-chain のプロセッサが外部 API 呼んで5分かかるケースは？」  
千石: 「auto-chain のプロセッサは高速であること — を契約に追加」

## Alternatives considered

- **auto-chain 中もステップごとに TTL チェック**: 途中 EXPIRED のハンドリングが複雑。プロセッサが高速なら実益なし。
- **TTL をフロー全体の生存期間とする**: セマンティクスは直感的だが、auto-chain 中断の実装コストに見合わない。
