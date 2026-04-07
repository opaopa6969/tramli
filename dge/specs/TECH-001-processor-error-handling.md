<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-001: processor 例外ハンドリング + External 実行順序統一

**Status:** draft
**Gap:** #3 (processor 例外), #4 (External 実行順序不整合)
**Session:** [R2](../sessions/2026-04-07-tramli-design-review-r2.md)

## 変更内容

processor/branch 実行時の例外を catch し、context を復元した上で error transition に遷移する。同時に External 遷移の実行順序を Auto と統一する。

## 変更箇所

### 1. FlowContext — `restoreFrom()` 追加

```java
// FlowContext.java に追加
public void restoreFrom(Map<Class<?>, Object> snapshot) {
    attributes.clear();
    attributes.putAll(snapshot);
}
```

### 2. FlowEngine — executeAutoChain 修正

```java
// FlowEngine.java executeAutoChain() 内
// Auto 遷移部分を try-catch で囲む
if (autoOrBranch.isAuto()) {
    Map<Class<?>, Object> backup = flow.context().snapshot();
    try {
        if (autoOrBranch.processor() != null) 
            autoOrBranch.processor().process(flow.context());
        S from = flow.currentState();
        flow.transitionTo(autoOrBranch.to());
        store.recordTransition(flow.id(), from, autoOrBranch.to(),
                autoOrBranch.processor() != null ? autoOrBranch.processor().name() : "auto",
                flow.context());
    } catch (Exception e) {
        flow.context().restoreFrom(backup);
        handleError(flow, flow.currentState());
        return;
    }
} else {
    // Branch 遷移も同様に try-catch
    Map<Class<?>, Object> backup = flow.context().snapshot();
    try {
        BranchProcessor branch = autoOrBranch.branch();
        String label = branch.decide(flow.context());
        S target = autoOrBranch.branchTargets().get(label);
        if (target == null) {
            throw new FlowException("UNKNOWN_BRANCH",
                    "Branch '" + branch.name() + "' returned unknown label: " + label);
        }
        Transition<S> specific = transitions.stream()
                .filter(t -> t.isBranch() && t.to() == target)
                .findFirst().orElse(autoOrBranch);
        if (specific.processor() != null) specific.processor().process(flow.context());
        S from = flow.currentState();
        flow.transitionTo(target);
        store.recordTransition(flow.id(), from, target, branch.name() + ":" + label, flow.context());
    } catch (Exception e) {
        flow.context().restoreFrom(backup);
        handleError(flow, flow.currentState());
        return;
    }
}
```

### 3. FlowEngine — resumeAndExecute External 遷移修正

```java
// guard Accepted ブロック — 実行順序を process → transitionTo に変更
case TransitionGuard.GuardOutput.Accepted accepted -> {
    Map<Class<?>, Object> backup = flow.context().snapshot();
    for (var entry : accepted.data().entrySet()) {
        putRaw(flow.context(), entry.getKey(), entry.getValue());
    }
    try {
        if (transition.processor() != null) {
            transition.processor().process(flow.context());
        }
        S from = flow.currentState();
        flow.transitionTo(transition.to());
        store.recordTransition(flow.id(), from, transition.to(), guard.name(), flow.context());
    } catch (Exception e) {
        flow.context().restoreFrom(backup);
        handleError(flow, currentState);
        store.save(flow);
        return flow;
    }
}
```

## 影響範囲

- FlowContext: 1メソッド追加（`restoreFrom`）
- FlowEngine: `executeAutoChain` と `resumeAndExecute` の2メソッド修正
- 既存テスト: 動作変更なし（正常系のフローは同じ）
- 新規テスト: TECH-005 参照

## 注意事項

- `handleError` が error transition を見つけられない場合は `TERMINAL_ERROR` で complete（既存動作）
- `UNKNOWN_BRANCH` 例外も catch され error transition に遷移する（従来は呼び出し元に飛んでいた）
