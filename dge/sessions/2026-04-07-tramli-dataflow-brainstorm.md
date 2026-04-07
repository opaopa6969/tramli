# DGE Session: data-flow 導出の新たな価値

- **Date**: 2026-04-07
- **Flow**: 💡 ブレスト
- **Structure**: 🗣 座談会
- **Characters**: ☕ ヤン, 👤 今泉, 🎭 ソクラテス, 🤝 後輩
- **Input**: DD-014, requires/produces API (Java/TS/Rust), MermaidGenerator
- **Rounds**: 7

---

## Round 1: そもそも data-flow 図に何の意味がある？

先輩: tramli には状態遷移図がある。A → B → C。で、DD-014 で「requires/produces から data-flow を導出して Mermaid で可視化する」と決めた。`OrderRequest → [OrderInit] → PaymentIntent → [PaymentGuard] → PaymentResult` みたいなやつだ。今日は、この data-flow 導出が「図を出す」以上に何ができるかを考えたい。

☕ ヤン: *紅茶を注ぎながら* 状態遷移図だけで十分じゃないですか。そもそも data-flow 図を見る人は誰なんです？ 開発者はコードを読めば requires/produces が分かる。

👤 今泉: そもそも、状態遷移図と data-flow 図って、見る人が違うんですか？ 同じ開発者が見るなら、なんで 2 つ要るんです？

🎭 ソクラテス: 面白い問いだ。では聞こう——状態遷移図を見て「この状態に到達したとき、どのデータが使えるか」即座に答えられるか？

☕ ヤン: ……それは遷移図からは読めないですね。

🎭 ソクラテス: つまり、2 つの図は同じ対象を別の射影で見ている。遷移図は**制御の流れ**、data-flow 図は**データの流れ**。もし逆だったら？ data-flow 図しかなかったら、どの状態からどの状態に行けるか分かるか？

🤝 後輩: 先輩、つまりこういうことですよね。状態遷移図は「何が起きるか」、data-flow 図は「何が流れるか」。どちらか片方では全体像が見えない。

→ アイデア: **Dual View** — 状態遷移図と data-flow 図をペアで生成し、同じノード（processor/guard）をハイライトで対応付ける

### Scene 2: 可視化以外の活用

先輩: 図を出すのは DD-014 の通り。問題は「図を出す以外に何に使えるか」だ。

👤 今泉: 要するに、requires/produces のグラフを持ってるってことは、「どの型がどこで生まれてどこで消費されるか」のマップがあるってことですよね。他にないの？ そのマップの使い道。

☕ ヤン: *カップを置いて* ……ありますね。**影響分析**。ある型の定義を変えたとき、どの processor と guard に影響するかが一発で分かる。今は grep するしかない。

🎭 ソクラテス: もし `PaymentIntent` のフィールドを変えたとしよう。data-flow グラフがあれば、それを produces する `OrderInit` と、requires する `PaymentGuard` の両方が即座に特定できる。だが聞こう——それは IDE の「参照を検索」と何が違う？

☕ ヤン: IDE は型の使用箇所を出す。data-flow は**フロー文脈での依存**を出す。同じ型を別のフローで使ってても、このフローに関係ないものは出ない。

→ アイデア: **Impact Analysis API** — `dataFlow.impactOf(PaymentIntent.class)` で、そのフロー定義内で影響を受ける processor/guard の一覧を返す

👤 今泉: 前もそうだったっけ……Java の `checkRequiresProduces` はビルド時に「足りない」を検出するけど、「余ってる」は検出しないですよね？ produces したのに誰も requires しない型があったら？

🤝 後輩: あ、それは大事です。*身を乗り出す* 未使用の produced データはデッドコードと同じで、メンテコストだけかかります。

→ アイデア: **Dead Data Detection** — produces されたが下流で一度も requires されない型を警告する（build 時バリデーションに追加）

🎭 ソクラテス: ではもう一歩進めよう。「もし data-flow が**実行時にも**使えたら？」 ビルド時だけでなく、実行中のフローインスタンスで「今この状態で利用可能なデータ一覧」を取得できたら？

☕ ヤン: デバッグに使えますね。フローが途中で止まったとき、「この状態で expects されてるデータのうち、何が足りないか」が分かる。

→ アイデア: **Runtime Data Introspection** — `flowInstance.availableData()` で現在の状態での利用可能データ型一覧、`flowInstance.missingFor(nextState)` で次の遷移に不足しているデータを返す

### Scene 3: 言語横断で何が見えるか

先輩: tramli は Java / TypeScript / Rust の 3 言語。data-flow を 3 言語で共通にする意味はあるか。

👤 今泉: そもそも、3 つの言語で同じフロー定義を書くことってあるんですか？

☕ ヤン: 直接は書かない。でも……*考え込む* 例えば「このフロー定義は Java 版と TS 版で等価か？」を検証したい場面はあり得る。data-flow のグラフが共通フォーマットなら、diff が取れる。

🎭 ソクラテス: それは 5 番（根拠なき一般論）ではないか？「あり得る」というが、実際にそのユースケースが存在したか？

☕ ヤン: *苦笑い* ないです。まだ。

🤝 後輩: 先輩、一旦まとめましょう。言語横断の diff は現時点では YAGNI。ただし、共通の出力フォーマット（JSON）は将来の拡張性のために悪くない。Mermaid テキストが共通出力なら、それ自体が diff 可能です。

→ アイデア: **共通 Mermaid 出力** — 3 言語で同一の Mermaid テキストフォーマットを出力。フォーマットが同じなら自然に diff 可能。JSON 中間表現は不要（YAGNI）

👤 今泉: あの、誰が困るの？ って聞きたいんですけど。data-flow 図を一番喜ぶのは誰ですか？ 開発者本人？ コードレビュアー？ 新しくチームに入る人？

🎭 ソクラテス: 良い問いだ。もし私がこのコードベースに初めて触るとしよう。状態遷移図は「フローの構造」を教えてくれる。data-flow 図は「各状態で何のデータを触れるか」を教えてくれる。後者がなければ、processor のコードを一つずつ読むしかない。

→ アイデア: **Onboarding Aid** — `generate(def, { mode: 'data-flow' })` で、新メンバーが「どのデータがどこで生まれてどこで使われるか」を一目で把握できる図を出す。README に貼れる形式で

### Scene 4: 攻め——まだ見えてない価値

🎭 ソクラテス: では最後に聞こう。data-flow グラフは**型の依存グラフ**でもある。依存グラフからは何が導出できる？

☕ ヤン: *目が光る* ……**並列化のヒント**。requires が重ならない processor 同士は理論上並列実行できる。data-flow グラフがあれば自動判定できる。

👤 今泉: そもそも tramli は sync じゃないですか。並列化って要るんです？

☕ ヤン: 今は要らない。けど volta-gateway でフロー数が増えたとき、「この 2 つの auto 遷移は独立してる」が分かるのは価値がある。……でもまあ、今やることではないですね。 *紅茶をすする*

🤝 後輩: あの……一つだけいいですか。*控えめに手を挙げる* data-flow グラフがあると、**テスト生成**にも使えませんか？ 各 processor の requires が分かれば、テストのセットアップで「この型のダミーデータが必要」が自動で分かります。

→ アイデア: **Test Scaffold Generation** — data-flow から各 processor のテストに必要な最小コンテキスト（requires の型一覧）を導出し、テストのボイラープレートを生成

→ アイデア: **Parallelism Hint** (将来) — data-flow の独立性分析から、並列実行可能な遷移ペアを検出

### Round 1 アイデア一覧

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 1 | **Dual View** — 状態遷移図 + data-flow 図のペア生成 | 新機能 | ◎ 高い（MermaidGenerator に mode 追加） |
| 2 | **Impact Analysis API** — 型変更の影響範囲特定 | 新機能 | ◎ 高い（グラフ探索） |
| 3 | **Dead Data Detection** — 未消費 produces の警告 | 改善 | ◎ 高い（build 時バリデーション追加） |
| 4 | **Runtime Data Introspection** — 実行時のデータ可視化 | 新機能 | ○ 中（API 追加、engine 変更小） |
| 5 | **共通 Mermaid 出力** — 3 言語で同一フォーマット | 改善 | ◎ 高い |
| 6 | **Onboarding Aid** — README 向け data-flow 図 | 改善 | ◎ 高い（#1 の副産物） |
| 7 | **Test Scaffold Generation** — テストボイラープレート生成 | 新機能 | ○ 中 |
| 8 | **Parallelism Hint** — 並列実行可能ペア検出 | 突飛 | △ 将来 |

---

## Round 2: 角度を変える——data-flow を「主」にしたら？

先輩: 1 回目は「状態遷移図の補助としての data-flow」を議論した。2 回目は逆から攻める。data-flow を主役にしたら何が変わるか。

### Scene 1: 定義の仕方が変わる？

🎭 ソクラテス: 先ほどの議論を蒸し返そう（12 番を意図的に使用）。DD-014 は「data-flow は導出であり定義ではない」と言った。だが本当にそうか？ もし data-flow を**先に書いて**、そこから状態遷移を導出したらどうなる？

☕ ヤン: *紅茶が止まる* ……逆転の発想ですね。つまり「OrderRequest が来たら PaymentIntent を作る。PaymentIntent が来たら PaymentResult を作る」というデータの変換パイプラインを先に定義して、状態はそこから自動的に生まれると。

👤 今泉: そもそも、ユーザーが本当に考えてるのはどっちなんです？ 「Created → PaymentPending → Confirmed」って状態の名前？ それとも「注文データ → 決済データ → 出荷データ」ってデータの変換？

🤝 後輩: 先輩、これは深い問いです。ドメインによって違いそうです。EC のような業務フローは状態中心で考える人が多い。データパイプライン、ETL は data-flow 中心で考える。

🎭 ソクラテス: ほら、種明かしだ。tramli は「constrained **flow** engine」と名乗っている。flow は状態の流れか？ データの流れか？ 両方か？ 答えを決めつけていないか確認したかっただけだ。

→ アイデア: **Data-Flow-First Builder** — `Builder.fromDataFlow()` で、データ変換の連鎖からフロー定義を自動生成する代替 API。状態名を省略可能にする（自動採番 or processor 名から導出）

### Scene 2: エラーパスのデータはどうなる？

👤 今泉: 前もそうだったっけ。Happy path の data-flow は綺麗に書けるけど、エラーのときデータはどう流れるんです？ `OrderInit` が失敗したら `PaymentIntent` は produces されない。でもエラー状態の processor が `OrderRequest` を requires してエラーログに書きたいかもしれない。

☕ ヤン: あー、確かに。エラー遷移の data-flow は今の図には出てこない。`checkRequiresProduces` もエラーパスは検証してないはず。

🎭 ソクラテス: もし processor が失敗したあと、context にはそれまでに produces された型だけが残る。エラー遷移先の processor が「失敗した processor が produces するはずだった型」を requires していたら？

🤝 後輩: *メモを取りながら* それはビルド時に検出できるはずです。エラーパスを含めた data-flow 解析をすれば。

→ アイデア: **Error Path Data-Flow Analysis** — エラー遷移を含めた data-flow 解析。「processor X が失敗した場合、エラー状態 Y で利用可能なデータは何か」をビルド時に検証

→ アイデア: **FlowError に context snapshot** — processor 失敗時に「何が produces 済みで何が未生成か」を FlowError に付加。デバッグ時に「どこまでデータが作られたか」が分かる

### Scene 3: ドキュメントとしての data-flow

先輩: Mermaid 図は開発者向け。もっと広い読者に向けたドキュメントとしての可能性は？

👤 今泉: 誰が困るのって話で、API ドキュメントを読む外部開発者は困ってません？ 「このエンドポイントを叩いたあと、次に何のデータを送ればいいか」が分からないとき。

☕ ヤン: data-flow 図があれば、External 遷移のところで「ここでクライアントが PaymentResult を送る」が図に出る。API ドキュメントと連動できる。

🎭 ソクラテス: もっと言えば、data-flow は**契約**だ。processor の requires/produces は入出力の契約。それを図示するということは、サービス間の契約を可視化するのと同じではないか？

☕ ヤン: *目を細めて* ……OpenAPI の生成。External 遷移の guard.requires() と guard.produces() から、API のリクエスト/レスポンス型が導出できる。DD-007 で HTTP API は v0.2.0 に先送りしたけど、data-flow からスキーマだけ先に生成するのはアリかもしれない。

🤝 後輩: 先輩、ちょっと飛びすぎてません？ *苦笑い* OpenAPI 生成は大きすぎます。でも「External 遷移のデータ要件をドキュメント化する」のは data-flow 図の自然な拡張ですね。

→ アイデア: **External Contract View** — data-flow 図の External 遷移部分を強調した図。「クライアントが送るべきデータ」と「受け取れるデータ」を明示。API ドキュメント向け

### Scene 4: data-flow × 監視

☕ ヤン: *急に真顔になる* ……一つ思いついた。data-flow のグラフがあれば、**実行時のボトルネック特定**ができる。各 processor の実行時間を計測して、data-flow グラフの上にオーバーレイする。どのデータ変換が遅いか一目瞭然。

👤 今泉: 要するに、data-flow 図 + メトリクスで、フローのパフォーマンスプロファイルが作れると？

🎭 ソクラテス: だが待て。tramli のエンジン処理は 2μs だと言っていなかったか？ ボトルネックは External 遷移の外部 I/O であって、processor の中ではない。

☕ ヤン: ……あ、そうですね。 *紅茶を飲む* processor 単体はマイクロ秒。ボトルネックは Engine の外。じゃあ要らないか。

🤝 後輩: いえ、あの……一つだけ。*手を挙げる* processor 自体は速くても、「フロー全体でどのデータが何回 clone されてるか」は data-flow から推定できます。Rust 版の clone 問題みたいに、context サイズがパフォーマンスに効くケースでは有用では？

→ アイデア: **Context Size Estimator** — data-flow の累積 produces 数から、各状態での context サイズ（型の数）を推定。「この状態では N 個の型が context に載ってる」を図に注釈

### Round 2 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 9 | **Data-Flow-First Builder** — データ変換パイプラインからフロー定義を生成 | 方向転換 | △ 要設計 |
| 10 | **Error Path Data-Flow Analysis** — エラー遷移含む data-flow 検証 | 改善 | ◎ 高い |
| 11 | **FlowError に context snapshot** — 失敗時の produces 済み/未生成データ付加 | 改善 | ◎ 高い |
| 12 | **External Contract View** — External 遷移のデータ要件ドキュメント化 | 新機能 | ○ 中 |
| 13 | **Context Size Estimator** — 状態ごとの context サイズ推定・注釈 | 改善 | ◎ 高い |

---

## Round 3: 外の世界——他のエコシステムから何を学べるか

先輩: 2 回転した。今度は tramli の外を見る。Temporal、AWS Step Functions、Apache Airflow——ワークフローエンジンの先達が data-flow をどう扱ってるか、そこから tramli に持ち帰れるものはないか。

### Scene 1: Airflow の DAG から盗む

🎭 ソクラテス: まず問おう。Airflow はタスクの DAG を定義する。各タスクは XCom で データを渡す。これは tramli の requires/produces と何が同じで何が違う？

☕ ヤン: Airflow の XCom は動的——実行時に何でも渡せる。tramli は静的——ビルド時に requires/produces が宣言されている。つまり tramli の方が**コンパイル時保証が強い**。

👤 今泉: そもそも、Airflow ユーザーが一番困ってることって何なんです？

☕ ヤン: XCom のデバッグですよ。「upstream タスクが何を渡したか分からない」「型が合わない」「暗黙の依存が壊れる」。全部、静的な data-flow 宣言があれば解決する問題。

🎭 ソクラテス: ならば tramli の data-flow 導出は、Airflow が**できなかったこと**を実現しているわけだ。それを自覚して語るべきではないか？

→ アイデア: **ポジショニング：静的 data-flow 保証** — 「Airflow/Temporal にできないビルド時 data-flow 検証」を tramli の差別化ポイントとして README / ドキュメントで明示

### Scene 2: フロー合成と data-flow

先輩: 一つのアプリで複数の FlowDefinition を持つケースがある。例えば OrderFlow と RefundFlow。あるフローの output が別のフローの input になることもある。

👤 今泉: 他にないの？ 単一フロー内の data-flow じゃなくて、**フロー間の data-flow** って考えたことあります？

☕ ヤン: ……ないですね。今の data-flow はフロー定義内で閉じている。

🎭 ソクラテス: もし `OrderFlow` が `ShipmentInfo` を produces して完了し、`RefundFlow` が `ShipmentInfo` を requires するなら、2 つのフロー間にデータ依存がある。これは静的に検出可能か？

🤝 後輩: 先輩、できますよ。両方の FlowDefinition の data-flow グラフを結合して、cross-flow の依存を出せばいい。

☕ ヤン: ただ、それは**実行時のデータ受け渡し**をどう設計するかという別の問題も含む。今は先走りすぎか。 *紅茶をすする* でもグラフの結合だけなら、可視化のレイヤーで十分やれる。

→ アイデア: **Cross-Flow Data-Flow Map** — 複数の FlowDefinition を入力し、フロー間のデータ依存（produces → requires の型一致）を検出・可視化

### Scene 3: IDE との統合

先輩: Mermaid 図はファイルに出す。でも開発者が一番長く見てるのは IDE の画面だ。

👤 今泉: 誰が困るのって話で……processor を書いてるとき「このコンテキストに何が入ってるか」知りたいの、エディタ上でじゃないですか？

🎭 ソクラテス: 良い指摘だ。data-flow グラフがあれば、ある processor の `process()` メソッド上で**利用可能な context の型一覧**をツールチップで出せるのではないか？

☕ ヤン: LSP は重すぎる。けど……型の一覧を JSON で出す API があれば、VSCode 拡張で読める。`MermaidGenerator.dataFlow(def)` が Mermaid テキストだけじゃなく構造化 JSON も返せたら。

🤝 後輩: 先輩、それって `generate` が 2 つのフォーマットを返すということですか？

☕ ヤン: いや、メソッドを分ける。`generateMermaid()` と `analyzeDataFlow()` で。`analyzeDataFlow()` は構造化データを返す。Mermaid はそのデータから生成する。**データが先、可視化が後**。

→ アイデア: **DataFlowAnalyzer API** — `DataFlowAnalyzer.analyze(def)` で構造化データ（型名、producer、consumer、各状態での available set）を返す。MermaidGenerator はこの結果を消費するだけ

→ アイデア: **IDE 向け JSON 出力** — DataFlowAnalyzer の結果を JSON で出力。VSCode 拡張等で processor 編集時に「available context types」をツールチップ表示

### Scene 4: セキュリティとコンプライアンス

🎭 ソクラテス: では最後に全く別の角度から。data-flow グラフは「どのデータがどこを通るか」の地図だ。もしそのデータに PII（個人情報）が含まれていたら？

☕ ヤン: ……。 *紅茶を止める*

👤 今泉: そもそも、「この型は PII を含む」って宣言する仕組み、ありましたっけ？

☕ ヤン: ない。

🎭 ソクラテス: data-flow グラフに型のアノテーション（`@PII`、`@Secret`）を追加できれば、「PII がどの processor を通過するか」のデータリネージが自動生成できる。GDPR の「データの流れの説明」要件に使える。

🤝 後輩: *メモを走らせる* つまり data-flow + 型アノテーション = データリネージ。コンプライアンスツールになると。ただ、これは tramli 本体に入れるべきかは別の議論ですね。

☕ ヤン: ……まあ、アノテーションの仕組みだけ入れて、解釈はユーザー側に任せるのが tramli らしいですかね。 *紅茶を飲み直す*

→ アイデア: **Type Annotation（メタデータ）** — requires/produces の型に任意のアノテーション（PII, Secret, Immutable 等）を付加可能にし、data-flow 図にタグとして表示

→ アイデア: **Data Lineage Export** — アノテーション付き data-flow を CSV/JSON でエクスポート。コンプライアンス監査ツールに入力可能

### Round 3 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 14 | **静的 data-flow 保証のポジショニング** | 改善 | ◎ ドキュメントだけ |
| 15 | **Cross-Flow Data-Flow Map** | 新機能 | ○ 中 |
| 16 | **DataFlowAnalyzer API（構造化データ）** | 新機能 | ◎ 高い |
| 17 | **IDE 向け JSON 出力** | 新機能 | ○ 中（#16 の上） |
| 18 | **Type Annotation** | 新機能 | ○ 中 |
| 19 | **Data Lineage Export** | 突飛 | △ 将来 |

---

## Round 4: ユーザーの手触り——API デザインと「使われ方」

先輩: 3 回転でアイデアは出た。4 回目は視点を変えて「実際に使う開発者がどう触るか」に焦点を当てる。API の手触り、学習曲線、使って気持ちいいかどうか。

### Scene 1: requires/produces は面倒くさくないか？

☕ ヤン: *あくびしながら* そもそもの話をしていいですか。requires/produces を毎回手書きするの、だるくないですか。

👤 今泉: そもそも、開発者は requires/produces を**正しく書く**んですか？ `process()` の中で `ctx.get::<D>()` してるのに requires に D を書き忘れたら？

🎭 ソクラテス: 良い問いだ。現状は「書き忘れたらビルド時にエラー」だが、逆に聞こう。`process()` の実装から requires/produces を**推論**できないのか？

☕ ヤン: Java はリフレクションで無理。TypeScript も無理。でも……Rust ならマクロでワンチャンある。`ctx.get::<D>()` の呼び出しを proc macro で解析して requires を自動生成。

🤝 後輩: 先輩、Java と TypeScript でも、`process()` 内の `ctx.get()` / `ctx.put()` の呼び出しをテスト時に記録して、宣言と突き合わせるのはできますよね。

→ アイデア: **Requires/Produces 自動検証** — テスト実行時に processor の実際の get/put を記録し、宣言された requires/produces と一致するか検証する。宣言漏れ・過剰宣言を検出

→ アイデア: **Rust proc macro `#[derive(Processor)]`** — `ctx.get::<T>()` / `ctx.put(v)` から requires/produces を自動導出するマクロ（将来）

### Scene 2: data-flow 図のインタラクティブ性

先輩: Mermaid は静的な図だ。GitHub の README に貼れる。でもそれだけで十分か？

🎭 ソクラテス: 問おう。静的な図を「眺める」のと、図を「触って理解する」のは同じ体験か？

👤 今泉: 要するに、クリックしたら詳細が出るとか、そういう話ですか？

☕ ヤン: Mermaid はインタラクティブにならない。ただ……`DataFlowAnalyzer` が構造化 JSON を返すなら、その JSON を食わせて HTML で描画するビューアーは作れる。

🤝 後輩: あの、tramli にはもう `dve`（Design Visualization Engine）がありますよね？ *全員の方を見る* `dve/dist/graph.json` が変更されてた。dve に data-flow モードを足すのが一番自然では？

☕ ヤン: *目が覚める* ……あー、そうだ。dve を忘れてた。dve が既にセッションや DD のグラフを可視化してる。data-flow もそこに載せるのが筋ですね。

🎭 ソクラテス: ほら。道具は既にある。新しいものを作る前に既にあるものを使え、というのは私ではなくヤンの信条ではなかったか？

☕ ヤン: *苦笑い* おっしゃる通り。

→ アイデア: **dve に data-flow ビュー追加** — DataFlowAnalyzer の JSON を dve のグラフに統合。インタラクティブに「この processor をクリック → requires/produces が見える」

→ アイデア: **Mermaid はエクスポート専用** — メイン可視化は dve、Mermaid は README 貼り付け用の静的エクスポートと割り切る

### Scene 3: 学習の順序

👤 今泉: 誰が困るのって改めて聞きたいんですけど。tramli を初めて使う人は、何から理解すべきなんです？ FlowState → Builder → Engine の順？ それとも data-flow から？

🎭 ソクラテス: もし私が初めて tramli を学ぶなら、「注文が来て、決済して、出荷する」という**データの変換**で説明してくれた方が直感的だ。状態名は後からでいい。

☕ ヤン: つまり**チュートリアルの順番**が変わる。「まずデータを定義 → processor を書く → Builder でフローにする → data-flow 図で確認」。今のチュートリアルは状態から入ってる。

🤝 後輩: 先輩、これは面白いです。data-flow 図があることで、**学習のゴール**が見える化できる。「この図の通りにデータが流れたら完成」という視覚的なゴール。

→ アイデア: **Data-Flow-First チュートリアル** — 「まずデータ型を定義し、data-flow 図を見て、その通りになるように processor を実装する」という学習パス。図がテストの代わりになる

### Scene 4: data-flow がテストになる

🎭 ソクラテス: 今の発言を突き詰めよう。「図がテストの代わり」——これは比喩か？ それとも文字通りか？

☕ ヤン: *身を乗り出す* ……文字通りにできる。data-flow グラフは「状態 X に到達したとき、型 A, B, C が context にあるべき」という**不変条件**を表現している。これをアサーションとして自動生成できる。

👤 今泉: そもそも、ユーザーが手で書いてる integration test って、大半が「この状態でこのデータがある」の確認じゃないですか？

☕ ヤン: そう。で、data-flow グラフから自動生成できるアサーションは:
- 状態 X に到達 → `context.has::<A>()` が true
- processor Y 通過後 → `context.has::<B>()` が true
- terminal 状態 → 全 produces 済み型が context にある

🤝 後輩: 先輩、#7（Test Scaffold）の進化版ですね。スキャフォールドじゃなくて、**テスト自体の自動生成**。

🎭 ソクラテス: 種明かしだ。data-flow グラフは仕様であり、仕様からテストが生成できる。これはプロパティベーステストの思想に近い。「このフロー定義は、data-flow グラフが表現する不変条件を満たす」——これ自体が一つのプロパティだ。

→ アイデア: **Data-Flow Invariant Test Generator** — data-flow グラフから「各状態での context 不変条件」を自動生成し、テストコードとして出力。手書きの integration test を大幅削減

→ アイデア: **`assertDataFlow(def, instance)`** — フローインスタンスが data-flow グラフの不変条件を満たしているか一発検証する API。テストで `assertDataFlow(def, engine.store.get(flowId))` と書くだけ

### Round 4 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 20 | **Requires/Produces 自動検証**（実行時記録 vs 宣言） | 改善 | ◎ 高い |
| 21 | Rust proc macro `#[derive(Processor)]` | 突飛 | △ 将来 |
| 22 | **dve に data-flow ビュー追加** | 新機能 | ○ 中 |
| 23 | Mermaid はエクスポート専用と割り切る | 改善 | ◎（設計方針） |
| 24 | Data-Flow-First チュートリアル | 改善 | ◎（ドキュメント） |
| 25 | **Data-Flow Invariant Test Generator** | 新機能 | ○ 中 |
| 26 | **`assertDataFlow()` API** | 新機能 | ◎ 高い |

---

## Round 5: 時間軸——data-flow は「変化」をどう捉えるか

先輩: 4 回転で 26 個のアイデアが出た。これまでは「今のフロー」のスナップショットを見ていた。5 回目は**時間**を入れる。フローは進化する。data-flow はその進化をどう助けるか。

### Scene 1: フロー定義のバージョン間 diff

☕ ヤン: *紅茶を淹れ直しながら* ある日 `OrderFlow` に新しい状態 `FraudCheck` を差し込むとする。状態遷移図の diff は分かりやすい。ノードが増える、エッジが変わる。でも data-flow の diff は？

🎭 ソクラテス: 良い問いだ。新しい processor が新しい型を requires するとき、その型は誰が produces する？ 既存の processor か？ 新しい processor か？ この「データ依存の変化」は状態遷移図からは読み取れない。

👤 今泉: そもそも、フロー定義を変更したとき「何が壊れるか」って、今はどうやって確認してるんですか？

☕ ヤン: `checkRequiresProduces` でビルドが落ちるのを待つ。事後検出。

🎭 ソクラテス: もし data-flow グラフの v1 と v2 を diff できたら、**ビルドする前に**「この変更で PaymentGuard の requires が満たせなくなる」と分かるのではないか？

🤝 後輩: 先輩、つまり PR のレビュー時に「data-flow diff」が見えると。状態遷移図の diff と並べて。

→ アイデア: **Data-Flow Diff** — 2 つの FlowDefinition の data-flow グラフを比較し、追加・削除・変更されたデータ依存を一覧化。PR レビュー向け

### Scene 2: 後方互換性の検証

👤 今泉: 前もそうだったっけ。フロー定義を変えたとき、**実行中のフローインスタンス**はどうなるんです？ 古い定義で途中まで進んだフローが、新しい定義で再開されたら？

☕ ヤン: *カップを置く* ……あー。それは怖い話ですね。

🎭 ソクラテス: 具体的に言おう。v1 では状態 B で `PaymentIntent` だけが context にある。v2 では状態 B の次の processor が `FraudScore` も requires する。v1 で状態 B まで進んだインスタンスが v2 で再開されたら——

☕ ヤン: `FraudScore` がない。processor が落ちる。

🤝 後輩: data-flow グラフがあれば、「v1 の状態 X での available set」と「v2 の状態 X での requires set」を突き合わせて、**互換性を静的に検証**できますね。

☕ ヤン: これは地味に強い。マイグレーションガイドが自動で出る。「v2 にアップグレードするとき、状態 B で停止中のインスタンスには FraudScore を inject してから再開してください」って。

→ アイデア: **Version Compatibility Check** — FlowDefinition の v1/v2 間で、各状態の available data set を比較し、実行中インスタンスの互換性を検証。非互換の場合はマイグレーション手順を提示

→ アイデア: **Migration Guide Generator** — 非互換が検出された場合、「状態 X のインスタンスには型 T を inject してから再開」等のマイグレーション手順を自動生成

### Scene 3: data-flow の「負の空間」

🎭 ソクラテス: ここで全く違う角度から。data-flow グラフは「何が流れるか」を示す。だが**流れないもの**にも情報がある。もし `OrderRequest` が最初に produces されて、terminal 状態まで一度も requires されなかったら？

☕ ヤン: ……デッドデータ。#3 で出ましたね。

🎭 ソクラテス: 違う。#3 は「produces されたのに requires されない」だった。私が言っているのはもっと広い。**データのライフサイクル**だ。生まれる、使われる、最後に使われる。最後に使われた後も context に残り続ける。それは**メモリリーク**と同じ構造ではないか？

👤 今泉: そもそも、context って状態が進むにつれて膨らみ続けるんですか？ 一度 put されたら消えない？

☕ ヤン: 消えない。DD-014 のポリシー——processors は破壊的変更をしない——だから、context は単調増加。

🎭 ソクラテス: ならば data-flow グラフから「型 T は状態 X 以降 requires されない」が分かれば、**context の枝刈り**のヒントになる。

🤝 後輩: 先輩、これは #13（Context Size Estimator）の発展ですね。サイズを推定するだけでなく、**不要になった型を特定**する。

→ アイデア: **Data Lifetime Analysis** — 各型の「最初に produces される状態」「最後に requires される状態」を導出。最後の requires 以降は理論上 context から除去可能

→ アイデア: **Context Pruning Hint** — data lifetime 分析から「状態 X 通過後、型 T は不要」を報告。メモリ最適化の手がかり（Rust の volta-gateway で特に有用）

### Scene 4: AI に食わせる

先輩: 最後にもう一つ角度を変える。data-flow グラフを人間ではなく**AI に食わせたら**。

🤝 後輩: あの……一つだけいいですか。*控えめに* 今この DGE セッション自体が、tramli の設計ドキュメントを AI（Claude）に食わせて議論してますよね。data-flow 図があったら、この議論の質は変わりましたか？

🎭 ソクラテス: *沈黙。腕を組む。*

☕ ヤン: ……変わりますね。状態遷移図だけだと「構造」しか見えない。data-flow があれば「この状態で何のデータが使えるか」が一目で分かるから、AI が processor の実装を提案できる。

👤 今泉: 要するに、data-flow 図 + 型定義があれば、AI が processor の中身を書けるってことですか？

☕ ヤン: そう。requires が `[OrderRequest]`、produces が `[PaymentIntent]` なら、AI は「OrderRequest を受け取って PaymentIntent を生成する processor」のスケルトンを書ける。型のフィールド定義があれば中身も。

🎭 ソクラテス: つまり data-flow グラフは**コード生成のスペック**になる。仕様が先、実装が後。DD-014 の「定義ではなく導出」に対して、ここでは導出された data-flow が**新たな定義として**使われる。面白い反転だ。

→ アイデア: **AI-Assisted Processor Generation** — data-flow グラフ + 型定義を LLM に渡し、processor のスケルトンまたは実装を自動生成。`tramli generate processor --from-dataflow`

→ アイデア: **Data-Flow as Context for AI Review** — DGE セッションや AI コードレビュー時に、data-flow 図を自動で context に含める。AI がフローのデータ依存を理解した上でレビュー

### Round 5 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 27 | **Data-Flow Diff** | 新機能 | ○ 中 |
| 28 | **Version Compatibility Check** | 新機能 | ○ 中 |
| 29 | Migration Guide Generator | 新機能 | △ 将来（#28 の上） |
| 30 | **Data Lifetime Analysis** | 新機能 | ◎ 高い（グラフ解析） |
| 31 | **Context Pruning Hint** | 改善 | ◎ 高い（#30 の上） |
| 32 | AI-Assisted Processor Generation | 突飛 | ○ 中 |
| 33 | Data-Flow as Context for AI Review | 改善 | ◎ 高い |

---

## Round 6: メタ——data-flow はどこに住むべきか

先輩: 5 回転で 33 個。量は十分。6 回目は抽象度を上げる。data-flow 分析は「tramli の機能」なのか「tramli の上に乗る別ツール」なのか。それによって設計が根本的に変わる。

### Scene 1: コアか、付属品か

🎭 ソクラテス: 根本的な問いから始めよう。`checkRequiresProduces` はビルド時バリデーションとして FlowDefinition の中にある。これは**コア**だ。では `DataFlowAnalyzer` は？ MermaidGenerator と同じ「あると便利」な付属品か？

☕ ヤン: MermaidGenerator は完全に付属品。なくてもフローは動く。DataFlowAnalyzer は……

👤 今泉: そもそも、#3（Dead Data Detection）とか #10（Error Path Analysis）って、ビルド時バリデーションの強化ですよね？ それはコアでは？

☕ ヤン: そうなんですよ。ここが厄介。data-flow **分析**は付属品だけど、分析**結果をバリデーションに使う**となるとコアに食い込む。

🎭 ソクラテス: では切り分けよう。「data-flow グラフの構築」と「グラフの利用」は分離できるか？

🤝 後輩: 先輩、できます。`DataFlowGraph` を FlowDefinition の `build()` 時に**常に構築**して、内部に保持する。バリデーションはそれを使う。外部ツール（Mermaid、dve、AI）もそれを使う。グラフ構築がコア、利用が付属品。

☕ ヤン: *頷く* いいですね。FlowDefinition が `dataFlowGraph()` を公開 API として持つ。build 済みの定義には常にグラフがある。追加コストはほぼゼロ——既に `checkRequiresProduces` で同じ走査をしてるから。

→ アイデア: **DataFlowGraph をコアに埋め込む** — `FlowDefinition.build()` 時に data-flow グラフを構築・保持。`def.dataFlowGraph()` で取得。MermaidGenerator 等は消費するだけ

### Scene 2: グラフの構造

先輩: DataFlowGraph の中身。何を持つべきか。

☕ ヤン: 最小限を考えましょう。 *指を折りながら*

🎭 ソクラテス: ではソクラテス式で。DataFlowGraph に「状態 X で利用可能な型の集合」を聞いたら答えられるか？

☕ ヤン: はい。各状態に `availableTypes: Set<TypeId>` を持てばいい。

🎭 ソクラテス: 「型 T を produces する processor はどれか」を聞いたら？

☕ ヤン: `producers: Map<TypeId, List<ProducerInfo>>` で。ProducerInfo は processor 名と状態のペア。

🎭 ソクラテス: 「型 T を requires する processor はどれか」は？

☕ ヤン: `consumers: Map<TypeId, List<ConsumerInfo>>`。

🎭 ソクラテス: 「型 T の寿命は？」

☕ ヤン: producers と consumers から `firstProduced` と `lastConsumed` を導出。

👤 今泉: 要するに、ノードが「型」と「processor/guard」の二部グラフですよね。型 → processor の requires エッジと、processor → 型の produces エッジ。

🤝 後輩: *ホワイトボードに描く*

```
[OrderRequest] --requires--> (OrderInit) --produces--> [PaymentIntent]
[PaymentIntent] --requires--> (PaymentGuard) --produces--> [PaymentResult]
[PaymentResult] --requires--> (ShipProcessor) --produces--> [ShipmentInfo]
```

二部グラフですね。型ノードと処理ノードが交互に並ぶ。

→ アイデア: **二部グラフ表現** — DataFlowGraph は型ノード（TypeId）と処理ノード（Processor/Guard 名）の二部グラフ。requires エッジと produces エッジの 2 種。全クエリはこのグラフ上の探索

### Scene 3: ドメインモデルとの接点

👤 今泉: 前もそうだったっけ。tramli の context に入れる型って、結局ドメインモデルそのものですよね。`OrderRequest`, `PaymentIntent`——これは DDD でいう Value Object やドメインイベントに近い。

🎭 ソクラテス: 面白い。data-flow グラフは**ドメインイベントの因果関係**を表しているとも言える。OrderRequest が「起きた」から PaymentIntent が「生まれた」。

☕ ヤン: Event Sourcing の文脈で言うと、各 processor は「コマンドを受けてイベントを発行する」アグリゲートに近い。data-flow グラフはイベントの因果チェーン。

👤 今泉: じゃあ、data-flow 図って**ドメインの語彙の地図**になりませんか？ 新しいチームメンバーが「この業務ドメインにどんなデータ概念があるか」を一目で理解できる。

🤝 後輩: 先輩、#6（Onboarding Aid）と #24（Data-Flow-First チュートリアル）がここに繋がりますね。data-flow 図 = ドメインの語彙カタログ。

→ アイデア: **Domain Vocabulary Map** — data-flow 図の型ノードにドキュメント文字列を付加可能にする。型名だけでなく「これは何を表すか」が図上で見える。ユビキタス言語の可視化

### Scene 4: processor の交換可能性

🎭 ソクラテス: 最後にもう一つ。二部グラフの性質から自然に導かれる帰結がある。同じ requires/produces シグネチャを持つ 2 つの processor は、data-flow 的に**交換可能**だ。

☕ ヤン: ……プラグイン。processor をインターフェースとして、実装を差し替えられる。data-flow 的互換性が「差し替えても壊れない」保証になる。

👤 今泉: そもそも、それって今もできるんじゃないですか？ 同じ trait/interface を実装すれば。

☕ ヤン: 型シグネチャが同じなら差し替えられる。でも今はそれを**機械的に検証**できない。data-flow グラフがあれば「この processor を X から Y に替えても data-flow が壊れない」を自動検証できる。

🤝 後輩: テスト戦略にも影響しますね。*考え込む* processor の単体テストは processor の中身を検証する。data-flow の互換性テストは processor の「外形」——requires/produces のシグネチャ——を検証する。両方あって初めて安全に差し替えられる。

→ アイデア: **Processor Compatibility Check** — 2 つの processor が data-flow 的に交換可能か検証。`DataFlowGraph.isCompatible(processorA, processorB)` → requires/produces が一致または包含関係か

→ アイデア: **Processor Registry Pattern** — 同じ data-flow シグネチャの processor をレジストリで管理し、環境（dev/staging/prod）や設定で差し替え。Strategy パターンの data-flow 版

### Round 6 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 34 | **DataFlowGraph をコアに埋め込む** | 方向転換 | ◎ 高い |
| 35 | **二部グラフ表現** | 設計方針 | ◎（#34 の内部構造） |
| 36 | Domain Vocabulary Map（型にドキュメント付加） | 新機能 | ○ 中 |
| 37 | **Processor Compatibility Check** | 新機能 | ◎ 高い |
| 38 | Processor Registry Pattern | 突飛 | △ 将来 |

---

## Round 7: 刈り込み——38 個のうち何を捨てるか

先輩: 6 回転で 38 個。発散は十分。7 回目は**収束**。ヤンの出番だ。何を捨てるか。

### Scene 1: 38 個は多すぎる

☕ ヤン: *紅茶を置いて立ち上がる* はっきり言います。38 個のうち半分以上は v0.2.0 に要らない。tramli は v0.1.0 を出したばかりのライブラリです。ユーザーがまだゼロ人のところに 38 機能を計画するのは妄想です。

👤 今泉: そもそも、crates.io に publish したばかりで、Java も TS もあるけど、誰が使ってるんですか？

☕ ヤン: 自分だけ。volta-gateway 向け。

🎭 ソクラテス: ならば問おう。volta-gateway の開発者——つまり自分自身——が**今日必要としている**のは 38 個のうちどれだ？

☕ ヤン: *座り直す* ……正直に言うと、Mermaid の data-flow 図があれば十分。README に貼って、フローの構造を説明できればいい。

👤 今泉: 要するに、#1（Dual View）と #5（共通 Mermaid 出力）だけ？

☕ ヤン: と、#3（Dead Data Detection）。これはバリデーションの強化だからビルドが安全になる。3 個。

🤝 後輩: 先輩、ちょっと待ってください。#34（DataFlowGraph をコアに）は設計方針です。これを先に決めないと、#1 も #3 も実装方針がブレます。

☕ ヤン: ……それは認めます。じゃあ 4 個。

→ アイデア: **v0.2.0 スコープを 4 個に絞る** — #34（DataFlowGraph コア）、#1（Dual View Mermaid）、#3（Dead Data Detection）、#5（共通フォーマット）

### Scene 2: 捨てるものを名指しする

🎭 ソクラテス: 絞るなら、逆に「これは絶対やらない」を名指しで言え。曖昧な「将来」は捨てたのと同じだ。

☕ ヤン: いいですよ。*指を折る*

**捨てる（YAGNI）:**
- #9 Data-Flow-First Builder——フロー定義の書き方を根本から変えるのは破壊的。ユーザーゼロの段階でやる意味がない
- #18 Type Annotation（PII 等）——コンプライアンスは tramli のスコープ外
- #19 Data Lineage Export——同上
- #21 Rust proc macro——マクロの保守コストが高すぎる
- #38 Processor Registry Pattern——Strategy パターンはユーザーが自分でやればいい
- #29 Migration Guide Generator——v0.2.0 時点でマイグレーションが必要なユーザーがいない

👤 今泉: #32（AI Processor Generation）は？

☕ ヤン: 面白いけど、tramli がやることじゃない。AI ツール側が data-flow 図を読めばいいだけ。tramli は**データを出す側**に徹する。

🎭 ソクラテス: 16 番（勝利宣言）の匂いがする。「AI 側がやればいい」は本当か？ ……いや、今回は正しい。tramli は小さなライブラリだ。AI 統合は外部の仕事だ。種明かし不要。

→ アイデア: **明示的 NOT-DOING リスト** — DD として「やらないこと」を記録。#9, #18, #19, #21, #29, #32, #38 は tramli のスコープ外

### Scene 3: 残ったものの優先順位

🤝 後輩: 先輩、捨てるものは決まりました。残りを整理させてください。

**v0.2.0（今やる）:**

| 優先度 | # | アイデア | 理由 |
|--------|---|---------|------|
| P0 | 34 | DataFlowGraph コア | 全ての土台 |
| P0 | 35 | 二部グラフ表現 | #34 の内部設計 |
| P1 | 1 | Dual View Mermaid | ユーザーが見るもの |
| P1 | 5 | 共通 Mermaid 出力 | 3 言語統一 |
| P1 | 3 | Dead Data Detection | ビルド安全性 |

☕ ヤン: 5 個。これ以上は入れない。

👤 今泉: #10（Error Path Analysis）は？ #3 とセットでやれそうですけど。

☕ ヤン: ……やれるけど、v0.2.0 のスコープが膨らむ。

🎭 ソクラテス: 問おう。#10 を入れないと何が起きる？ エラーパスの data-flow が未検証のまま残る。それは「既知のリスク」として許容できるか？

☕ ヤン: 今も許容してる。`checkRequiresProduces` はエラーパスを見てない。v0.1.0 と同じリスク。

🤝 後輩: なら v0.2.0 では許容して、v0.3.0 で #10 ですね。

**v0.3.0（次にやる）:**

| # | アイデア |
|---|---------|
| 10 | Error Path Data-Flow Analysis |
| 30 | Data Lifetime Analysis |
| 31 | Context Pruning Hint |
| 11 | FlowError に context snapshot |
| 20 | Requires/Produces 自動検証 |
| 26 | `assertDataFlow()` API |
| 37 | Processor Compatibility Check |

**v0.4.0+（需要が見えてから）:**

| # | アイデア |
|---|---------|
| 2 | Impact Analysis API |
| 4 | Runtime Data Introspection |
| 7 | Test Scaffold Generation |
| 12 | External Contract View |
| 13 | Context Size Estimator |
| 15 | Cross-Flow Data-Flow Map |
| 17 | IDE 向け JSON 出力 |
| 22 | dve data-flow ビュー |
| 25 | Data-Flow Invariant Test Generator |
| 27 | Data-Flow Diff |
| 28 | Version Compatibility Check |
| 36 | Domain Vocabulary Map |

### Scene 4: 本当にそれでいいか

🎭 ソクラテス: *全員を見回す* 最後に一つ。v0.2.0 を 5 個に絞った。だが本当に聞きたいのはこれだ——data-flow を**出さなかったら**何が困る？ v0.2.0 を data-flow ではなく別の機能に使う選択肢は検討したか？

☕ ヤン: *長い沈黙。紅茶を飲む。*

👤 今泉: そもそも、v0.2.0 で一番求められてるのは data-flow なんですか？ DD-007 で先送りした HTTP API とか、他にもあるのでは。

☕ ヤン: HTTP API は DD-007 で「監視レイヤー」として先送りした。今 volta-gateway を書き始めたら必要になるかもしれないけど、まだ書き始めてない。data-flow は……

🤝 後輩: 先輩、data-flow は「あると設計が安全になる」けど「ないと動かない」わけではない。でも Rust 版を publish した今、README に data-flow 図があると**使ってみたい人**が増えるのでは。

☕ ヤン: ……そうですね。ライブラリの魅力が上がる。DX の問題。5 個なら工数も小さい。やりましょう。

🎭 ソクラテス: よろしい。合意は本物だ。

### Round 7 アイデア追加

| # | アイデア | 分類 | 実現可能性 |
|---|---------|------|-----------|
| 39 | **v0.2.0 スコープ = 5 個に絞る** | 方針 | ◎ |
| 40 | **明示的 NOT-DOING リスト** | 方針 | ◎ |

---

## 最終構造

```
v0.2.0  ← data-flow 導出
├── #34  DataFlowGraph をコアに（二部グラフ #35）
├── #1   Dual View Mermaid
├── #5   共通 Mermaid 出力（3 言語統一）
└── #3   Dead Data Detection

v0.3.0  ← data-flow 活用
├── #10  Error Path Analysis
├── #30  Data Lifetime Analysis + #31 Pruning Hint
├── #11  FlowError context snapshot
├── #20  Requires/Produces 自動検証
├── #26  assertDataFlow() API
└── #37  Processor Compatibility Check

NOT-DOING（スコープ外）:
  #9, #18, #19, #21, #29, #32, #38

ドキュメント（随時）:
  #14 ポジショニング, #23 Mermaid方針, #24 チュートリアル, #33 AI context
```

---

## 📝 セッションフィードバック（任意・30 秒）:
1. キャラ構成は適切だった？ → はい / 変えたい（誰を追加/削除？）
2. 「これは気づかなかった」というアイデアはあった？ → はい / いいえ
3. 一言あれば:
