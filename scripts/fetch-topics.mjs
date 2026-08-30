#!/usr/bin/env node
/**
 * 今日の暗号資産トピックを Anthropic API + web_search で取得し、
 * data/topics.json に書き出す。GitHub Actions から毎朝実行される想定。
 *
 * 必要な環境変数:
 *   ANTHROPIC_API_KEY  必須
 *   ANTHROPIC_MODEL    任意（既定: claude-sonnet-5）
 *
 * 依存パッケージなし。Node 18 以上の標準 fetch を使用。
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data/topics.json");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
// ワークスペース未指定の個人キーは anthropic-workspace-id ヘッダが必須
const WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID;

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY が設定されていません。");
  process.exit(1);
}

/** 日本時間の YYYY-MM-DD */
function todayJST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const today = todayJST();

const prompt = `今日は${today}（日本時間）です。暗号資産市場の「今日のトピック」を3件、日本語でまとめてください。

手順:
1. web_search で直近1〜2日のニュースを調べる（ビットコイン、イーサリアム、そのとき注目度が高まっている銘柄やテーマを1件ずつ）
2. 事実だけを簡潔にまとめる

制約:
- 特定銘柄の売買を勧めない。価格予想を断定しない。
- 出典の媒体名を summary の末尾に括弧書きで添える。
- 出力は下記のJSONのみ。前置き・後書き・コードブロックの記号は一切書かない。

{"topics":[{"tag":"短い分類（例: 規制 / ETF / オンチェーン / マクロ）","title":"25文字以内の見出し","summary":"90文字以内の要約（出典媒体名）"}]}`;

async function main() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      ...(WORKSPACE_ID ? { "anthropic-workspace-id": WORKSPACE_ID } : {})
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }]
    })
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("JSONが見つかりませんでした:\n" + text.slice(0, 300));

  const parsed = JSON.parse(text.slice(start, end + 1));
  const topics = (parsed.topics || [])
    .slice(0, 3)
    .map((t) => ({
      tag: String(t.tag || "TODAY").slice(0, 20),
      title: String(t.title || "").slice(0, 60),
      summary: String(t.summary || "").slice(0, 200)
    }))
    .filter((t) => t.title && t.summary);

  if (!topics.length) throw new Error("トピックが空でした。");

  const payload = {
    generatedAt: today,
    generatedAtISO: new Date().toISOString(),
    model: MODEL,
    topics
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`data/topics.json を更新しました（${topics.length}件 / ${today}）`);
  topics.forEach((t) => console.log(` - [${t.tag}] ${t.title}`));
}

main().catch(async (err) => {
  console.error("取得に失敗しました:", err.message);
  // 既存ファイルがあれば残す。無い場合だけ空の枠を作って後続処理を止めない。
  try {
    await readFile(OUT);
  } catch {
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({ generatedAt: today, topics: [] }, null, 2) + "\n", "utf8");
  }
  process.exit(1);
});
