# 潮目盤 — 暗号資産ダッシュボード

BTC・ETH・XRP・BNB・SOL の値動きと、資金の流れ・季節性統計を1ページで確認する静的サイト。
ビルドツールなし。`index.html` をブラウザで開けば動きます。

## 使い方

```bash
# file:// だと fetch がブロックされるので、必ずサーバ経由で開く
python3 -m http.server 8000
open http://localhost:8000
```

## Claude Code で育てる

1. このフォルダで `claude` を起動
2. `PROMPT.md` の指示を上から順に貼る
3. `CLAUDE.md` は Claude Code が毎回読む常設ルール。方針を変えたいときはここを書き換える

## 構成

```
crypto-tide-board/
├── CLAUDE.md                        Claude Code への常設指示
├── PROMPT.md                        貼るだけの指示文（ステップ順）
├── index.html                       本体（分割前は単一ファイル）
├── assets/                          分割後の CSS / JS 置き場
├── data/topics.json                 今日のトピック（Actions が毎朝更新）
├── scripts/fetch-topics.mjs         トピック取得スクリプト（依存なし）
├── src/prototype.html               初版の丸ごと控え。触らない
└── .github/workflows/
    ├── daily-topics.yml             毎朝7:00 JST にトピック更新
    └── deploy.yml                   main への push で Pages に公開
```

## トピックの自動更新

`scripts/fetch-topics.mjs` が Anthropic API の web_search で当日のニュースを3件まとめ、
`data/topics.json` に書き出します。サイト側はこの JSON を読むだけなので、
ローカルで開いても最新トピックが表示されます。

手元で試す場合:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/fetch-topics.mjs
```

GitHub Actions で動かす場合は、リポジトリの
Settings → Secrets and variables → Actions → New repository secret から
`ANTHROPIC_API_KEY` を登録してください。

## データの出どころ

| 用途 | 取得先 |
|---|---|
| 価格・騰落率・時価総額 | CoinGecko（無料・キー不要） |
| ローソク足 | Binance（失敗時 Bybit にフォールバック） |
| 2015〜2017年前半の月次 | Bitstamp |
| ドミナンス現在値 | CoinGecko `/global` |
| ドミナンス推移 | 節目ごとの概算値（参考データ） |
| 今日のトピック | Anthropic API + web_search |

## 注意

- ドミナンスの過去推移は実測ではなく概算の参考値です。精密に見るときは TradingView の `BTC.D` を。
- 統計はいずれも過去の集計で、将来の値動きを保証しません。
- 情報提供のみを目的としたツールです。投資判断はご自身の責任で。
