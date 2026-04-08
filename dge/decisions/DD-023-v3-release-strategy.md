---
status: accepted
---

# DD-023: v3.0.0 Release — Plugin Pack + 3 Registry Deploy

**Date:** 2026-04-09

## Decision

全 6 パッケージ（コア × 3 言語 + プラグイン × 3 言語）を v3.0.0 に統一バージョンアップし、3 レジストリに同時 publish する。

## Rationale

- プラグインパックは新しいパブリック API を追加する major feature
- コアの API には破壊的変更なし（プラグインは外側から重ねるだけ）
- しかしプラグインの `peerDependency` / dependency バージョンをコアと合わせるため、コアも v3.0.0 に揃える
- 6 パッケージのバージョンが一致していると、ユーザーの混乱を防げる

## Published

| Package | Registry | Version |
|---------|----------|---------|
| org.unlaxer:tramli | Maven Central | 3.0.0 |
| org.unlaxer:tramli-plugins | Maven Central | 3.0.0 |
| @unlaxer/tramli | npm | 3.0.0 |
| @unlaxer/tramli-plugins | npm | 3.0.0 |
| tramli | crates.io | 3.0.0 |
| tramli-plugins | crates.io | 3.0.0 |

## Git Tag

`v3.0.0` — pushed to origin
