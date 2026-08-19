#!/usr/bin/env node
/**
 * 潮目盤の朝の通知を Discord Webhook（Embed）へ送る。
 * GitHub Actions から毎朝、トピック更新のあとに実行される想定。
 *
 * 必要な環境変数:
 *   DISCORD_WEBHOOK_URL  必須（送り先チャンネルのWebhook URL）
 *
 * 依存パッケージなし。Node 18 以上の標準 fetch を使用。
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://guchigchi-hub.github.io/crypto-tide-board/";

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK) {
  console.error("DISCORD_WEBHOOK_URL が設定されていません。");
  process.exit(1);
}

const COINS = { bitcoin: "BTC", ethereum: "ETH", ripple: "XRP", binancecoin: "BNB", solana: "SOL" };

/* 日本時間 */
function jstNow() { return new Date(Date.now() + 9 * 3600e3); }
function jstYmd() {
  const d = jstNow();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0")
    + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function jstLabel() {
  const d = jstNow();
  return d.getUTCFullYear() + "年" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日";
}

const pct = (v) => (v == null || !isFinite(v)) ? "—" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function main() {
  let desc = "", tideLines = [], color = 0xE0A93B; // 既定はBTC金色

  // 価格と対BTC潮位（7日）。失敗しても通知自体は送る
  try {
    const ids = Object.keys(COINS).join(",");
    const rows = await getJSON(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=jpy&ids=" + ids
      + "&price_change_percentage=24h,7d");
    const btc = rows.find((r) => r.id === "bitcoin");
    if (btc) {
      const chg = btc.price_change_percentage_24h_in_currency;
      // 日本式の配色：赤＝上昇、青＝下落
      color = (chg == null) ? 0xE0A93B : (chg >= 0 ? 0xF2584B : 0x4DA3E0);
      desc = "**BTC ¥" + Math.round(btc.current_price).toLocaleString("ja-JP")
        + "**（24時間 " + pct(chg) + "／7日 " + pct(btc.price_change_percentage_7d_in_currency) + "）";
      const b7 = btc.price_change_percentage_7d_in_currency;
      tideLines = rows.filter((r) => r.id !== "bitcoin")
        .map((r) => {
          const a7 = r.price_change_percentage_7d_in_currency;
          return { sym: COINS[r.id], rel: (a7 == null || b7 == null) ? null : a7 - b7 };
        })
        .sort((a, b) => ((b.rel ?? -999) - (a.rel ?? -999)))
        .map((t) => (t.rel != null && t.rel > 0 ? "🔺" : "🔽") + " " + t.sym + "  "
          + (t.rel == null ? "—" : (t.rel > 0 ? "+" : "") + t.rel.toFixed(1) + "pt"));
    }
  } catch (e) { console.error("価格の取得に失敗:", e.message); }

  // ドミナンス
  let domLine = null;
  try {
    const g = (await getJSON("https://api.coingecko.com/api/v3/global")).data;
    domLine = "BTC " + g.market_cap_percentage.btc.toFixed(1) + "%／ETH "
      + (g.market_cap_percentage.eth || 0).toFixed(1) + "%"
      + "（市場全体 " + (g.total_market_cap.jpy / 1e12).toFixed(0) + "兆円）";
  } catch (e) { console.error("ドミナンスの取得に失敗:", e.message); }

  // 今日のトピック（リポジトリ内の data/topics.json を読む）
  let topicLines = [], topicNote = "";
  try {
    const j = JSON.parse(await readFile(resolve(ROOT, "data/topics.json"), "utf8"));
    if (j && j.topics && j.topics.length) {
      topicLines = j.topics.slice(0, 3).map((t) => "・[" + t.tag + "] " + t.title);
      // 生成日が今日でなければ、その日付を正直に添える
      if (j.generatedAt && j.generatedAt !== jstYmd()) {
        const m = /^\d{4}-(\d{2})-(\d{2})/.exec(j.generatedAt);
        if (m) topicNote = "（" + (+m[1]) + "月" + (+m[2]) + "日時点）";
      }
    }
  } catch (e) { console.error("topics.json を読めませんでした:", e.message); }

  const fields = [];
  if (tideLines.length) fields.push({ name: "対ビットコイン潮位（7日・BTC比）", value: tideLines.join("\n") });
  if (domLine) fields.push({ name: "ドミナンス", value: domLine });
  if (topicLines.length) fields.push({ name: "今日のトピック" + topicNote, value: topicLines.join("\n") });

  const payload = {
    username: "潮目盤",
    embeds: [{
      title: "今朝の潮目盤 — " + jstLabel(),
      url: SITE,
      color: color,
      description: desc || "価格データを取得できませんでした。サイトでご確認ください。",
      fields: fields,
      footer: { text: "価格：CoinGecko／情報提供のみを目的としています。投資判断はご自身の責任で。" }
    }]
  };

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Discord " + res.status + ": " + (await res.text()).slice(0, 200));
  console.log("Discordへ送信しました（" + jstLabel() + "）。");
}

main().catch((e) => {
  console.error("送信に失敗しました:", e.message);
  process.exit(1);
});
