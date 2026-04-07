<!-- ⚠️ DGE 生成 Spec — status: draft — 人間レビュー必須 -->

# TECH-002: auto+external 混在検出バリデーション

**Status:** draft
**Gap:** #7 (ビルダーで auto+external 混在が未検出)
**Session:** [R2](../sessions/2026-04-07-tramli-design-review-r2.md)

## 変更内容

FlowDefinition.Builder の validate() に9番目のチェック `checkAutoExternalConflict` を追加。同一ステートから auto/branch と external の両方が定義されている場合にビルドエラーとする。

## 変更箇所

### FlowDefinition.java — validate() に追加

```java
private void checkAutoExternalConflict(FlowDefinition<S> def, List<String> errors) {
    for (S state : def.allStates()) {
        List<Transition<S>> transitions = def.transitionsFrom(state);
        boolean hasAuto = transitions.stream().anyMatch(t -> t.isAuto() || t.isBranch());
        boolean hasExternal = transitions.stream().anyMatch(Transition::isExternal);
        if (hasAuto && hasExternal) {
            errors.add("State " + state.name() + 
                " has both auto/branch and external transitions — " +
                "auto takes priority, making external unreachable");
        }
    }
}
```

validate() メソッド内で既存チェックの後に呼び出す。

## 影響範囲

- FlowDefinition: 1メソッド追加 + validate() に1行追加
- 既存テスト: 影響なし（既存のフロー定義にこのパターンはない）
- 新規テスト: `autoAndExternalConflict_buildFails` (TECH-005 参照)
