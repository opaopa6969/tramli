# DD-007: HTTP API は v0.2.0 に先送り

**Date:** 2026-04-07
**Session:** [multilang-r4](../sessions/2026-04-07-tramli-multilang-r4.md)

## Decision

HTTP API（tramli-http モジュール）は v0.2.0 に先送りする。v0.1.0 はネイティブライブラリ（Java + TypeScript）に集中する。

## Rationale

HTTP API の主なユースケース（管理コンソール、外部キック、モニタリング、デバッグ）のうち、v0.1.0 で必須なものはない。TypeScript 版のネイティブライブラリが takt/AskOS の直接的な需要に応える。

v0.2.0 では Javalin ベースの tramli-http を別モジュールとして提供予定。認証はアプリ側責務。

ヤン: 「v0.1.0 では HTTP API は不要。TS 版のネイティブライブラリが先」
Red Team: 「resume は書き込み API。認証なしで公開したら誰でもフローを進行させられる」

## Alternatives considered

- **v0.1.0 に HTTP API 含める**: スコープ膨張。TS 版の優先度が下がる。
- **Spring Boot starter**: unlaxer プロジェクトに Spring はない。過剰。
