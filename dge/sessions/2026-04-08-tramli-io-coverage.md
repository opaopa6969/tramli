# DGE Session: I/O にも tramli のメリットを

- **Date**: 2026-04-08
- **Flow**: 💡 ブレスト
- **Characters**: ☕ ヤン, 👤 今泉, 🎭 ソクラテス, 🤝 後輩

## 結論

- I/O Port = PipelineStep。既存 API で書ける。新概念不要
- 失敗モード宣言は不要（PipelineException + Logger で実行時観測が十分）
- テスト支援は既存 API (testScaffold + verifyProcessor) で十分
- sub-project は今は不要 (YAGNI)

## Future
- 例外型ベースのエラー遷移マッピング: .onStepError(ExceptionClass, targetState)
- tramli-ports (言語横断 I/O 契約共有) — 需要が出たら
