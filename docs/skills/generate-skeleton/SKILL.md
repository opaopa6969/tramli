---
name: generate-skeleton
description: tramli の SkeletonGenerator で FlowDefinition から3言語（Java/TS/Rust）の Processor スケルトンを生成する手順
volta:
  version: 1
  namespace: tramli
  locality: repo
  tags: [tramli, skeleton, code-generation, cross-language]
  applies_when:
    - repo.has_file: lang/
  requires:
    tools: []
    resources: []
  min_role: viewer
  export: allowed
---
# tramli SkeletonGenerator で3言語スケルトン生成

`SkeletonGenerator.generate(definition, language)` は、既存の FlowDefinition から指定言語の Processor スケルトンコードを生成する。クロス言語移行や新規フローの着手に使う。

## 使い方

```java
String rust = SkeletonGenerator.generate(oidcFlow, Language.RUST);
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

```typescript
const rust: string = SkeletonGenerator.generate(oidcFlow, 'rust');
// struct OidcInitProcessor;
// impl StateProcessor for OidcInitProcessor { ... todo!() }
```

```rust
// Rust 実装でも Java/TS の FlowDefinition からスケルトン生成可能
// （共有テストスイートが3言語間の定義を相互変換する基盤を持つ）
```

## 生成されるコードの構造

スケルトンには以下が含まれる:

1. **State enum** — FlowDefinition の全状態を enum として定義
2. **StateProcessor impl** — 各 auto 遷移の processor を `todo!()`（Rust）/ `throw new Error()`（TS）/ `UnsupportedOperationException`（Java）付きで生成
3. **TransitionGuard impl** — 各 external 遷移の guard を生成
4. **BranchProcessor impl** — 各 branch 遷移の branch processor を生成
5. **FlowDefinition builder** — 全遷移を繋いだ builder コードを生成

## クロス言語移行のワークフロー

1. **起点**: 既存の FlowDefinition（例: Java で定義済みの OIDC フロー）
2. **スケルトン生成**: `SkeletonGenerator.generate(oidcFlow, Language.RUST)` で Rust のスケルトンを取得
3. **実装**: `todo!()` を実際のビジネスロジックで埋める
4. **検証**: `build()` で構造検証 → `shared-tests` で3言語間の動作一致を確認

## 判断基準

- **新規フローを書くとき**: まず Java/TS/Rust のいずれかで FlowDefinition を定義し、`build()` で検証してから、他言語のスケルトンを生成する
- **クロス言語移行**: 既存フローのコア構造（状態・遷移・requires/produces）は保ちつつ、各言語の慣用的な書き方で processor を実装する
- **共有テスト**: `shared-tests/` に3言語共通のテストシナリオがある。スケルトン生成後は必ず共有テストで動作一致を確認する
- スケルトンはあくまで出発点。生成された `todo!()` を埋めるときは、各言語のエラーハンドリング慣習（Rust: `Result`、TS: `throw`、Java: `Exception`）に従う
