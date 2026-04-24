# Family-level discussions moved to tramli-family repo

2026-04-24 の家族モデル採用（DD-043）以降、**家族全体に関する DGE sessions と DDs は [tramli-family](https://github.com/opaopa6969/tramli-family) repo** に移行しました。

## この repo（tramli）の dge/ の位置づけ

- **tramli 本体（Statechart + data-flow 検証カーネル）に固有の議論** のみを扱う
- 2026-04-24 以前の全 DGE sessions / DDs（DD-001 〜 DD-041）は **本 repo にそのまま残る**（時系列分割、移行コストゼロ）
- 以降、tramli 本体固有の議論は引き続きこの repo で行う

## 家族全体の議論を探すときは

| 探したいもの | 行き先 |
|-------------|-------|
| ファミリーマニフェスト | [tramli-family/manifest.md](https://github.com/opaopa6969/tramli-family/blob/main/manifest.md) |
| 家族モデル採用・合成境界の DD（DD-042 以降） | [tramli-family/decisions/](https://github.com/opaopa6969/tramli-family/tree/main/decisions) |
| 2026-04-24 以降の家族議論 sessions | [tramli-family/sessions/](https://github.com/opaopa6969/tramli-family/tree/main/sessions) |

## 根拠

[DD-045 Part 3](https://github.com/opaopa6969/tramli-family/blob/main/decisions/DD-045-family-ideal-monorepo-manifest-implementation.md) — 時系列分割戦略（2026-04-24 境界）
