/* ── 統計（月別集計・上昇の順番） ── */

import { COINS, SYM2ID, MONTHS } from "./config.js";
import { getJSON, klines } from "./data.js";
import { $, cls, fmtPct } from "./app.js";

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const median = a => {const s=a.slice().sort((x,y)=>x-y),h=s.length>>1;
  return s.length%2?s[h]:(s[h-1]+s[h])/2;};

/* ビットコインの半減期（年・月） */
const HALVINGS = [
  {y:2012,m:11},  // 2012-11-28
  {y:2016,m:7},   // 2016-07-09
  {y:2020,m:5},   // 2020-05-11
  {y:2024,m:4}    // 2024-04-20
];
/** y年m月が直近の半減期から何か月目か（半減期前なら null） */
function monthsSinceHalving(y,m){
  let last=null;
  HALVINGS.forEach(h=>{ if(h.y<y||(h.y===y&&h.m<=m)) last=h; });
  return last?(y-last.y)*12+(m-last.m):null;
}

/* ── 月別統計 ── */
async function buildMonthlyReturns(){
  const rows=[];
  try{
    const m=await klines("BTC","1M",1000);
    m.forEach(k=>{
      const d=new Date(k.t);
      if(k.o>0) rows.push({y:d.getUTCFullYear(),m:d.getUTCMonth()+1,ret:(k.c/k.o-1)*100});
    });
  }catch(e){}
  try{
    const start=Math.floor(Date.UTC(2014,11,20)/1000);
    const d=await getJSON("https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start="+start);
    const oh=(d.data&&d.data.ohlc)||[];
    const by={};
    oh.forEach(x=>{
      const dt=new Date(+x.timestamp*1000);
      const key=dt.getUTCFullYear()+"-"+(dt.getUTCMonth()+1);
      if(!by[key]) by[key]={y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,o:+x.open,c:+x.close};
      else by[key].c=+x.close;
    });
    const have={}; rows.forEach(r=>have[r.y+"-"+r.m]=1);
    Object.keys(by).forEach(k=>{
      const v=by[k];
      if(v.y>=2015 && !have[v.y+"-"+v.m] && v.o>0) rows.push({y:v.y,m:v.m,ret:(v.c/v.o-1)*100});
    });
  }catch(e){}
  rows.sort((a,b)=>a.y-b.y||a.m-b.m);
  const now=new Date();
  return rows.filter(r=>!(r.y===now.getFullYear()&&r.m===now.getMonth()+1));
}

export async function renderMonthly(){
  const rows=await buildMonthlyReturns();
  if(!rows.length){
    $("#month-tbl").innerHTML="<tbody><tr><td>データを取得できませんでした。</td></tr></tbody>";
    return;
  }
  const first=rows[0], last=rows[rows.length-1];
  $("#month-range").textContent=first.y+"年"+first.m+"月〜"+last.y+"年"+last.m+"月（"+rows.length+"か月）";
  // Bitstampの補完（2015年1月〜）が取れなかった場合は、集計開始が遅れている旨を明示する
  const startNote=(first.y>2015||(first.y===2015&&first.m>1))
    ? "補完データ（Bitstamp）を取得できなかったため、集計開始が"+first.y+"年"+first.m+"月になっています。 " : "";

  const stats=[];
  for(let i=1;i<=12;i++){
    const r=rows.filter(x=>x.m===i).map(x=>x.ret);
    if(!r.length) continue;
    const win=r.filter(x=>x>0).length;
    stats.push({m:i,n:r.length,win:win,lose:r.length-win,rate:win/r.length*100,
      avg:mean(r),med:median(r),max:Math.max.apply(null,r),min:Math.min.apply(null,r)});
  }
  const bestAvg=Math.max.apply(null,stats.map(s=>s.avg));
  const worstAvg=Math.min.apply(null,stats.map(s=>s.avg));
  const maxAbs=Math.max.apply(null,stats.map(s=>Math.abs(s.avg)));
  let html='<thead><tr><th>月</th><th>勝敗</th><th>勝率</th><th>平均騰落率</th><th>中央値</th><th>最大</th><th>最小</th></tr></thead><tbody>';
  stats.forEach(s=>{
    const bw=Math.max(2,Math.abs(s.avg)/maxAbs*46);
    html+='<tr class="'+(s.avg===bestAvg?"best":s.avg===worstAvg?"worst":"")+'">'
      +'<td>'+MONTHS[s.m-1]+'</td>'
      +'<td>'+s.win+'勝'+s.lose+'敗</td>'
      +'<td class="'+(s.rate>=50?"up":"down")+'">'+s.rate.toFixed(0)+'%</td>'
      +'<td class="'+cls(s.avg)+'"><span class="bar" style="width:'+bw+'px;background:'
      +(s.avg>=0?"var(--up)":"var(--down)")+'"></span>'+fmtPct(s.avg)+'</td>'
      +'<td class="'+cls(s.med)+'">'+fmtPct(s.med)+'</td>'
      +'<td class="up">'+fmtPct(s.max)+'</td>'
      +'<td class="down">'+fmtPct(s.min)+'</td></tr>';
  });
  html+="</tbody>";
  $("#month-tbl").innerHTML=html;

  const bs=stats.filter(s=>s.avg===bestAvg)[0], ws=stats.filter(s=>s.avg===worstAvg)[0];
  const nowM=new Date().getMonth()+1, cur=stats.filter(s=>s.m===nowM)[0];
  let note=startNote+"平均騰落率が最も高いのは"+MONTHS[bs.m-1]+"（"+fmtPct(bs.avg)+"／勝率"+bs.rate.toFixed(0)
    +"%）、最も低いのは"+MONTHS[ws.m-1]+"（"+fmtPct(ws.avg)+"／勝率"+ws.rate.toFixed(0)+"%）。";
  if(cur) note+="今月（"+MONTHS[nowM-1]+"）は過去"+cur.n+"回で"+cur.win+"勝"+cur.lose+"敗、平均"+fmtPct(cur.avg)+"です。";
  note+=" 各月のサンプルは10回前後にとどまり、少数の急騰・急落月に平均が引っ張られます。傾向の参考にとどめてください。";
  $("#month-note").textContent=note;

  const years=[]; rows.forEach(r=>{ if(years.indexOf(r.y)<0) years.push(r.y); });
  years.sort();
  let h='<table><thead><tr><th>年</th><th>半減期から</th>'+MONTHS.map(m=>'<th>'+m.replace("月","")+'</th>').join("")
    +'<th>年間</th></tr></thead><tbody>';
  years.forEach(y=>{
    const yr=rows.filter(r=>r.y===y);
    let tot=1; yr.forEach(r=>tot*=(1+r.ret/100));
    // その年の各月が「直近の半減期から何か月目」かを示す列。
    // 半減期があった年はその月を表示。金色が濃いほど半減期に近い時期
    const yMin=Math.min.apply(null,yr.map(r=>r.m)), yMax=Math.max.apply(null,yr.map(r=>r.m));
    const hv=HALVINGS.filter(hd=>hd.y===y)[0];
    let hvText, hvMid;
    if(hv){ hvText="半減期 "+hv.m+"月"; hvMid=0; }
    else{
      const a=monthsSinceHalving(y,yMin), b=monthsSinceHalving(y,yMax);
      hvText=(a==null?"—":a+"〜"+b+"か月");
      hvMid=monthsSinceHalving(y,Math.round((yMin+yMax)/2));
    }
    const hvAlpha=hvMid==null?0:[.45,.28,.16,.07][Math.min(3,Math.floor(hvMid/12))];
    h+='<tr><td>'+y+'</td>'
      +'<td style="background:rgba(224,169,59,'+hvAlpha+')">'+hvText+'</td>';
    for(let m=1;m<=12;m++){
      const r=yr.filter(x=>x.m===m)[0];
      if(!r){ h+='<td style="color:var(--ink-dim)">–</td>'; continue; }
      const a=Math.min(1,Math.abs(r.ret)/60);
      const bg=r.ret>=0?"rgba(242,88,75,"+(.10+a*.55)+")":"rgba(77,163,224,"+(.10+a*.55)+")";
      h+='<td style="background:'+bg+'" title="'+y+'年'+m+'月 '+fmtPct(r.ret)+'">'
        +(r.ret>=0?"+":"")+r.ret.toFixed(0)+'</td>';
    }
    const tp=(tot-1)*100;
    h+='<td class="'+cls(tp)+'" style="font-weight:600">'+(tp>=0?"+":"")+tp.toFixed(0)+'</td></tr>';
  });
  h+="</tbody></table>";
  $("#heat").innerHTML='<p class="muted" style="margin-bottom:6px">年×月の騰落率（%）。「半減期から」は直近の半減期からの経過月数で、金色が濃いほど半減期に近い時期です（半減期：2012年11月・2016年7月・2020年5月・2024年4月）</p>'+h;
}

/* ── 上昇の順番 ── */
export async function renderRotation(){
  const syms=["BTC","ETH","XRP","BNB","SOL"];
  const wk={}, dy={};
  try{
    for(let i=0;i<syms.length;i++) wk[syms[i]]=await klines(syms[i],"1w",1000);
    for(let i=0;i<syms.length;i++) dy[syms[i]]=await klines(syms[i],"1d",1000);
  }catch(e){
    $("#rot-tbl").innerHTML="<tbody><tr><td>データを取得できませんでした。</td></tr></tbody>";
    return;
  }
  const btcW=wk.BTC, btcMap={}; btcW.forEach(k=>btcMap[k.t]=k);
  const results=[];
  syms.filter(s=>s!=="BTC").forEach(s=>{
    const a=wk[s], aMap={}; a.forEach(k=>aMap[k.t]=k);
    const times=btcW.map(k=>k.t).filter(t=>aMap[t]);
    let n=0, follow=0; const exc=[];
    for(let i=0;i<times.length-1;i++){
      const t=times[i], tn=times[i+1];
      if(!aMap[tn]||!btcMap[tn]) continue;
      const bRet=(btcMap[t].c/btcMap[t].o-1)*100;
      if(bRet<3) continue;
      const bNext=(btcMap[tn].c/btcMap[tn].o-1)*100;
      const aNext=(aMap[tn].c/aMap[tn].o-1)*100;
      n++; if(aNext>bNext) follow++;
      exc.push(aNext-bNext);
    }
    const bd=dy.BTC, ad=dy[s], bm={};
    bd.forEach(k=>bm[k.t]=k.c);
    const common=ad.filter(k=>bm[k.t]).map(k=>({t:k.t,a:k.c,b:bm[k.t]}));
    const rets=[];
    for(let i=1;i<common.length;i++)
      rets.push({a:Math.log(common[i].a/common[i-1].a),b:Math.log(common[i].b/common[i-1].b)});
    let bestK=0,bestR=-2;
    for(let k=0;k<=10;k++){
      const X=[],Y=[];
      for(let i=0;i+k<rets.length;i++){X.push(rets[i].b);Y.push(rets[i+k].a);}
      if(X.length<50) continue;
      const mx=mean(X),my=mean(Y);
      let sxy=0,sx=0,sy=0;
      for(let i=0;i<X.length;i++){const dx=X[i]-mx,dyy=Y[i]-my;sxy+=dx*dyy;sx+=dx*dx;sy+=dyy*dyy;}
      const r=sxy/Math.sqrt((sx*sy)||1);
      if(r>bestR){bestR=r;bestK=k;}
    }
    results.push({s:s,n:n,follow:follow,rate:n?follow/n*100:null,
      avg:exc.length?mean(exc):null,bestK:bestK,bestR:bestR});
  });

  let html='<thead><tr><th>銘柄</th><th>翌週にBTC超え</th><th>回数</th><th>平均超過リターン</th>'
    +'<th>最も連動する遅れ</th><th>相関</th></tr></thead><tbody>';
  results.forEach(r=>{
    const id=SYM2ID[r.s];
    html+='<tr><td><span style="color:'+COINS[id].color+'">■</span> '+COINS[id].ja+'（'+r.s+'）</td>'
      +'<td class="'+(r.rate>=50?"up":"down")+'">'+(r.rate==null?"—":r.rate.toFixed(0)+"%")+'</td>'
      +'<td>'+r.follow+'／'+r.n+'</td>'
      +'<td class="'+cls(r.avg)+'">'+(r.avg==null?"—":fmtPct(r.avg))+'</td>'
      +'<td>'+(r.bestK===0?"同日":r.bestK+"日遅れ")+'</td>'
      +'<td>'+r.bestR.toFixed(2)+'</td></tr>';
  });
  html+="</tbody>";
  $("#rot-tbl").innerHTML=html;

  const valid=results.filter(r=>r.rate!=null);
  if(!valid.length){ $("#rot-note").textContent="十分なサンプルが集まりませんでした。"; return; }
  const avgRate=mean(valid.map(r=>r.rate));
  const lead=valid.slice().sort((a,b)=>b.rate-a.rate)[0];
  $("#rot-note").textContent =
    "ビットコインが週足で+3%以上上昇した翌週、アルト4銘柄は平均"+avgRate.toFixed(0)
    +"%の確率でビットコインの騰落率を上回りました（最も高いのは"+COINS[SYM2ID[lead.s]].ja+"の"
    +lead.rate.toFixed(0)+"%）。「最も連動する遅れ」は日足の日次リターンで相関が最大になるずらし日数で、"
    +"0日なら同時、数日なら後追いの傾向を示します。いずれも各銘柄の上場以降の全データによる過去の集計で、"
    +"将来の順番を保証するものではありません。";
}
