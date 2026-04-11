# tramli-rust: Stack Overflow 問題 — 診断結果

## 真因（確定）

**`HashMap<TypeId, Box<dyn CloneAny>>::clone()` によるスタック消費。**

`context.snapshot()` が `HashMap::clone()` を呼び、各エントリの `Box<dyn CloneAny>::clone()` → `clone_box()` → `Box::new(self.clone())` がスタック上に一時オブジェクトを配置する。context にエントリが1つでもあると overflow する。

snapshot をコメントアウトすると正常動作を確認済み。async は無関係（sync 版でも同じ問題が発生）。

## 対策案

### 案 A: snapshot/restore を廃止（最速）
- processor が Err を返したら context は汚染されたまま error transition に遷移
- Java 版の TECH-001 以前の動作に戻る
- Rust 版では「processor は context を壊さない、壊したら error 状態で扱う」を契約とする
- 👍 コード最もシンプル。スタック問題完全消滅
- 👎 Java/TS 版との動作差異

### 案 B: snapshot を heap 上で行う
- `snapshot()` が `Vec<(TypeId, Box<dyn CloneAny>)>` を heap 上で構築
- `clone_box()` を呼ぶが、結果は直接 Box に入るので stack に一時オブジェクトが載らない
- 👍 Java/TS と同じ動作を維持
- 👎 実装が非自明（HashMap::clone() をカスタム実装に置き換え）

### 案 C: context を Copy-on-Write にする
- `im` クレートの persistent HashMap を使用
- clone がO(1)（構造共有）
- 👍 パフォーマンス最良
- 👎 外部依存が増える（ゼロ依存の方針に反する）

## 推奨

案 A が最もシンプル。volta-gateway のユースケースでは processor が context を壊すケースは設計で防げる（processor はデータを追加するだけで削除しない）。error transition に遷移した後の context の状態は、error handling 側が新しいデータを put して使う。
