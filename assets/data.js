/* ── データ取得（CoinGecko / Binance / Bybit） ── */

import { CG, IDS, PERIODS } from "./config.js";
import { state } from "./app.js";

export async function getJSON(url,ms){
  const ctl = new AbortController();
  const to = setTimeout(()=>ctl.abort(), ms||15000);
  try{
    const res = await fetch(url,{headers:{accept:"application/json"},signal:ctl.signal});
    if(res.status===429){const e=new Error("rate");e.code=429;throw e;}
    if(!res.ok){const e=new Error("http"+res.status);e.code=res.status;throw e;}
    return await res.json();
  } finally { clearTimeout(to); }
}

/* ── CoinGecko ── */
export async function loadMarkets(){
  const url = CG+"/coins/markets?vs_currency="+state.cur+"&ids="+IDS.join(",")
    +"&order=market_cap_desc&sparkline=true&price_change_percentage=24h,7d,30d,1y";
  const rows = await getJSON(url);
  const map={}; rows.forEach(r=>map[r.id]=r);
  state.markets = map;
  state.updatedAt = Date.now();
  if(state.cur==="jpy" && map.bitcoin){
    try{
      const u = await getJSON(CG+"/simple/price?ids=bitcoin&vs_currencies=usd");
      if(u.bitcoin && u.bitcoin.usd) state.fx = map.bitcoin.current_price/u.bitcoin.usd;
    }catch(e){}
  } else state.fx = 1;
}
export async function loadSeries(){
  const p=PERIODS[state.period];
  if(state.period==="24h"||state.period==="7d") return 0;
  const need = IDS.filter(id=>!state.series[state.cur+"|"+p.days+"|"+id] && state.markets[id]);
  let failed=0;
  for(let i=0;i<need.length;i++){
    const url=CG+"/coins/"+need[i]+"/market_chart?vs_currency="+state.cur+"&days="+p.days
      +(p.days>90?"&interval=daily":"");
    try{ const d=await getJSON(url); state.series[state.cur+"|"+p.days+"|"+need[i]]=d.prices||[]; }
    // レート制限(429)がCORSヘッダなしで返るとTypeErrorになりcodeが付かない。
    // 黙って欠けたままにせず、失敗数を返して呼び出し側で通知する
    catch(e){ if(e.code===429) throw e; failed++; }
    if(i<need.length-1) await new Promise(r=>setTimeout(r,240));
  }
  return failed;
}
export function seriesFor(id){
  const p=PERIODS[state.period], m=state.markets[id];
  if(state.period==="24h"||state.period==="7d"){
    const sp = m && m.sparkline_in_7d && m.sparkline_in_7d.price;
    if(!sp||!sp.length) return null;
    const arr = state.period==="24h"?sp.slice(-24):sp;
    const end = state.updatedAt||Date.now(), step=3600e3, st=end-(arr.length-1)*step;
    return arr.map((v,i)=>[st+i*step,v]);
  }
  return state.series[state.cur+"|"+p.days+"|"+id]||null;
}

/* ── ローソク足データ ── */
export async function klines(sym,interval,limit){
  const key=sym+"|"+interval;
  if(state.klines[key]) return state.klines[key];
  let out=null;
  try{
    const r = await getJSON("https://api.binance.com/api/v3/klines?symbol="+sym+"USDT&interval="+interval+"&limit="+limit);
    out = r.map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}));
  }catch(e){
    const map={"1d":"D","1w":"W","1M":"M"};
    const r = await getJSON("https://api.bybit.com/v5/market/kline?category=spot&symbol="+sym
      +"USDT&interval="+map[interval]+"&limit="+Math.min(limit,1000));
    const list=(r.result&&r.result.list)||[];
    out = list.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]})).reverse();
  }
  state.klines[key]=out;
  return out;
}
export function sma(arr,n,pick){
  const out=new Array(arr.length).fill(null); let s=0;
  for(let i=0;i<arr.length;i++){
    s += pick(arr[i]);
    if(i>=n) s -= pick(arr[i-n]);
    if(i>=n-1) out[i]=s/n;
  }
  return out;
}
