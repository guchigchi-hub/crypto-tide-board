/* ── SVG描画（潮位計・カード・重ね合わせ・ローソク足・ドミナンス） ── */

import { CG, COINS, IDS, PERIODS, DOM_REF } from "./config.js";
import { getJSON, seriesFor, klines, sma } from "./data.js";
import { $, el, state, fmtPrice, fmtPct, cls, tone, fmtCap, fmtDate } from "./app.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (t,a)=>{const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);return n;};

/* ── 潮位計 ── */
export function renderTide(){
  const track=$("#tide");
  track.querySelectorAll(".pin").forEach(n=>n.remove());
  const pct=PERIODS[state.period].pct, btc=state.markets.bitcoin;
  const bp = btc?btc[pct]:null;
  if(bp==null){ $("#tide-note").textContent="ビットコインの騰落率を取得できませんでした。"; return; }
  const rows = IDS.map(id=>{
    const m=state.markets[id];
    return (m&&m[pct]!=null)?{id:id,rel:m[pct]-bp,abs:m[pct]}:null;
  }).filter(Boolean).sort((a,b)=>a.rel-b.rel);
  const max=Math.max(6,...rows.map(r=>Math.abs(r.rel)));
  const lanes=[];
  rows.forEach(r=>{
    const x=50+(r.rel/max)*44;
    let lane=0; while(lanes[lane]!=null&&Math.abs(lanes[lane]-x)<13) lane++;
    lanes[lane]=x;
    const meta=COINS[r.id], pin=el("div","pin");
    pin.style.color = r.id==="bitcoin"?"var(--btc)":meta.color;
    pin.style.left = x+"%";
    pin.style.top = (lane%2===0?50-14-lane*11:50+16+(lane-1)*11)+"%";
    pin.innerHTML = '<span class="tag">'+meta.sym+' <b>'+(r.rel>0?"+":"")+r.rel.toFixed(1)+'</b></span>'
      +'<span class="bead"></span><span class="tick"></span>';
    pin.title = meta.ja+"："+PERIODS[state.period].label+"で "+fmtPct(r.abs)
      +"（BTC比 "+(r.rel>0?"+":"")+r.rel.toFixed(1)+"pt）";
    track.appendChild(pin);
  });
  const others=rows.filter(r=>r.id!=="bitcoin");
  const ahead=others.filter(r=>r.rel>0).length;
  const lead=rows[rows.length-1], lag=rows[0];
  let s=PERIODS[state.period].label+"のビットコインは "+fmtPct(bp)+"。アルト"+others.length
    +"銘柄のうち"+ahead+"銘柄がビットコインを上回っています。";
  if(lead&&lead.id!=="bitcoin") s+="先行は"+COINS[lead.id].ja+"（BTC比 +"+lead.rel.toFixed(1)+"pt）、";
  if(lag&&lag.id!=="bitcoin") s+="出遅れは"+COINS[lag.id].ja+"（BTC比 "+lag.rel.toFixed(1)+"pt）です。";
  $("#tide-note").textContent=s;
}

/* ── カード ── */
function sparkPath(v,w,h){
  const lo=Math.min.apply(null,v),hi=Math.max.apply(null,v),sp=(hi-lo)||1;
  return v.map((x,i)=>(i?"L":"M")+((i/(v.length-1))*w).toFixed(2)+" "+(h-((x-lo)/sp)*h).toFixed(2)).join(" ");
}
export function renderCards(){
  const box=$("#cards"); box.innerHTML="";
  const pk=PERIODS[state.period].pct;
  IDS.slice().sort((a,b)=>((state.markets[b]||{}).market_cap||0)-((state.markets[a]||{}).market_cap||0))
  .forEach(id=>{
    const m=state.markets[id], meta=COINS[id], c=el("div","coin");
    c.style.color = id==="bitcoin"?"var(--btc)":meta.color;
    if(!m){
      c.innerHTML='<div class="rail"></div><div class="c-head"><span class="c-name">'+meta.ja
        +'</span><span class="c-sym">'+meta.sym+'</span></div><div class="c-price">—</div>';
      box.appendChild(c); return;
    }
    const chg=m[pk], s=seriesFor(id), vals=s?s.map(p=>p[1]):null;
    const spark = vals&&vals.length>1
      ? '<svg viewBox="0 0 200 44" preserveAspectRatio="none"><path d="'+sparkPath(vals,200,44)+'" stroke="'+tone(chg)+'"/></svg>' : "";
    c.innerHTML = '<div class="rail"></div>'
      +'<div class="c-head"><span class="c-name">'+meta.ja+'</span><span class="c-sym">'+meta.sym+'</span></div>'
      +'<div class="c-price">'+fmtPrice(m.current_price)+'</div>'
      +'<div class="c-delta '+cls(chg)+'">'+fmtPct(chg)+'　<span style="color:var(--ink-dim)">'
      +PERIODS[state.period].label+'</span></div>'
      +'<div class="c-spark">'+spark+'</div>'
      +'<div class="c-foot"><span>24h '+fmtPct(m.price_change_percentage_24h_in_currency)+'</span><span>'
      +fmtCap(m.market_cap)+'</span></div>';
    box.appendChild(c);
  });
}

/* ── 重ね合わせ ── */
export function renderOverlay(){
  const svg=$("#svg"), W=1000,H=300,P=8;
  const data=IDS.filter(id=>!state.hidden[id]).map(id=>({id:id,pts:seriesFor(id)})).filter(d=>d.pts&&d.pts.length>1);
  svg.innerHTML="";
  if(!data.length){$("#x0").textContent=$("#x1").textContent=$("#x2").textContent="";return;}
  const norm=data.map(d=>({id:d.id,v:d.pts.map(p=>[p[0],(p[1]/d.pts[0][1]-1)*100])}));
  let lo=Infinity,hi=-Infinity,t0=Infinity,t1=-Infinity;
  norm.forEach(s=>s.v.forEach(function(pt){
    const t=pt[0],y=pt[1];
    if(y<lo)lo=y; if(y>hi)hi=y; if(t<t0)t0=t; if(t>t1)t1=t;
  }));
  const sp=Math.max(hi-lo,1); lo-=sp*.12; hi+=sp*.12;
  const X=t=>P+(t-t0)/(t1-t0)*(W-P*2), Y=y=>P+(hi-y)/(hi-lo)*(H-P*2);
  const g=svgEl("g",{"class":"grid"});
  for(let i=0;i<=4;i++){
    const y=lo+(hi-lo)*i/4;
    g.appendChild(svgEl("line",{x1:0,x2:W,y1:Y(y),y2:Y(y)}));
    const t=svgEl("text",{"class":"ylab",x:4,y:Y(y)-4});
    t.textContent=(y>0?"+":"")+y.toFixed(0)+"%"; g.appendChild(t);
  }
  svg.appendChild(g);
  if(lo<0&&hi>0) svg.appendChild(svgEl("line",{"class":"zeroline",x1:0,x2:W,y1:Y(0),y2:Y(0)}));
  norm.forEach(s=>{
    const d=s.v.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(2)+" "+Y(p[1]).toFixed(2)).join(" ");
    svg.appendChild(svgEl("path",{"class":"series",d:d,
      stroke:s.id==="bitcoin"?"var(--btc)":COINS[s.id].color,
      "stroke-width":s.id==="bitcoin"?2.4:1.7}));
  });
  $("#x0").textContent=fmtDate(t0); $("#x1").textContent=fmtDate((t0+t1)/2); $("#x2").textContent=fmtDate(t1);
  hookOverlayHover(norm,t0,t1);
}
function hookOverlayHover(norm,t0,t1){
  const plot=$("#plot"),cross=$("#cross"),tip=$("#tip");
  plot.onpointerleave=function(){cross.style.display="none";tip.style.display="none";};
  plot.onpointermove=function(ev){
    const r=plot.getBoundingClientRect();
    const rel=Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width)), t=t0+rel*(t1-t0);
    cross.style.display="block"; cross.style.left=(rel*r.width)+"px";
    const rows=norm.map(s=>{
      let b=s.v[0],bd=Infinity;
      for(let i=0;i<s.v.length;i++){const d=Math.abs(s.v[i][0]-t);if(d<bd){bd=d;b=s.v[i];}}
      return {id:s.id,y:b[1],t:b[0]};
    }).sort((a,b)=>b.y-a.y);
    tip.innerHTML='<div class="t-date">'+fmtDate(rows[0]?rows[0].t:t)+'</div>'+rows.map(r=>{
      const c=r.id==="bitcoin"?"var(--btc)":COINS[r.id].color;
      return '<div class="t-row"><span style="color:'+c+'">'+COINS[r.id].sym+'</span><span class="'
        +cls(r.y)+'">'+fmtPct(r.y)+'</span></div>';
    }).join("");
    tip.style.display="block";
    tip.style.left=Math.min(r.width-tip.offsetWidth-4,Math.max(4,rel*r.width+12))+"px";
    tip.style.top="10px";
  };
}
export function renderLegend(){
  const box=$("#legend"); box.innerHTML="";
  IDS.forEach(id=>{
    const b=el("button","lg");
    b.setAttribute("aria-pressed",state.hidden[id]?"false":"true");
    b.style.color = id==="bitcoin"?"var(--btc)":COINS[id].color;
    b.innerHTML='<span class="sw"></span><span style="color:var(--ink)">'+COINS[id].sym+'</span>';
    b.onclick=function(){state.hidden[id]=!state.hidden[id];renderLegend();renderOverlay();};
    box.appendChild(b);
  });
}

/* ── ローソク足 ── */
export async function renderKline(){
  const svg=$("#ksvg"), W=1000,H=380, PT=10, PB=8, VOL=44;
  const sym=state.ksym, tf=state.ktf;
  svg.innerHTML=""; $("#kxaxis").innerHTML="";
  let all;
  try{ all = await klines(sym,tf,1000); }
  catch(e){
    $("#kstatus").innerHTML='<span class="badge">ローソク足データを取得できませんでした。時間をおいて「更新」を押してください。</span>';
    return;
  }
  if(!all||all.length<10) return;
  const ma25=sma(all,25,k=>k.c), ma75=sma(all,75,k=>k.c);
  const vma25=sma(all,25,k=>k.v);
  const n=Math.min(state.kzoom,all.length), i0=all.length-n;
  const view=all.slice(i0), m25=ma25.slice(i0), m75=ma75.slice(i0), vm25=vma25.slice(i0);
  const fx = state.cur==="jpy"?state.fx:1;

  let lo=Infinity,hi=-Infinity;
  view.forEach(k=>{if(k.l<lo)lo=k.l;if(k.h>hi)hi=k.h;});
  [m25,m75].forEach(a=>a.forEach(v=>{if(v!=null){if(v<lo)lo=v;if(v>hi)hi=v;}}));
  const pad=(hi-lo)*.06; lo-=pad; hi+=pad;
  const PH = H-PT-PB-VOL;
  const X=i=>4+(i+.5)/n*(W-8);
  const Y=p=>PT+(hi-p)/(hi-lo)*PH;
  let vmax=Math.max.apply(null,view.map(k=>k.v))||1;
  vm25.forEach(v=>{if(v!=null&&v>vmax)vmax=v;});
  const VBASE=H-PB, VY=v=>VBASE-(v/vmax)*VOL;

  const g=svgEl("g",{"class":"grid"});
  for(let i=0;i<=4;i++){
    const p=lo+(hi-lo)*i/4;
    g.appendChild(svgEl("line",{x1:0,x2:W,y1:Y(p),y2:Y(p)}));
    const t=svgEl("text",{"class":"ylab",x:4,y:Y(p)-4}); t.textContent=fmtPrice(p*fx); g.appendChild(t);
  }
  svg.appendChild(g);

  const bw=Math.max(1,(W-8)/n*.62);
  const vg=svgEl("g",{opacity:".35"});
  view.forEach((k,i)=>{
    vg.appendChild(svgEl("rect",{x:X(i)-bw/2,y:VY(k.v),width:bw,height:VBASE-VY(k.v),
      fill:k.c>=k.o?"var(--up)":"var(--down)"}));
  });
  svg.appendChild(vg);
  // 出来高の25本移動平均（既存の文字色を淡くして重ねる）
  {
    let vd="", vstarted=false;
    vm25.forEach((v,i)=>{ if(v==null)return; vd+=(vstarted?"L":"M")+X(i).toFixed(2)+" "+VY(v).toFixed(2)+" "; vstarted=true; });
    if(vd) svg.appendChild(svgEl("path",{"class":"series",d:vd,stroke:"var(--ink)",
      "stroke-width":1,opacity:".55"}));
  }

  if(state.ktype==="candle"){
    view.forEach((k,i)=>{
      const col=k.c>=k.o?"var(--up)":"var(--down)";
      svg.appendChild(svgEl("line",{x1:X(i),x2:X(i),y1:Y(k.h),y2:Y(k.l),stroke:col,
        "stroke-width":1,"vector-effect":"non-scaling-stroke"}));
      const top=Y(Math.max(k.o,k.c)), hh=Math.max(1,Math.abs(Y(k.o)-Y(k.c)));
      svg.appendChild(svgEl("rect",{x:X(i)-bw/2,y:top,width:bw,height:hh,fill:col}));
    });
  }else{
    const d=view.map((k,i)=>(i?"L":"M")+X(i).toFixed(2)+" "+Y(k.c).toFixed(2)).join(" ");
    svg.appendChild(svgEl("path",{"class":"series",d:d,stroke:"var(--ink)","stroke-width":1.8}));
  }
  [[m25,"var(--ma25)"],[m75,"var(--ma75)"]].forEach(pair=>{
    const a=pair[0], col=pair[1];
    let d="", started=false;
    a.forEach((v,i)=>{ if(v==null)return; d+=(started?"L":"M")+X(i).toFixed(2)+" "+Y(v).toFixed(2)+" "; started=true; });
    if(d) svg.appendChild(svgEl("path",{"class":"series",d:d,stroke:col,"stroke-width":1.5}));
  });

  const ax=$("#kxaxis");
  [0,Math.floor(n/2),n-1].forEach(i=>{
    const s=el("span"), d=new Date(view[i].t);
    s.textContent=d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate();
    ax.appendChild(s);
  });

  renderKStatus(all,ma25,ma75,tf);
  hookKHover(view,m25,m75,fx,X,n);
}

async function renderKStatus(all,ma25,ma75,tf){
  const box=$("#kstatus"); box.innerHTML="";
  const last=all.length-1;
  function badge(label,a,b,extra){
    const s=el("span","badge "+(a>b?"gc":"dc"));
    s.innerHTML="<b>"+label+"</b> 25"+(a>b?"＞":"＜")+"75 "+(a>b?"上向き":"下向き")+(extra||"");
    return s;
  }
  const curName = tf==="1d"?"日足":"週足";
  if(ma25[last]!=null&&ma75[last]!=null){
    const diff=(ma25[last]/ma75[last]-1)*100;
    box.appendChild(badge(curName,ma25[last],ma75[last],"（乖離 "+(diff>0?"+":"")+diff.toFixed(1)+"%）"));
  }
  const other = tf==="1d"?"1w":"1d";
  try{
    const o=await klines(state.ksym,other,1000);
    const a=sma(o,25,k=>k.c), b=sma(o,75,k=>k.c), L=o.length-1;
    if(a[L]!=null&&b[L]!=null) box.appendChild(badge(other==="1d"?"日足":"週足",a[L],b[L],""));
  }catch(e){}
  const p=el("span","badge");
  p.innerHTML="<b>"+state.ksym+"</b> 終値 "+fmtPrice(all[last].c*(state.cur==="jpy"?state.fx:1));
  box.appendChild(p);
  const l=el("span","badge");
  const unit = tf==="1w"?"週":"日";
  l.innerHTML='<span style="color:var(--ma25)">━</span> 25'+unit+'線　<span style="color:var(--ma75)">━</span> 75'+unit+'線　<span style="color:var(--ink);opacity:.55">━</span> 出来高25'+unit+'平均';
  box.appendChild(l);
}

function hookKHover(view,m25,m75,fx,X,n){
  const plot=$("#kplot"),cross=$("#kcross"),tip=$("#ktip");
  plot.onpointerleave=function(){cross.style.display="none";tip.style.display="none";};
  plot.onpointermove=function(ev){
    const r=plot.getBoundingClientRect();
    const rel=Math.min(.999,Math.max(0,(ev.clientX-r.left)/r.width));
    const i=Math.min(n-1,Math.floor(rel*n)), k=view[i];
    cross.style.display="block"; cross.style.left=(X(i)/1000*r.width)+"px";
    const d=new Date(k.t), ch=(k.c/k.o-1)*100;
    tip.innerHTML='<div class="t-date">'+d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()+'</div>'
      +'<div class="t-row"><span>始値</span><span>'+fmtPrice(k.o*fx)+'</span></div>'
      +'<div class="t-row"><span>高値</span><span>'+fmtPrice(k.h*fx)+'</span></div>'
      +'<div class="t-row"><span>安値</span><span>'+fmtPrice(k.l*fx)+'</span></div>'
      +'<div class="t-row"><span>終値</span><span class="'+cls(ch)+'">'+fmtPrice(k.c*fx)+'</span></div>'
      +(m25[i]!=null?'<div class="t-row"><span style="color:var(--ma25)">25</span><span>'+fmtPrice(m25[i]*fx)+'</span></div>':"")
      +(m75[i]!=null?'<div class="t-row"><span style="color:var(--ma75)">75</span><span>'+fmtPrice(m75[i]*fx)+'</span></div>':"");
    tip.style.display="block";
    tip.style.left=Math.min(r.width-tip.offsetWidth-4,Math.max(4,X(i)/1000*r.width+12))+"px";
    tip.style.top="10px";
  };
}

/* ── ドミナンス ── */
export async function renderDominance(){
  let live=null;
  try{
    const g=await getJSON(CG+"/global");
    const d=g.data;
    live = d.market_cap_percentage.btc;
    $("#dom-now").textContent=live.toFixed(1)+"%";
    $("#dom-now").style.color = live>=55?"var(--btc)":"var(--ma75)";
    $("#dom-eth").textContent=(d.market_cap_percentage.eth||0).toFixed(1)+"%";
    const totalUsd=d.total_market_cap.usd;
    $("#dom-cap").textContent = state.cur==="jpy"
      ? ((totalUsd*(state.fx||1))/1e12).toFixed(2)+"兆円" : "$"+(totalUsd/1e12).toFixed(2)+"T";
  }catch(e){ $("#dom-now").textContent="—"; }

  const pts=DOM_REF.map(function(r){
    const ym=r[0].split("-");
    return [Date.UTC(+ym[0],+ym[1]-1,1), r[1]];
  });
  if(live!=null) pts.push([Date.now(),live]);
  const svg=$("#dsvg"),W=1000,H=260,P=10;
  svg.innerHTML="";
  const t0=pts[0][0], t1=pts[pts.length-1][0], lo=30, hi=95;
  const X=t=>P+(t-t0)/(t1-t0)*(W-P*2), Y=v=>P+(hi-v)/(hi-lo)*(H-P*2);
  const g=svgEl("g",{"class":"grid"});
  [40,50,60,70,80,90].forEach(v=>{
    g.appendChild(svgEl("line",{x1:0,x2:W,y1:Y(v),y2:Y(v)}));
    const t=svgEl("text",{"class":"ylab",x:4,y:Y(v)-4}); t.textContent=v+"%"; g.appendChild(t);
  });
  svg.appendChild(g);
  svg.appendChild(svgEl("rect",{x:0,y:Y(50),width:W,height:Math.max(0,H-P-Y(50)),fill:"rgba(127,212,193,.07)"}));
  const lbl=svgEl("text",{"class":"ylab",x:W-4,y:Y(50)+14,"text-anchor":"end",fill:"#7FD4C1"});
  lbl.textContent="50%以下＝アルト優位の目安"; svg.appendChild(lbl);
  const d=pts.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(2)+" "+Y(p[1]).toFixed(2)).join(" ");
  svg.appendChild(svgEl("path",{"class":"series",d:d,stroke:"var(--btc)","stroke-width":2,
    "stroke-dasharray":"5 3",opacity:".85"}));
  if(live!=null){
    const last=pts[pts.length-1];
    svg.appendChild(svgEl("circle",{cx:X(last[0]),cy:Y(last[1]),r:4,fill:"var(--btc)"}));
  }
  const ax=$("#dxaxis"); ax.innerHTML="";
  [pts[0],pts[Math.floor(pts.length/2)],pts[pts.length-1]].forEach(p=>{
    const s=el("span"), dd=new Date(p[0]);
    s.textContent=dd.getFullYear()+"/"+(dd.getMonth()+1); ax.appendChild(s);
  });
}
