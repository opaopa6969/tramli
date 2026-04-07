<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-005: 異常系・境界値テスト追加

**Status:** draft
**Gap:** #16 (異常系テスト不足)
**Session:** [R4](../sessions/2026-04-07-tramli-design-review-r4.md)

## 変更内容

FlowEngineErrorTest クラスを新規作成し、7つの異常系テストケースを追加。

## テストケース

### 1. processorThrows_routesToErrorState
- processor が RuntimeException をスロー
- error transition で CANCELLED に遷移することを検証
- 前提: TECH-001 の修正が適用済み

### 2. processorThrows_contextIsRestored
- processor が途中まで context.put() した後に例外
- context が processor 実行前の snapshot に復元されていることを検証
- 前提: TECH-001 の restoreFrom が実装済み

### 3. branchReturnsUnknownLabel_routesToErrorState
- BranchProcessor.decide() が未マッピングのラベルを返す
- error transition で CANCELLED に遷移することを検証
- 前提: TECH-001 の修正が適用済み（UNKNOWN_BRANCH も catch される）

### 4. maxChainDepthExceeded_throwsFlowException
- 11ステップの auto-chain を持つフロー定義（checkDag は循環のみチェックするため、長い線形チェーンは通る）
- MAX_CHAIN_DEPTH (10) 超過で FlowException("MAX_CHAIN_DEPTH") がスローされることを検証

### 5. ttlExpired_resumeCompletesAsExpired
- TTL を Duration.ZERO で定義し、startFlow 後に少し待って resumeAndExecute
- flow.exitState() が "EXPIRED" であることを検証

### 6. guardRejectedMaxRetries_routesToErrorState
- guard が常に Rejected を返す
- maxGuardRetries 回の resumeAndExecute 後、error transition で CANCELLED に遷移
- (既存 OrderFlowTest.paymentRejected と類似だが、独立テストとして明示)

### 7. autoAndExternalConflict_buildFails
- 同一ステートに auto と external を定義
- build() で FlowException がスローされることを検証
- 前提: TECH-002 のバリデーションが実装済み

## ファイル

`src/test/java/com/tramli/FlowEngineErrorTest.java` (新規作成)
