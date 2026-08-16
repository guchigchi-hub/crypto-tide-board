/* ── 状態管理・イベント・起動処理 ── */

import { PERIODS, SYM2ID, THEMES } from "./config.js";
import { loadMarkets, loadSeries } from "./data.js";
import { renderTide, renderCards, renderOverlay, renderLegend, renderKline, renderDominance } from "./charts.js";
import { renderMonthly, renderRotation } from "./stats.js";

export const $ = s => document.querySelector(s);
export const el = (t,c)=>{const n=document.createElement(t);if(c)n.className=c;return n;};

const mem = {};
export const store = {
  async get(k){
    try{ if(window.storage){const r=await window.storage.get(k);return r?r.value:null;} }catch(e){}
    try{ return localStorage.getItem(k); }catch(e){}
    return k in mem?mem[k]:null;
  },
  async set(k,v){
    mem[k]=v;
    try{ if(window.storage){await window.storage.set(k,v);return;} }catch(e){}
    try{ localStorage.setItem(k,v); }catch(e){}
  }
};

export const state = {
  period:"7d", cur:"jpy", markets:{}, hidden:{}, series:{},
  updatedAt:null, loading:false, fx:1,
  ksym:"BTC", ktf:"1d", ktype:"candle", kzoom:120, klines:{}
};

export function fmtPrice(v,cur){
  cur = cur||state.cur;
  if(v==null||!isFinite(v)) return "—";
  const s = cur==="jpy"?"¥":"$";
  const d = cur==="jpy" ? (v>=10000?0:v>=100?1:v>=1?2:4) : (v>=1000?0:v>=1?2:4);
  return s+v.toLocaleString("ja-JP",{minimumFractionDigits:d,maximumFractionDigits:d});
}
export function fmtPct(v){
  if(v==null||!isFinite(v)) return "—";
  return (v>0?"+":"")+v.toFixed(2)+"%";
}
export const cls = v => (v==null||!isFinite(v))?"flat":v>0?"up":v<0?"down":"flat";
export const tone = v => (v==null||!isFinite(v))?"var(--ink-dim)":v>=0?"var(--up)":"var(--down)";
export function fmtCap(v){
  if(v==null) return "—";
  if(state.cur==="jpy") return v>=1e12?(v/1e12).toFixed(2)+"兆円":Math.round(v/1e8).toLocaleString("ja-JP")+"億円";
  return "$"+(v/1e9).toFixed(1)+"B";
}
export function fmtDate(ms,p){
  const d=new Date(ms), P=p||state.period;
  if(P==="24h") return (d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":00";
  if(P==="1y")  return d.getFullYear()+"/"+(d.getMonth()+1);
  return (d.getMonth()+1)+"/"+d.getDate();
}

/* ── トピック ── */
function renderThemes(extra){
  const box=$("#topics"); box.innerHTML="";
  (extra||[]).forEach(t=>{
    const d=el("div","topic live");
    d.innerHTML='<span class="tag">'+(t.tag||"TODAY")+'</span><h3>'+t.title+'</h3><p>'+t.summary+'</p>';
    box.appendChild(d);
  });
  THEMES.forEach(t=>{
    const d=el("div","topic");
    d.innerHTML='<span class="tag">'+t.tag+'</span><h3>'+t.h+'</h3><p>'+t.p+'</p>';
    box.appendChild(d);
  });
}
function todayKey(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
/** "2026-08-16" → "8月16日"。解釈できなければ null */
function fmtDay(s){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||"");
  return m ? (+m[2])+"月"+(+m[3])+"日" : null;
}
// GitHub Actions が毎朝書き出す data/topics.json を読む。
// 無い・空のときは常設テーマだけを表示する（ブラウザからAPIは呼ばない。鍵はGitHub Secretsのみ）。
async function loadDailyTopics(){
  const btn=$("#topic-refresh");
  btn.disabled=true; btn.textContent="読み込み中…";
  try{
    const r=await fetch("data/topics.json?ts="+Date.now(),{cache:"no-store"});
    if(r.ok){
      const j=await r.json();
      if(j&&j.topics&&j.topics.length){
        const day=fmtDay(j.generatedAt);
        // 生成日をそのまま表示する。今日でない場合も古い日付を正直に出す
        $("#topic-date").textContent = day
          ? day+"時点"+(j.generatedAt===todayKey()?"":"（今日の分は未更新）")
          : "取得日不明";
        renderThemes(j.topics);
        return;
      }
    }
    renderThemes([]);
    $("#topic-date").textContent="常設テーマのみ（今日のトピックは未取得）";
  }catch(e){
    renderThemes([]);
    $("#topic-date").textContent="常設テーマのみ（今日のトピックは未取得）";
  }finally{
    btn.disabled=false; btn.textContent="今日のトピックを更新";
  }
}

/* ── 状態表示 ── */
function showNotice(t,b,retry){
  const n=$("#notice"); n.innerHTML="<b>"+t+"</b><p>"+b+"</p>";
  if(retry){
    const x=el("button","ghost"); x.textContent="再試行";
    x.onclick=function(){n.classList.remove("show");refresh();};
    n.appendChild(x);
  }
  n.classList.add("show");
}
function tickUpdated(){
  if(!state.updatedAt) return;
  const s=Math.round((Date.now()-state.updatedAt)/1000), t=new Date(state.updatedAt);
  const hm=String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0");
  $("#updated").textContent = s<60?(hm+" 更新（"+s+"秒前）"):(hm+" 更新（"+Math.round(s/60)+"分前）");
  $("#meta").classList.toggle("stale",s>180);
}
function skeleton(){
  if($("#cards").children.length) return;
  for(let i=0;i<5;i++) $("#cards").appendChild(el("div","sk sk-card"));
}

/* ── 更新 ── */
async function refresh(){
  if(state.loading) return;
  state.loading=true;
  $("#reload").querySelector("svg").classList.add("spin");
  skeleton();
  try{
    await loadMarkets();
    $("#notice").classList.remove("show");
    renderCards(); renderTide(); renderLegend(); renderOverlay(); tickUpdated();
    const failed = await loadSeries();
    renderCards(); renderOverlay();
    if(failed) showNotice("一部の折れ線データを取得できませんでした",
      "取得が混み合っている可能性があります。1分ほど待ってから再試行してください。",true);
  }catch(e){
    if(e.code===429) showNotice("取得回数の上限に達しました",
      "CoinGeckoの無料APIは短時間の連続取得を制限しています。1分ほど待ってから再試行してください。",true);
    // 429がCORSヘッダなしで返るとTypeErrorになりcodeが付かないため、
    // オンラインなら「混雑の可能性」、オフラインなら「通信環境」と出し分ける
    else if(!navigator.onLine) showNotice("オフラインのようです",
      "通信環境を確認して再試行してください。",true);
    else showNotice("価格データを取得できませんでした",
      "取得が混み合っている（無料APIの制限）か、広告ブロッカーが通信を遮っている可能性があります。1分ほど待ってから再試行してください。",true);
  }finally{
    state.loading=false;
    $("#reload").querySelector("svg").classList.remove("spin");
  }
}

/* ── 操作 ── */
function segHandler(sel,fn){
  $(sel).addEventListener("click",async function(e){
    const b=e.target.closest("button"); if(!b) return;
    const kids=$(sel).children;
    for(let i=0;i<kids.length;i++) kids[i].setAttribute("aria-pressed",kids[i]===b?"true":"false");
    await fn(b);
  });
}
segHandler("#period",async function(b){
  state.period=b.dataset.p; await store.set("period",state.period);
  renderCards(); renderTide(); renderOverlay();
  try{
    const failed=await loadSeries(); renderCards(); renderOverlay();
    if(failed) showNotice("一部の折れ線データを取得できませんでした",
      "取得が混み合っている可能性があります。1分ほど待ってから再試行してください。",true);
    else $("#notice").classList.remove("show");
  }
  catch(e){ if(e.code===429) showNotice("取得回数の上限に達しました","1分ほど待ってから切り替えてください。",true); }
});
segHandler("#cur",async function(b){
  state.cur=b.dataset.c; await store.set("cur",state.cur);
  await refresh(); renderKline(); renderDominance();
});
segHandler("#ksym",async function(b){ state.ksym=b.dataset.s; await store.set("ksym",state.ksym); renderKline(); });
segHandler("#ktf",async function(b){ state.ktf=b.dataset.t; await store.set("ktf",state.ktf); renderKline(); });
segHandler("#ktype",async function(b){ state.ktype=b.dataset.k; await store.set("ktype",state.ktype); renderKline(); });
segHandler("#kzoom",async function(b){ state.kzoom=+b.dataset.z; renderKline(); });
$("#reload").addEventListener("click",function(){ refresh(); renderDominance(); });
$("#topic-refresh").addEventListener("click",function(){ loadDailyTopics(); });

setInterval(function(){ if(document.visibilityState==="visible") refresh(); },60000);
setInterval(tickUpdated,5000);
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"&&state.updatedAt&&Date.now()-state.updatedAt>60000) refresh();
});
const secs=[].slice.call(document.querySelectorAll("section[id]"));
window.addEventListener("scroll",function(){
  let cur=null;
  secs.forEach(function(s){ if(s.getBoundingClientRect().top<120) cur=s.id; });
  document.querySelectorAll("nav a").forEach(function(a){
    a.classList.toggle("on",a.getAttribute("href")==="#"+cur);
  });
},{passive:true});

/* ── 起動 ── */
(async function init(){
  const p=await store.get("period");
  if(p&&PERIODS[p]){
    state.period=p;
    [].forEach.call($("#period").children,x=>x.setAttribute("aria-pressed",x.dataset.p===p?"true":"false"));
  }
  const c=await store.get("cur");
  if(c==="usd"||c==="jpy"){
    state.cur=c;
    [].forEach.call($("#cur").children,x=>x.setAttribute("aria-pressed",x.dataset.c===c?"true":"false"));
  }
  const ks=await store.get("ksym");
  if(ks&&SYM2ID[ks]){
    state.ksym=ks;
    [].forEach.call($("#ksym").children,x=>x.setAttribute("aria-pressed",x.dataset.s===ks?"true":"false"));
  }
  const kt=await store.get("ktf");
  if(kt==="1d"||kt==="1w"){
    state.ktf=kt;
    [].forEach.call($("#ktf").children,x=>x.setAttribute("aria-pressed",x.dataset.t===kt?"true":"false"));
  }
  const kk=await store.get("ktype");
  if(kk==="candle"||kk==="line"){
    state.ktype=kk;
    [].forEach.call($("#ktype").children,x=>x.setAttribute("aria-pressed",x.dataset.k===kk?"true":"false"));
  }

  renderThemes([]);
  await refresh();
  renderKline();
  renderDominance();
  renderMonthly();
  renderRotation();
  loadDailyTopics();
})();
