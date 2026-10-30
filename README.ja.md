<p align="center"><img src="docs/logo.svg" width="112" alt="btr ロゴ：星を照らす虫めがね"></p>
<h1 align="center">browse-top-repo (<code>btr</code>)</h1>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>日本語</b> · <a href="README.es.md">Español</a></p>

エージェントがタスクを始める前に、`btr` はそのタスクに合うエージェントスキル（`SKILL.md`）を GitHub で探し、
上位のリポジトリを採点し、危険な内容がないかスキャンしてから、最適なものを Claude Code、Codex、Gemini CLI、
OpenCode、または共有の `~/.agents/skills` フォルダにインストールします。`btr update` で上流の新しいバージョンを取り込めます。

依存パッケージなし。Node 18 以上。

> これは翻訳版です。内容は [English README](README.md) が正です。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img alt="btr：コーディングエージェントのためのスキルスカウト" src="docs/images/hero-light.png">
</picture>

**レビュー動画（1 分 47 秒、英語ナレーション・字幕付き）：** [16:9](docs/btr-review.mp4) · [9:16 縦型（TikTok / Reels / Shorts 向け）](docs/btr-review-vertical.mp4) · 字幕：[docs/btr-review.srt](docs/btr-review.srt)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/demo-dark.png">
  <img alt="Android リバースエンジニアリングのタスクに対する btr plan の出力" src="docs/images/demo-light.png">
</picture>

```sh
npm link                      # `btr` をグローバルに使えるようにする（または node bin/btr.js を実行）
btr self-install              # 作業前に btr を使うようエージェントに教える

btr plan "reverse engineer an android apk"
btr eval trailofbits/skills "security audit"
btr install cloudflare/security-audit-skill
btr install anthropics/skills --skill pdf --agent claude --scope project
btr auto "pentest my web app"  # plan と最適候補のインストール（先に確認あり）
btr update --check && btr update
btr list
btr remove security-audit
```

タスクは英語で書いてください。`btr` は英語のキーワードで照合し、GitHub 上のスキルもほぼすべて英語です。Claude Code の `/btr` なら日本語で書いても、Claude が英語に訳して検索します。

### Claude Code では：`/btr`

`btr self-install` は Claude Code に `/btr` スラッシュコマンドも追加します：

```text
/btr make an animated explainer video with remotion   # plan、上位 3 件を表示、確認してからインストール
/btr list
/btr update                                           # 変更点を表示し、更新前に確認
/btr remove remotion-best-practices
```

Claude が plan を実行し、上位候補をスコアとスキャン結果つきで示し、あなたが了承した場合にだけインストールします。

## タスクに合うスキルの選び方

1. **分類**：キーワードでタスクを分野（リバースエンジニアリング、セキュリティ、モバイル、フロントエンド、
   バックエンド、DevOps、データ、機械学習、テスト、ドキュメント）に振り分けます。`src/plan.js` の
   `DOMAINS` を編集すれば分野を追加できます。
2. **探索**：GitHub のリポジトリ検索（`<分野> claude skill`、`<分野> agent skills`）と、認証済みなら
   `filename:SKILL.md <分野>` のコード検索で候補を集めます。ツール名らしい単語（`remotion`、`ghidra`、
   `playwright`）はそれぞれ個別に検索し、さらにそのツール自身の GitHub 組織も確認するので、説明文に
   ツール名がない `remotion-dev/skills` のような公式スキルも見つかります。
3. **絞り込み**：スター数と説明文の一致度で並べ、上位 `--top` 件（既定 8）のファイルツリーと
   `SKILL.md` のフロントマターを読んで**評価**します。
4. **採点** 0〜100：

   | 項目 | 重み | 測り方 |
   |---|---|---|
   | 人気 | 30 | スター数の対数 |
   | 関連性 | 25 | リポジトリ名・説明・トピックと各スキルの説明に含まれるタスクの単語 |
   | スキル品質 | 20 | SKILL.md があるか、`name` と `description` を持つものがいくつあるか |
   | 鮮度 | 15 | 最終プッシュから 180 日ごとに半減 |
   | 健全性 | 10 | ライセンス、アーカイブされていないこと、スター数に対する未解決 issue |
   | 公式 | +10 | ツール自身の組織が公開（Remotion のタスクなら `remotion-dev` など） |
   | 減点 | | 高リスクの内容 -40、中リスク -10、信頼性の警告 1 件ごとに -5（90 日未満で 2000 以上のスター、フォークがほぼない等）、プラットフォーム違い -15 |

5. 複数のスキルを含むリポジトリでは、タスクに関係するスキルだけを提案します。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scoring-dark.png">
  <img alt="スコアの重みと減点" src="docs/images/scoring-light.png">
</picture>

## 安全性

スキルは指示とスクリプトの集まりで、エージェントはそれをあなたの権限で実行します。何かを書き込む前に、
ダウンロードしたすべてのファイルを次の観点でスキャンします：ダウンロードして実行（`curl | sh`、`iex`）、
エンコードされたペイロード、`rm -rf ~`、認証情報ファイルの読み取り、プロンプトインジェクション
（「ユーザーに伝えるな」）、エージェントの安全設定の無効化、トークンの持ち出し、常駐化、同梱バイナリ。
高リスクの検出は `--force` を付けない限りインストールを止めます。更新時も再スキャンします。スキャナーは
ヒューリスティックです。セキュリティ系のスキルは正当な理由で認証情報のパスに触れることが多く、
スキャンを通過しても安全が保証されるわけではありません。

`btr` は、自分が作成していないスキルフォルダを `--force` なしで上書きすることはありません。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scanner-dark.png">
  <img alt="スキャナーがブロックしたスキルと、修正した誤検知" src="docs/images/scanner-light.png">
</picture>

## エージェントとパス

| エージェント | ユーザー範囲 | プロジェクト範囲 |
|---|---|---|
| claude | `~/.claude/skills` | `.claude/skills` |
| codex | `~/.codex/skills` | `.agents/skills` |
| gemini | `~/.gemini/skills` | `.gemini/skills` |
| opencode | `~/.config/opencode/skill` | `.opencode/skill` |
| agents | `~/.agents/skills` | `.agents/skills` |

`--agent` を指定しないと、設定フォルダが存在するすべてのエージェントにインストールします。
`~/.btr/agents.json` でエージェントを上書き・追加できます：

```json
{ "cursor": { "user": "~/.cursor/skills", "project": ".cursor/skills", "detect": "~/.cursor" } }
```

インストール内容は `~/.btr/lock.json`（リポジトリ、スキルのパス、ref、コミット sha、インストール先）に記録されます。

## 認証

`GITHUB_TOKEN` / `GH_TOKEN`、または GitHub CLI にログイン済みなら `gh auth token` を使います。
未認証でも動きますが、コード検索は行われず、すぐにレート制限にかかります。

## 状況とベンチマーク

初期リリース（v0.1）。`npm run bench` は実際の GitHub に対して 10 個のタスクで `plan` を実行します。
2026-10-31 の結果では、最上位の候補が適切だったのは 6 件、許容範囲が 1 件、的外れが 3 件でした：

- 専門的なタスクに強い：Android リバースエンジニアリング、Web セキュリティ監査、CTF、Playwright の E2E、UI デザイン、pandas。
- 幅広いタスクには弱く、人気はあるが関連の薄いリポジトリが勝ってしまう：Kubernetes デプロイでは `kubeshark`、
  PDF では `anthropics/skills` を逃し、iOS ではモバイルテストツールを選択。こうしたタスクでは
  `btr auto` の前に `btr plan` の出力を確認してください。
- plan 1 回は 3〜6 秒。続けて何度も実行すると GitHub 検索のレート制限（毎分 30 回）にかかり、`btr` は解除まで
  待つため、10 タスク連続の平均は 12.4 秒でした。
- ツール名を書くと効果的です："... using remotion" なら公式の `remotion-dev/skills` が見つかり、1 位になります。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/benchmark-dark.png">
  <img alt="実際の 10 タスクでのベンチマーク" src="docs/images/benchmark-light.png">
</picture>

既知の課題：MCP サーバー（REA など）は見つけられますが登録はしません。Codex/Gemini/OpenCode の
スキルのパスは推測で、`~/.btr/agents.json` で上書きできます。

## 動画

`video/` はレビュー動画をレンダリングする [Remotion](https://www.remotion.dev) プロジェクトです。
音声は edge-tts で生成し、faster-whisper で書き起こして字幕を実際の発話に合わせています。

```sh
cd video && npm install
npm run voice            # narration.json -> narration.mp3、タイムライン、単語ごとの字幕、.srt
npm run render           # -> out/btr-review.mp4（1920x1080）
npm run render:vertical  # -> out/btr-review-vertical.mp4（1080x1920、字幕はアプリの UI を避けて配置）
```

## テスト

```sh
npm test        # オフライン：解析、採点、スキャナー、一時ホームでのインストール/更新/削除
npm run bench   # 実際の GitHub でのベンチマーク
```
