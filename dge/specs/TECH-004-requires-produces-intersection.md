<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-004: checkRequiresProduces を intersection 方式に修正

**Status:** draft
**Gap:** コードレビュー指摘 #1 (visited 共有問題)
**Session:** [R4](../sessions/2026-04-07-tramli-design-review-r4.md)

## 変更内容

checkRequiresProduces の DFS で visited セットを共有していたため、分岐後の合流点で片方のパスしか検証されない問題を修正。合流点では available の intersection を取る方式に変更。

## 変更箇所

### FlowDefinition.java — checkRequiresProduces 書き換え

```java
private void checkRequiresProduces(FlowDefinition<S> def, List<String> errors) {
    if (def.initialState == null) return;
    Map<S, Set<Class<?>>> stateAvailable = new EnumMap<>(stateClass);
    checkRequiresProducesFrom(def, def.initialState,
            new HashSet<>(initiallyAvailable), stateAvailable, errors);
}

private void checkRequiresProducesFrom(FlowDefinition<S> def, S state,
        Set<Class<?>> available, Map<S, Set<Class<?>>> stateAvailable,
        List<String> errors) {

    if (stateAvailable.containsKey(state)) {
        Set<Class<?>> existing = stateAvailable.get(state);
        // available が既知の available のサブセットなら再探索不要
        if (existing.containsAll(available)) return;
        // intersection: 全パスで共通して利用可能なもののみ残す
        existing.retainAll(available);
    } else {
        stateAvailable.put(state, new HashSet<>(available));
    }

    for (Transition<S> t : def.transitionsFrom(state)) {
        Set<Class<?>> newAvailable = new HashSet<>(stateAvailable.get(state));
        if (t.guard() != null) {
            for (Class<?> req : t.guard().requires()) {
                if (!newAvailable.contains(req))
                    errors.add("Guard '" + t.guard().name() + "' at " + t.from().name() +
                            " requires " + req.getSimpleName() + " but it may not be available");
            }
            newAvailable.addAll(t.guard().produces());
        }
        if (t.branch() != null) {
            for (Class<?> req : t.branch().requires()) {
                if (!newAvailable.contains(req))
                    errors.add("Branch '" + t.branch().name() + "' at " + t.from().name() +
                            " requires " + req.getSimpleName() + " but it may not be available");
            }
        }
        if (t.processor() != null) {
            for (Class<?> req : t.processor().requires()) {
                if (!newAvailable.contains(req))
                    errors.add("Processor '" + t.processor().name() + "' at " + t.from().name() +
                            " -> " + t.to().name() + " requires " + req.getSimpleName() +
                            " but it may not be available");
            }
            newAvailable.addAll(t.processor().produces());
        }
        checkRequiresProducesFrom(def, t.to(), newAvailable, stateAvailable, errors);
    }
}
```

## 動作の変化

**Before**: 分岐 A→C (produces X), 分岐 B→C (produces なし) の場合、A が先に探索されると C で X が available と判定。B→C パスでは C が visited 済みのためスキップ。C 以降で X を requires するプロセッサはエラーにならない（false negative）。

**After**: A→C 探索後、B→C で C に到達。available の intersection を取り、X は除外される。C 以降で X を requires するプロセッサがエラーになる（正しい動作）。

## 影響範囲

- FlowDefinition: `checkRequiresProduces` + `checkRequiresProducesFrom` の2メソッド書き換え
- 既存テスト: 分岐→合流パターンがなければ影響なし
- checkDag() で DAG が保証されているため、無限ループの心配なし
