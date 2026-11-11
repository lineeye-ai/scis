/* 학교 주변 도움 기관 찾기 — 부산광역시서부교육지원청 (웹 배포판) */

const D = window.APP_DATA;
const CATS = [['wel','복지·가족'],['care','돌봄'],['mind','상담'],['safe','보호·안전'],['shelter','생활시설'],['med','의료·보건'],['youth','청소년·진로'],['edu','교육·학습']];
const CATL = Object.fromEntries(CATS);
const GUS = ['서구','중구','영도구','사하구'];
const GUVAR = {'서구':'--seo','중구':'--jg','영도구':'--yd','사하구':'--saha'};
const LV = {'초':'초등학교','중':'중학교','고':'고등학교','기':'교육지원청'};
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const pr = D.proj;
const P = (lon, lat) => [(lon - pr.minlon) * pr.k * pr.s, (pr.maxlat - lat) * pr.s];
const mPerUnit = 6371000 * Math.PI / 180 / pr.s; // metres per svg unit (north-south)

function dist(a, b){
  const R = 6371000, t = Math.PI/180;
  const dLa = (b.lat-a.lat)*t, dLo = (b.lon-a.lon)*t;
  const h = Math.sin(dLa/2)**2 + Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
const fmtD = m => m < 1000 ? `${Math.round(m/10)*10}m` : `${(m/1000).toFixed(1)}km`;
const walk = m => Math.max(1, Math.round(m*1.3/67));

const S = {school:null, r:1000, cats:new Set(CATS.map(c=>c[0])), gu:'전체', lv:'전체', sel:null, picking:false};
try{ const saved = JSON.parse(localStorage.getItem('swk-school-finder')||'null'); if(saved){ if([500, 1000, 2000].includes(saved.r)) S.r = saved.r; } }catch(e){}
const HOME = {name:'부산서부교육지원청', gu:'서구', lv:'기', lat:35.116866, lon:129.011733, home:true, addr:'서구 꽃마을로 33'};
S.school = HOME;
function save(){ try{ localStorage.setItem('swk-school-finder', JSON.stringify({r:S.r, school:S.school})); }catch(e){} }

$('#stRes').textContent = D.res.length;
$('#stSch').textContent = D.schools.length;
const SCHOOLS = [HOME, ...D.schools];

/* ---------- map ---------- */
const map = $('#map');
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); if(parent) parent.appendChild(e); return e; }
const defs = el('defs', {}, map);
defs.innerHTML = `
  <radialGradient id="ringG"><stop offset=".55" stop-color="var(--accent)" stop-opacity="0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".10"/></radialGradient>`;
const gBase = el('g', {}, map);
// base map: few, merged paths; stroke widths live on groups and follow the zoom (no non-scaling-stroke, which phones redraw slowly)
const SW = [];
const swG = (attrs, w, dash) => { const g = el('g', attrs, gBase); SW.push([g, w, dash]); return g; };
el('path', {d:D.nb, fill:'var(--nb)'}, swG({stroke:'var(--nb-line)'}, 1));
el('path', {d:D.land, fill:'none'}, swG({stroke:'var(--shade)', 'stroke-opacity':.16}, 5));
el('path', {d:D.land, fill:'var(--land)'}, gBase);
for(const g of GUS) el('path', {d:D.dongs.filter(d => d.gu === g).map(d => d.d).join(''), fill:`var(${GUVAR[g]})`, 'fill-opacity':.05}, gBase);
el('path', {d:D.dongs.map(d => d.d).join(''), fill:'none'}, swG({stroke:'var(--dong)'}, 1, [3, 3]));
el('path', {d:D.land, fill:'none'}, swG({stroke:'var(--coast)'}, 1));
el('path', {d:GUS.map(g => D.outlines[g]).join(''), fill:'none'}, swG({stroke:'var(--land)', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, 6));
const gOut = swG({fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, 2.6);
for(const g of GUS) el('path', {d:D.outlines[g], stroke:`var(${GUVAR[g]})`}, gOut);
const gDong = el('g', {fill:'var(--muted)', 'font-weight':600, stroke:'var(--land)', 'paint-order':'stroke', 'stroke-linejoin':'round'}, map), gGu = el('g', {'font-family':'var(--f-display)', opacity:.7, stroke:'var(--land)', 'paint-order':'stroke', 'stroke-linejoin':'round', 'letter-spacing':'.15em'}, map);
D.dongs.forEach(d => { const t = el('text', {x:d.c[0], y:d.c[1], 'text-anchor':'middle'}, gDong); t.textContent = d.nm; });
for(const g of GUS){ const c = D.gulabels[g]; const t = el('text', {x:c[0], y:c[1], 'text-anchor':'middle', fill:`var(${GUVAR[g]})`}, gGu); t.textContent = g; }
const gRing = el('g', {}, map), gPins = el('g', {}, map), gSchool = el('g', {}, map);

let vb = [0, 0, pr.w, pr.h], anim = null, vbNext = null, vbRaf = 0;
function setVB(v){ vb = v; vbNext = null; map.setAttribute('viewBox', v.map(n=>n.toFixed(2)).join(' ')); scaleMarks(); placeHalo(); }
/* pulse around the selected pin: an HTML layer animated by the compositor, so the map itself is not redrawn */
const haloEl = document.createElement('div'); haloEl.className = 'halo'; haloEl.hidden = true; map.parentNode.appendChild(haloEl);
let haloAt = null;
function placeHalo(){
  if(!haloAt) return; unitFast();
  const k = Math.min(mapW / vb[2], mapH / vb[3]);
  haloEl.style.left = `${(mapW - vb[2]*k)/2 + (haloAt[0] - vb[0])*k}px`; haloEl.style.top = `${(mapH - vb[3]*k)/2 + (haloAt[1] - vb[1])*k}px`;
}
function showHalo(r){
  if(!r || matchMedia('(prefers-reduced-motion: reduce)').matches){ haloAt = null; haloEl.hidden = true; return; }
  haloAt = P(r.lon, r.lat); haloEl.style.setProperty('--c', `var(--${r.cat})`);
  haloEl.hidden = true; requestAnimationFrame(() => { haloEl.hidden = !haloAt; placeHalo(); });
}
function setVBSoon(v){ vbNext = v; if(!vbRaf) vbRaf = requestAnimationFrame(() => { vbRaf = 0; if(vbNext) setVB(vbNext); }); }
function animTo(t){
  const reduce = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches;
  // keep aspect of the element
  const r = map.getBoundingClientRect(); const asp = r.width / Math.max(1, r.height);
  let [x, y, w, h] = t; const cx = x + w/2, cy = y + h/2;
  if(w/h < asp) w = h*asp; else h = w/asp;
  t = [cx - w/2, cy - h/2, w, h];
  if(reduce){ setVB(t); return; }
  cancelAnimationFrame(anim); const from = vb.slice(), t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0)/420), e = 1 - Math.pow(1-k, 3);
    setVB(from.map((f,i)=>f + (t[i]-f)*e)); if(k < 1) anim = requestAnimationFrame(step); };
  anim = requestAnimationFrame(step);
}
function fitRadius(){
  if(!S.school) return fitAll();
  const [x, y] = P(S.school.lon, S.school.lat); const ru = S.r / mPerUnit * 1.18;
  animTo([x - ru, y - ru, ru*2, ru*2]);
}
function fitAll(){ animTo([-10, -10, pr.w + 20, pr.h + 20]); }
function unit(){ return unitFast(); } // svg units per css px
let MK = null, mkU = 0, mapW = 0, mapH = 0;
function unitFast(){ if(!mapW){ const r = map.getBoundingClientRect(); mapW = r.width; mapH = r.height; } return vb[2] / Math.max(1, mapW); }
function scaleMarks(){
  const u = unitFast();
  if(MK && Math.abs(u - mkU) < 1e-9) return;
  if(!MK) MK = {pins:[...gPins.querySelectorAll('.pin')], sch:[...gSchool.querySelectorAll('.sch')], sw:[...gRing.querySelectorAll('[data-sw]')], dash:[...gRing.querySelectorAll('[data-dash]')], rt:[...gRing.querySelectorAll('text')]};
  mkU = u;
  SW.forEach(([g, w, dash]) => { g.setAttribute('stroke-width', w*u); if(dash) g.setAttribute('stroke-dasharray', dash.map(n => n*u).join(' ')); });
  MK.pins.forEach(p => p.firstChild.setAttribute('transform', `scale(${u * (p.classList.contains('hl') ? 1.55 : 1)})`));
  MK.sch.forEach(p => p.firstChild.setAttribute('transform', `scale(${u})`));
  const showDong = u < .7; gDong.style.display = showDong ? '' : 'none';
  if(showDong){ gDong.setAttribute('font-size', 12*u); gDong.setAttribute('stroke-width', 3.5*u); }
  gGu.setAttribute('font-size', 28*u); gGu.setAttribute('stroke-width', 5*u);
  MK.sw.forEach(c => c.setAttribute('stroke-width', c.dataset.sw*u));
  MK.dash.forEach(c => c.setAttribute('stroke-dasharray', c.dataset.dash.split(' ').map(n => n*u).join(' ')));
  MK.rt.forEach(t => { t.setAttribute('font-size', (t.dataset.fs||12)*u); t.setAttribute('stroke-width', 3.5*u); });
}
function zoom(f){ const [x,y,w,h] = vb; const cx = x+w/2, cy = y+h/2; animTo([cx - w*f/2, cy - h*f/2, w*f, h*f]); }
$('#zIn').onclick = () => zoom(.6); $('#zOut').onclick = () => zoom(1.6);
$('#fitBtn').onclick = fitRadius; $('#allBtn').onclick = fitAll;

/* drag to pan */
let drag = null;
map.addEventListener('pointerdown', e => { drag = {x:e.clientX, y:e.clientY, vb:vb.slice(), moved:false}; });
window.addEventListener('pointermove', e => { if(!drag) return; const u = unit(); const dx = (e.clientX-drag.x)*u, dy = (e.clientY-drag.y)*u;
  if(Math.abs(dx)+Math.abs(dy) > 3*u){ drag.moved = true; map.setPointerCapture?.(e.pointerId); }
  if(drag.moved){ cancelAnimationFrame(anim); setVBSoon([drag.vb[0]-dx, drag.vb[1]-dy, drag.vb[2], drag.vb[3]]); } });
window.addEventListener('pointerup', () => { setTimeout(()=>{ drag = null; }, 0); });
map.addEventListener('wheel', e => { e.preventDefault(); const r = map.getBoundingClientRect(); const f = e.deltaY > 0 ? 1.15 : 1/1.15; const v = vbNext || vb;
  const mx = v[0] + (e.clientX - r.left)/r.width*v[2], my = v[1] + (e.clientY - r.top)/r.height*v[3];
  cancelAnimationFrame(anim); setVBSoon([mx - (mx-v[0])*f, my - (my-v[1])*f, v[2]*f, v[3]*f]); }, {passive:false});
let DRINGS = null;
function dongAt(x, y){
  if(!DRINGS) DRINGS = D.dongs.map(d => d.d.split('M').filter(Boolean).map(r => r.replace(/Z/g, '').trim().split(/\s+/).map(p => p.split(',').map(Number))));
  const inRing = pts => { let c = false; for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const k = DRINGS.findIndex(rings => rings.reduce((c, r) => inRing(r) ? !c : c, false));
  return k >= 0 ? {dong: D.dongs[k].nm, gu: D.dongs[k].gu} : null;
}
map.addEventListener('click', e => {
  if(drag && drag.moved) return;
  if(S.sel){ S.sel = null; hideInfo(); document.querySelectorAll('.item.on').forEach(i => i.classList.remove('on')); drawMap(); return; }
  const r = map.getBoundingClientRect(); const x = vb[0] + (e.clientX - r.left)/r.width*vb[2], y = vb[1] + (e.clientY - r.top)/r.height*vb[3];
  const lon = x/(pr.k*pr.s) + pr.minlon, lat = pr.maxlat - y/pr.s;
  const where = dongAt(x, y);
  if(!S.school.custom) S.back = S.school;
  setSchool({name: where ? `${where.dong} 부근` : '지도에서 고른 지점', gu: where ? where.gu : '', lv:'', lat, lon, custom:true});
  toast(`이 지점 반경 ${fmtD(S.r)} 안 기관 ${current.length}곳`);
});
$('#backBtn').onclick = () => { if(S.back){ const b = S.back; S.back = null; setSchool(b); } };

/* ---------- controls ---------- */
function chips(host, values, key){
  host.innerHTML = '';
  ['전체', ...values].forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    b.textContent = key === 'lv' && v !== '전체' ? LV[v] : v; b.setAttribute('aria-pressed', S[key] === v);
    b.onclick = () => { S[key] = v; host.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b)); showOpts(true); $('#q').focus(); };
    host.appendChild(b); });
}
chips($('#guChips'), GUS, 'gu'); chips($('#lvChips'), ['초','중','고'], 'lv');

const q = $('#q'), opts = $('#opts'); let optSel = -1, optList = [];
function norm(s){ return s.replace(/\s/g,'').replace(/등학교$|학교$/,''); }
function showOpts(force){
  const t = norm(q.value);
  optList = SCHOOLS.filter(s => (S.gu === '전체' || s.gu === S.gu) && (S.lv === '전체' || s.lv === S.lv) && (!t || norm(s.name).includes(t) || s.name.includes(q.value.trim())));
  const rank = x => { if(!t) return 0; const n = norm(x.name); return n === t ? 0 : n.startsWith(t) ? 1 : 2; };
  optList.sort((a,b) => rank(a) - rank(b) || '기초중고'.indexOf(a.lv) - '기초중고'.indexOf(b.lv) || a.name.localeCompare(b.name, 'ko'));
  if(!force && !t){ opts.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  opts.innerHTML = optList.length ? '' : '<div class="opt" aria-disabled="true">맞는 학교가 없어요. 지도에서 위치를 골라 보세요.</div>';
  optList.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.setAttribute('role', 'option'); b.id = 'o' + i;
    b.innerHTML = `<span>${s.name}</span><small>${s.gu} · ${LV[s.lv]}</small>`; b.onmousedown = e => e.preventDefault(); b.onclick = () => { setSchool(s); };
    opts.appendChild(b); });
  optSel = -1; opts.hidden = false; q.setAttribute('aria-expanded', 'true');
}
q.addEventListener('input', () => showOpts(false));
q.addEventListener('focus', () => { showOpts(true); q.closest('.card').classList.add('searching'); });
document.addEventListener('pointerdown', e => { const c = q.closest('.card'); if(!c.contains(e.target)) c.classList.remove('searching'); });
q.addEventListener('blur', () => setTimeout(() => { opts.hidden = true; q.setAttribute('aria-expanded','false'); }, 120));
q.addEventListener('keydown', e => {
  const items = [...opts.querySelectorAll('.opt[role=option]')];
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); if(opts.hidden) showOpts(true);
    optSel = Math.max(0, Math.min(items.length-1, optSel + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((it,i) => it.classList.toggle('on', i === optSel)); items[optSel]?.scrollIntoView({block:'nearest'}); q.setAttribute('aria-activedescendant', items[optSel]?.id || ''); }
  else if(e.key === 'Enter'){ e.preventDefault(); const s = optList[optSel >= 0 ? optSel : 0]; if(s) setSchool(s); }
  else if(e.key === 'Escape'){ opts.hidden = true; }
});

$('#seg').querySelectorAll('button').forEach(b => b.onclick = () => { S.r = +b.dataset.r; save(); render(); fitRadius(); });

const catHost = $('#cats');
const icon = (cat, size=26) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="var(--${cat})"/><use href="#g-${cat}" x="0" y="0" width="32" height="32"/></svg>`;
CATS.forEach(([c, l]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cat'; b.dataset.c = c; b.setAttribute('aria-pressed', 'true');
  b.innerHTML = `${icon(c, 22)}<span>${l}</span><span class="n"></span>`;
  b.onclick = () => { const only = S.cats.size === 1 && S.cats.has(c); S.cats = new Set(only ? CATS.map(x => x[0]) : [c]); render(); }; catHost.appendChild(b); });
$('#allCats').onclick = () => { CATS.forEach(c => S.cats.add(c[0])); render(); };
$('#legend').innerHTML = CATS.map(([c,l]) => `<span>${icon(c,16)}${l}</span>`).join('') + `<span><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="2.5 2"/></svg>대략 위치</span>`;

function setSchool(s, keepView){
  if(!s.custom) S.back = null;
  S.school = s; S.sel = null; hideInfo(); q.value = s.custom ? '' : s.name; opts.hidden = true; q.closest('.card').classList.remove('searching'); save(); render(); if(!keepView) fitRadius();
}

/* ---------- render ---------- */
let current = [];
function render(){
  const sc = S.school;
  $('#seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.r === S.r));
  $('#pickName').textContent = sc.name;
  $('#backBtn').hidden = !(sc.custom && S.back);
  if(S.back) $('#backBtn').textContent = `← ${S.back.name} 기준으로 돌아가기`;
  $('#pickSub').textContent = sc.home ? `${sc.addr} · 교육지원청` : sc.custom ? `지도에서 고른 지점${sc.gu ? ' · ' + sc.gu : ''}` : `${sc.gu} · ${LV[sc.lv]}` + (sc.ap ? ' · 대략 위치' : '');
  const all = D.res.filter(r => !(sc.home && r.name === sc.name)).map(r => ({...r, m: dist(sc, r)})).sort((a,b) => a.m - b.m);
  const inR = all.filter(r => r.m <= S.r);
  catHost.querySelectorAll('.cat').forEach(b => { const c = b.dataset.c; b.setAttribute('aria-pressed', S.cats.has(c));
    b.querySelector('.n').textContent = inR.filter(r => r.cat === c).length; });
  current = inR.filter(r => S.cats.has(r.cat));
  $('#sumText').innerHTML = `<em class="snm">${sc.name}</em> <span class="srest">반경 ${fmtD(S.r)} 안에 기관 <em>${current.length}곳</em></span>`;

  const list = $('#list'); list.innerHTML = '';
  if(!current.length){
    const near = all.filter(r => S.cats.has(r.cat))[0];
    list.innerHTML = `<div class="empty">이 범위 안에는 기관이 없어요.${near ? `<br>가장 가까운 곳은 <b>${near.name}</b> (${fmtD(near.m)})이에요. 범위를 넓혀 보세요.` : ''}</div>`;
  }
  current.forEach(r => {
    const b = document.createElement('div'); b.className = 'item' + (isSel(r) ? ' on' : ''); b.tabIndex = 0; b.dataset.key = r.gu + r.no;
    b.setAttribute('role', 'button'); b.setAttribute('aria-label', `${r.name}, ${fmtD(r.m)}`);
    b.innerHTML = `${icon(r.cat, 30)}
      <div class="t">${r.name}<span class="gu" style="background:var(${GUVAR[r.gu]})">${r.gu} ${r.no}</span></div>
      <div class="dist">${fmtD(r.m)}<small>도보 약 ${walk(r.m)}분</small><span class="avail" data-k="${ikey(r)}" hidden></span></div>
      <div class="d">${CATL[r.cat]} · ${r.desc}</div>
      <div class="meta">
        <span class="addr">${r.addr}</span>${r.ap ? '<span class="tag" style="color:var(--muted)">대략 위치</span>' : ''}</div>`;
    b.onclick = e => { if(e.target.closest('.copy, .call')) return; select(r, false); };
    b.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(r, false); } };
    list.appendChild(b);
  });
  fillSeatChips();
  if(S.sel && !current.some(isSel)){ S.sel = null; hideInfo(); }
  else if(S.sel && !P2.editing){ showInfo(current.find(isSel)); }
  drawMap();
}
const keyOf = r => r.gu + r.no;
const isSel = r => S.sel && keyOf(r) === S.sel;
function drawMap(){
  const sc = S.school; const [sx, sy] = P(sc.lon, sc.lat);
  gRing.innerHTML = ''; gPins.innerHTML = ''; gSchool.innerHTML = ''; MK = null;
  const ru = S.r / mPerUnit;
  el('circle', {cx:sx, cy:sy, r:ru, fill:'url(#ringG)'}, gRing);
  el('circle', {cx:sx, cy:sy, r:ru, fill:'none', stroke:'var(--accent)', 'data-sw':2, 'data-dash':'8 6'}, gRing);
  if(S.r > 500){ for(let m = 500; m < S.r; m += (S.r > 2000 ? 1000 : 500)){ el('circle', {cx:sx, cy:sy, r:m/mPerUnit, fill:'none', stroke:'var(--accent)', 'stroke-opacity':.4, 'data-sw':1}, gRing);
    const t = el('text', {x:sx, y:sy - m/mPerUnit, dy:'-.35em', 'text-anchor':'middle', fill:'var(--accent)', stroke:'var(--land)', 'paint-order':'stroke', 'font-weight':700}, gRing); t.textContent = fmtD(m); } }
  const t = el('text', {x:sx, y:sy - ru, dy:'-.35em', 'text-anchor':'middle', fill:'var(--accent)', stroke:'var(--land)', 'paint-order':'stroke', 'font-weight':700}, gRing); t.textContent = fmtD(S.r);
  const sel = current.find(isSel);
  if(sel){ // school → selected link
    const [x, y] = P(sel.lon, sel.lat);
    el('line', {x1:sx, y1:sy, x2:x, y2:y, stroke:`var(--${sel.cat})`, 'data-sw':3, 'data-dash':'2 6', 'stroke-linecap':'round'}, gRing);
    const ml = el('text', {x:sx+(x-sx)*.62, y:sy+(y-sy)*.62 - 10*unit(), dy:'.35em', 'text-anchor':'middle', fill:`var(--${sel.cat})`, stroke:'var(--land)', 'paint-order':'stroke', 'font-weight':800, 'data-fs':14}, gRing); ml.textContent = fmtD(sel.m);
  }
  // pins: far ones first so near ones sit on top; the selected one last
  const order = [...current].reverse().filter(r => !isSel(r)); if(sel) order.push(sel);
  order.forEach(r => {
    const [x, y] = P(r.lon, r.lat); const on = isSel(r);
    const g = el('g', {class:'pin' + (on ? ' hl' : ''), transform:`translate(${x},${y})`, opacity: sel && !on ? .38 : 1}, gPins);
    const inner = el('g', {}, g);
    el('ellipse', {cx:0, cy:0, rx:5, ry:2, fill:'#000', opacity:.22}, inner);
    el('path', {d:'M0 0 C-4 -6 -12 -11 -12 -20 A12 12 0 1 1 12 -20 C12 -11 4 -6 0 0Z', fill:`var(--${r.cat})`, stroke:'#fff', 'stroke-width':2, ...(r.ap ? {'stroke-dasharray':'4 2.5'} : {})}, inner);
    el('use', {href:`#g-${r.cat}`, x:-11, y:-31, width:22, height:22}, inner);
    if(on){ // name callout above the pin (scaled with pin: 1.55x, so sizes are divided)
      const k = 1/1.55, fs = 14*k, w = (r.name.length*14 + 26)*k, h = 26*k, yy = -40 - h - 4*k;
      el('rect', {x:-w/2, y:yy, width:w, height:h, rx:h/2, fill:`var(--${r.cat})`, stroke:'#fff', 'stroke-width':2*k}, inner);
      el('path', {d:`M${-5*k} ${yy+h-0.5} L0 ${yy+h+6*k} L${5*k} ${yy+h-0.5}Z`, fill:`var(--${r.cat})`}, inner);
      const lb = el('text', {x:0, y:yy + h/2, dy:'.36em', 'text-anchor':'middle', 'font-size':fs, 'font-weight':700, fill:'#fff', 'font-family':'var(--f-body)'}, inner); lb.textContent = r.name;
    }
    const tt = el('title', {}, g); tt.textContent = `${r.name} · ${fmtD(r.m)}`;
    g.addEventListener('click', e => { if(drag && drag.moved) return; e.stopPropagation(); select(r, true); });
  });
  showHalo(sel);
  if(sel) map.insertBefore(gSchool, gPins); else map.appendChild(gSchool);
  const sg = el('g', {class:'sch', transform:`translate(${sx},${sy})`, opacity: sel ? .38 : 1}, gSchool); const si = el('g', {}, sg);
  if(sc.custom){
    el('circle', {r:15, fill:'var(--focus)', 'fill-opacity':.25, stroke:'var(--focus)', 'stroke-width':2.5}, si);
    el('circle', {r:6, fill:'var(--focus)', stroke:'#fff', 'stroke-width':2.5}, si);
    el('path', {d:'M0 -24 V-16 M0 16 V24 M-24 0 H-16 M16 0 H24', stroke:'var(--focus)', 'stroke-width':2.5, 'stroke-linecap':'round'}, si);
  } else {
  el('circle', {r:17, fill:'var(--accent)', stroke:'#fff', 'stroke-width':3}, si);
  el('use', {href:'#g-school', x:-14, y:-14, width:28, height:28}, si);
  }
  const sl = el('text', {class:'lab', y:33, 'text-anchor':'middle', 'font-size':13.5, 'font-weight':700, fill:'var(--ink)', stroke:'var(--land)', 'stroke-width':4, 'paint-order':'stroke'}, si); sl.textContent = sc.name;
  scaleMarks();
}
function ensureVisible(r){
  const [x, y] = P(r.lon, r.lat); const u = unit();
  const pad = 60*u, top = 110*u, bottom = (innerWidth > 900 ? 40 : 40)*u, left = (innerWidth > 900 ? 380 : 20)*u;
  const inside = x > vb[0]+left && x < vb[0]+vb[2]-pad && y > vb[1]+top && y < vb[1]+vb[3]-bottom;
  if(!inside){ const [sx, sy] = P(S.school.lon, S.school.lat);
    const cx = innerWidth > 900 ? x - (left - pad)/2 : x; animTo([cx - vb[2]/2, y - vb[3]/2 + 40*u, vb[2], vb[3]]); }
}
function ensureVisibleSheet(r, mapTop){
  const [x, y] = P(r.lon, r.lat); const u = unit(); unitFast();
  const sheet = info.hidden ? 0 : info.getBoundingClientRect().height;
  const lo = Math.max(0, -mapTop), hi = Math.min(mapH, innerHeight - sheet - mapTop);
  if(hi - lo < 90) return ensureVisible(r);
  const target = lo + (hi - lo) * 0.62; // a little below the middle, leaving room for the name tag above the pin
  animTo([x - vb[2]/2, y - target*u, vb[2], vb[3]]);
}
function select(r, fromMap){
  S.sel = isSel(r) ? null : keyOf(r);
  document.querySelectorAll('.item').forEach(i => i.classList.toggle('on', i.dataset.key === S.sel));
  drawMap();
  if(!S.sel){ hideInfo(); return; }
  showInfo(r);
  if(innerWidth <= 900){
    // phones: map mode — the map is pinned to the top of the screen, the sheet sits under it
    mapMode(true);
    ensureVisibleSheet(r, map.getBoundingClientRect().top);
  } else {
    ensureVisible(r);
    if(fromMap){ const it = document.querySelector(`.item[data-key="${keyOf(r)}"]`); it?.scrollIntoView({behavior:'smooth', block:'nearest'}); }
  }
}

/* ---------- info popup ---------- */
const CATINFO = {
  wel:'가정의 경제·돌봄·관계 문제를 함께 살피고 공공·민간 복지 서비스로 이어 주는 기관',
  care:'방과 후나 방학에 아이를 안전하게 돌보며 급식·학습·놀이를 지원하는 기관',
  mind:'학생과 가족의 마음 건강, 위기 상황을 상담하고 치료 기관으로 연계하는 기관',
  safe:'학대·폭력·범죄로부터 아동을 보호하고 신고·수사·보호 조치를 맡는 기관',
  shelter:'가정에서 생활하기 어려운 아동이나 모자가정에 생활 공간과 자립을 지원하는 시설',
  med:'진료와 함께 건강검진·예방접종, 의료비 지원 연계를 돕는 의료·보건 기관',
  youth:'진로 탐색과 체험, 동아리·수련 활동으로 청소년 성장을 돕는 기관',
  edu:'독서·학습 공간과 교육 지원 서비스를 제공하는 기관'};
const SUP = [
  [/희망복지/, [["통합사례관리", "위기 가정을 방문해 아이와 가족에게 필요한 지원을 계획하고 1년 가까이 함께 관리", "부모"], ["긴급복지지원 신청", "갑작스러운 실직·질병 등으로 생계·의료·주거비가 급할 때 신청 연결", "부모"], ["복지 사각지대 가정 방문 상담", "도움이 필요한 학생 가정을 찾아가 받을 수 있는 복지 혜택 안내", "부모"]], "가정에 경제적 위기나 여러 문제가 겹쳐 있을 때"],
  [/드림스타트/, [["아동 발달·심리 검사와 치료 연계", "정서·행동, 언어 발달이 걱정되는 초등학생 검사와 놀이·미술치료 연계", "학생"], ["기초학습 지원", "방문 학습지·학습 멘토링으로 기초 학력 보충", "학생"], ["건강검진·치과 치료비 지원", "건강검진과 치과 등 의료비 지원 연계", "학생"], ["부모 양육 코칭", "가정 방문 양육 상담과 부모 교육", "부모"]], "만 12세 이하(초등학생까지) 취약계층 아동에게 통합 지원이 필요할 때"],
  [/가족센터/, [["다문화가족 자녀 언어발달 지원", "만 12세 이하 자녀 언어 평가와 1:1 언어 교육", "학생"], ["이중언어 가족환경 조성", "부모 나라 말을 자녀와 함께 배우는 가족 프로그램", "학생·부모"], ["부모교육·가족상담", "자녀 연령별 부모 교육, 부모-자녀 갈등 상담", "부모"], ["아이돌봄 서비스", "만 12세 이하 아동 집으로 돌보미 파견(유료·소득별 지원)", "부모"]], "다문화·한부모 가정이거나 가족 관계에 도움이 필요할 때"],
  [/장애인/, [["발달재활서비스", "언어·놀이·미술·감각 치료(만 18세 미만, 바우처 사용)", "학생"], ["장애학생 방과후 활동", "방과 후 사회성·여가 프로그램", "학생"], ["부모 상담·자조 모임", "장애 자녀 양육 상담과 부모 모임", "부모"]], "장애가 있거나 발달이 늦은 학생에게 치료·활동 지원이 필요할 때"],
  [/사회복지관/, [["방과후 공부방·학습 교실", "초·중학생 숙제 지도와 기초 학습 보충", "학생"], ["결연 후원", "정기 후원금, 학용품·교복 등 물품 지원 연결", "학생·부모"], ["식품·밑반찬 지원", "끼니 해결이 어려운 가정에 반찬·식품 전달", "부모"], ["가족 캠프·체험 활동", "주말·방학 가족 나들이와 체험 프로그램", "학생·부모"]], "생활이 어려운 가정에 학습·물품·가족 지원이 함께 필요할 때"],
  [/지역아동센터/, [["방과후 돌봄", "학교 끝난 뒤 저녁까지 보호와 생활 지도(18세 미만, 소득 기준 우선)", "학생"], ["저녁 급식", "방과 후 따뜻한 저녁 식사 제공", "학생"], ["숙제·기초학습 지도", "학교 숙제와 국어·수학 기초 학습 지도", "학생"], ["방학 종일 돌봄·체험 학습", "방학 중 종일 돌봄과 문화·체험 나들이", "학생"]], "방과 후 혼자 지내는 시간이 길거나 저녁을 거르는 학생일 때"],
  [/다함께돌봄|아이자람터/, [["상시 돌봄", "학기 중 방과 후 초등학생 정기 돌봄(월 단위 신청)", "학생"], ["일시 돌봄", "부모가 급한 일이 있을 때 하루 단위로 맡기는 돌봄", "부모"], ["놀이·숙제 지도와 간식", "보드게임·독서·숙제 지도, 간식 제공", "학생"], ["방학 돌봄", "방학 중 오전부터 운영하는 돌봄", "학생"]], "맞벌이 등으로 초등학생(6~12세) 방과 후 돌봄이 필요할 때"],
  [/청소년상담복지/, [["개인 상담·심리검사", "초등 고학년부터 중학생까지 고민·정서 문제 상담과 심리검사", "학생"], ["청소년안전망 위기 지원", "가출·자해·학대 등 위기 학생 사례관리와 긴급 지원", "학생"], ["학교폭력 상담", "피해·관련 학생 상담과 회복 지원", "학생"], ["부모 상담·부모 교육", "자녀 문제로 고민하는 부모 상담", "부모"]], "학생의 정서·행동 문제나 위기 상황에 상담이 필요할 때"],
  [/정신건강/, [["아동·청소년 마음건강 검사", "우울·불안·ADHD 등 선별 검사", "학생"], ["마음건강 상담", "정신건강 전문요원과 개별 상담", "학생·부모"], ["자해·자살 위기 개입", "위기 학생 긴급 상담과 사후 관리(위기 상담 ☎1577-0199)", "학생"], ["치료 기관 연계", "병원 진료가 필요할 때 연결과 치료비 지원 안내", "부모"]], "우울·불안·자해 등 정신건강 위기가 의심될 때"],
  [/가정폭력/, [["피해 아동·부모 상담", "가정폭력을 겪은 학생과 부모 개별 상담", "학생·부모"], ["보호시설 입소 연계", "안전한 곳이 필요할 때 보호시설 연결", "부모"], ["무료 법률·의료 지원 연계", "고소·이혼 등 법률 지원과 치료 연결", "부모"], ["아동 심리치료 연계", "충격을 받은 자녀의 놀이·미술 치료 연결", "학생"]], "가정폭력이 의심되거나 피해 가족에게 도움이 필요할 때"],
  [/여성인권|살림/, [["성 착취 피해 청소년 상담", "온라인 그루밍·성매매 피해 학생 상담과 보호", "학생"], ["찾아가는 예방 교육", "학교로 찾아가는 청소년 성 착취·성매매 예방 교육", "학생"], ["의료·법률 지원", "치료비와 법률 지원 연결", "학생·부모"]], "온라인 그루밍 등 성 착취 피해가 의심될 때"],
  [/아동보호/, [["학대 피해 아동 심리 치료", "심리검사와 놀이·미술 치료", "학생"], ["일시 보호", "학대 피해 아동의 긴급한 보호", "학생"], ["부모 교육·가족 회복 프로그램", "양육 방법 교육과 가족 관계 회복 지원", "부모"]], "아동학대가 의심될 때(신고는 ☎112)"],
  [/경찰서/, [["학교전담경찰관(SPO) 상담", "학교폭력·사이버폭력 피해 학생 상담과 조치", "학생"], ["실종 예방 사전등록", "지문·사진을 미리 등록하는 18세 미만 실종 예방 제도", "부모"]], "학교폭력·범죄 피해나 실종 등 긴급 상황일 때"],
  [/보건소/, [["초·중학생 국가예방접종", "초6·중1 시기 HPV·Tdap 등 무료 접종", "학생"], ["구강 관리", "불소 도포 등 아동 구강 관리", "학생"], ["아동 비만·영양 교실", "건강한 식습관과 운동 프로그램", "학생"], ["청소년 금연 클리닉", "흡연 학생 금연 상담과 보조제 지원", "학생"]], "학생 건강 관리·예방접종·건강 습관 지원이 필요할 때"],
  [/병원/, [["의료사회복지사 상담", "진료비가 부담될 때 후원·지원 제도 연결", "부모"], ["소아청소년 진료", "어린이·청소년 진료(진료과는 병원별 확인)", "학생"]], "치료가 필요한데 의료비 부담이 클 때"],
  [/진로교육/, [["진로 검사·진로 상담", "흥미·적성 검사와 1:1 진로 상담", "학생"], ["직업 체험 연계", "중학교 자유학기 진로 체험처 연결", "학생"], ["진로 캠프", "방학 중 진로 탐색 캠프", "학생"], ["학부모 진로 교육", "자녀 진로 지도를 위한 부모 교육", "부모"]], "학생의 진로 탐색과 직업 체험이 필요할 때"],
  [/야영장/, [["야영·수련 캠프", "학교·단체 야영과 수련 활동", "학생"], ["숲 체험·자연 탐방", "구덕산 숲에서 하는 체험 프로그램", "학생"]], "학교 밖 체험 활동이 필요할 때"],
  [/수련관|문화의집/, [["청소년방과후아카데미", "초4~중3 대상 방과 후 학습·체험·저녁 급식(운영 여부 확인)", "학생"], ["청소년 동아리 활동", "댄스·밴드·미디어 등 동아리", "학생"], ["주말·방학 체험 프로그램", "과학·문화·캠프 등 체험 활동", "학생"], ["청소년운영위원회", "청소년이 직접 시설 운영에 참여하는 활동", "학생"]], "방과 후 건강한 여가와 활동 공간이 필요할 때"],
  [/도서관/, [["방학 독서교실", "초·중학생 대상 방학 중 독서 프로그램", "학생"], ["어린이·청소년 독서 프로그램", "책 읽기·글쓰기·북토크", "학생"], ["부모 독서 교육", "자녀 독서 지도를 위한 부모 강좌", "부모"]], "방과 후 머물며 공부할 곳이나 독서 활동이 필요할 때"],
  [/교육지원청/, [["Wee센터 상담·심리검사", "학교에서 의뢰한 학생 전문 상담과 심리검사", "학생"], ["학습종합클리닉", "난독·경계선 지능 등 학습이 어려운 학생 진단과 지원", "학생"], ["특수교육지원센터", "장애 진단·평가와 치료 지원", "학생"], ["학부모 상담", "자녀 학교생활 고민 상담", "부모"]], "학교 안에서 해결하기 어려운 사례를 함께 의논할 때"],
  [/모자원|모성|한나빌리지/, [["모자가정 입소 보호", "18세 미만 자녀를 둔 한부모·미혼모 가정 주거 지원", "부모"], ["자녀 학습·방과후 지원", "입소 가정 자녀 학습 지도와 돌봄", "학생"], ["자립·양육 상담", "취업 준비와 양육 상담", "부모"]], "한부모·미혼모 가정에 주거와 양육 지원이 필요할 때(입소는 구청 상담)"],
  [/그룹홈|공동생활|우리집/, [["가정형 소규모 보호", "보호가 필요한 아동이 가정 같은 환경에서 생활", "학생"], ["생활·학습 지도", "일상생활과 학교 공부 지원", "학생"]], "가정에서 지내기 어려운 아동일 때(입소는 구청 아동보호전담요원 결정)"],
  [/.*/, [["보호 아동 입소", "가정에서 지내기 어려운 아동의 생활 보호", "학생"], ["생활·학습 지도", "일상생활과 학교 공부, 방과후 지원", "학생"], ["자립 준비 프로그램", "중학생부터 시작하는 자립 체험과 진로 지원", "학생"]], "가정에서 지내기 어려운 아동일 때(입소는 구청 아동보호전담요원 결정)"]
];
const info = $('#info');
function showInfo(r){
  if(P2.editing && P2.editing !== ikey(r)) P2.editing = null;
  const [, items, when] = SUP.find(([re]) => re.test(r.name + ' ' + r.desc));
  const tel = r.ph && r.ph !== '-' ? r.ph : '';
  info.style.setProperty('--c', `var(--${r.cat})`);
  info.innerHTML = `<div class="ihead">
    <button class="grab" type="button" aria-label="안내 창 크게 보기"><span></span></button>
    <div class="ib">
      ${icon(r.cat, 34)}
      <div style="min-width:0;flex:1">
        <div class="ic-cat">${CATL[r.cat]}<span class="gu" style="background:var(${GUVAR[r.gu]})">${r.gu} ${r.no}</span></div>
        <h3 id="infoTitle">${r.name}</h3>
        <div class="idist"><b>${fmtD(r.m)}</b> · 도보 약 ${walk(r.m)}분 · ${S.school.name}에서</div>
      </div>
      <button class="ix" type="button" aria-label="닫기">✕</button>
    </div>
    <div class="iact">${tel ? `<a class="call big" href="tel:${tel.replace(/[^0-9]/g,'')}" target="_top" aria-label="${r.name}에 전화 걸기 ${tel}"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>${tel}</a><button class="copy" type="button">번호 복사</button>` : '<span class="addr">전화번호 없음</span>'}</div></div><div class="ibody">
    <p class="iwhat">${CATINFO[r.cat]}</p>
    <div class="prog" id="prog">${progHTML(r, items)}</div>
    <div class="iwhen"><b>이럴 때 연계해요</b> ${when}</div>
    <div class="iaddr">${r.addr}${r.ap ? ' <span class="tag">대략 위치</span>' : ''}</div>
    </div>`;
  info.classList.toggle('full', P2.editing === ikey(r)); info.hidden = false; P2.shown = r; P2.items = items; bindProg(); bindSheet();
  info.querySelector('.ix').onclick = () => { S.sel = null; hideInfo(); document.querySelectorAll('.item.on').forEach(i => i.classList.remove('on')); drawMap(); };
  const cp = info.querySelector('.copy'); if(cp) cp.onclick = () => copy(tel, `${tel} 복사했어요`);
}

/* ---------- program seats (saved in the page itself) ---------- */
const GUK = {'서구':'seo','중구':'jg','영도구':'yd','사하구':'saha'};
const ikey = r => `${GUK[r.gu]}-${r.no}`;
const SEATS = {};
const PROGS = D.progs || {};
const PROGS_DATE = D.progsDate || '';
const progBase = (r, items) => { const pg = PROGS[ikey(r)]; return pg ? pg.items.map(([n, d, w]) => ({name:n, desc:d, who:w, to:null, cur:null})) : items.map(([n, d, w]) => ({name:n, desc:d, who:w, to:null, cur:null})); };
const P2 = {state:'ready', data:SEATS, sb:null, email:'', assigned:new Set(), isAdmin:false, editing:null, draft:null, shown:null, items:null, saving:false, msg:''};
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function seatOf(it){
  const to = Number.isFinite(it.to) ? it.to : null, cur = Number.isFinite(it.cur) ? it.cur : null;
  if(to === null) return null;
  const left = Math.max(0, to - (cur || 0));
  return {to, cur: cur || 0, left, cls: left === 0 ? 'full' : left <= 2 ? 'few' : 'ok'};
}
function progHTML(r, items){
  const rec = P2.data[ikey(r)];
  const base = progBase(r, items); const pg = PROGS[ikey(r)];
  if(P2.editing === ikey(r)) return editHTML();
  const list = rec?.items?.length ? rec.items : base;
  const head = `<div class="ih">초·중학생과 부모가 받을 수 있는 프로그램${canEditInst(r) ? '<button class="pedit" type="button" id="pEdit">정원·참여 입력</button>' : ''}</div>`;
  const lis = list.map(it => {
    const st = seatOf(it);
    let seat = '';
    if(st) seat = `<span class="seat ${st.cls}"><span>정원 ${st.to}</span><span>참여 ${st.cur}</span><b>${st.left ? `참가 가능 ${st.left}명` : '마감'}</b></span>`;
    return `<li><div class="prow"><div class="pname"><b>${esc(it.name)}</b>${it.who ? `<span class="who">${esc(it.who)}</span>` : ''}</div>${seat}</div>${it.desc ? `<span class="pd">${esc(it.desc)}</span>` : ''}</li>`;
  }).join('');
  const upd = rec?.updatedAt ? `<div class="inote">정원·참여 현황 갱신: ${new Date(rec.updatedAt).toLocaleDateString('ko-KR', {month:'long', day:'numeric'})}</div>` : '';
  const srcs = pg ? [pg.src, pg.src2].filter(Boolean) : [];
  const srcLinks = srcs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">출처${srcs.length > 1 ? ' ' + (i + 1) : ''}</a>`).join(' · ');
  const foot = rec?.items?.length ? '' : pg ? `<div class="inote">기관 홈페이지·구청·언론 보도 등 공개 정보로 확인한 프로그램이에요(${PROGS_DATE} 확인) · ${srcLinks}. 운영 기간과 모집 여부는 연계 전에 기관에 확인하세요.</div>` : '<div class="inote">대표 프로그램이에요. 공개된 기관 정보를 찾지 못해 같은 종류 기관의 일반적인 프로그램을 보여 줘요. 연계 전에 기관에 확인하세요.</div>';
  const ginfo = /청소년상담복지/.test(r.name) ? [['긴급 상담', '청소년전화 1388(24시간, 문자·카카오톡 가능)']] : /경찰서/.test(r.name) ? [['신고', '학교폭력 117(문자 #0117), 범죄·아동학대 112']] : /정신건강/.test(r.name) ? [['위기 상담', '정신건강 위기상담 1577-0199(24시간)']] : [];
  const infoList = [...(pg?.info || []), ...ginfo];
  const info = infoList.length ? `<div class="iinfo"><b>이용 안내</b>${infoList.map(([l, t]) => `<div><span>${esc(l)}</span>${esc(t)}</div>`).join('')}</div>` : '';
  return head + `<ul class="iul">${lis}</ul>` + info + upd + foot;
}
function editHTML(){
  const rows = P2.draft.map((it, i) => `
    <div class="erow" data-i="${i}">
      <input class="en" id="en${i}" value="${esc(it.name)}" placeholder="프로그램 이름" aria-label="프로그램 이름">
      <label>정원<input class="et" id="et${i}" type="number" inputmode="numeric" min="0" value="${it.to ?? ''}"></label>
      <label>참여<input class="ec" id="ec${i}" type="number" inputmode="numeric" min="0" value="${it.cur ?? ''}"></label>
      <button class="edel" type="button" aria-label="이 프로그램 삭제">삭제</button>
      <input class="ed" id="ed${i}" value="${esc(it.desc)}" placeholder="설명 (선택)" aria-label="설명">
    </div>`).join('');
  return `<div class="ih">정원·참여 학생 수 입력</div>
    <div class="pstate">학생 이름 같은 개인정보는 넣지 마세요. 숫자만 저장돼요.</div>
    <div class="elist">${rows}</div>
    <button class="linkbtn" type="button" id="pAdd">+ 프로그램 추가</button>
    ${P2.msg ? `<div class="emsg">${esc(P2.msg)}</div>` : ''}
    <div class="iact"><button class="call" type="button" id="pSave" ${P2.saving ? 'disabled' : ''}>${P2.saving ? '저장 중…' : '저장'}</button><button class="copy" type="button" id="pCancel">취소</button></div>`;
}
function readDraft(){
  P2.draft = [...document.querySelectorAll('#prog .erow')].map(row => {
    const i = row.dataset.i, num = id => { const v = document.getElementById(id).value.trim(); if(v === '') return null; const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
    return {...P2.draft[i], name: document.getElementById('en'+i).value.trim(), desc: document.getElementById('ed'+i).value.trim(), to: num('et'+i), cur: num('ec'+i)};
  });
}
function paintProg(){ const host = document.getElementById('prog'); if(host && P2.shown){ host.innerHTML = progHTML(P2.shown, P2.items); bindProg(); } }
function bindProg(){
  const r = P2.shown; if(!r) return;
  const ed = document.getElementById('pEdit');
  if(ed) ed.onclick = () => {
    const rec = P2.data[ikey(r)];
    P2.draft = (rec?.items?.length ? rec.items : progBase(r, P2.items)).map(it => ({...it}));
    P2.editing = ikey(r); P2.msg = ''; info.classList.add('full'); paintProg(); syncSheet(); document.getElementById('et0')?.focus();
  };
  const add = document.getElementById('pAdd'); if(add) add.onclick = () => { readDraft(); P2.draft.push({name:'', desc:'', who:'', to:null, cur:null}); paintProg(); document.getElementById('en' + (P2.draft.length-1))?.focus(); };
  document.querySelectorAll('#prog .edel').forEach(b => b.onclick = () => { readDraft(); P2.draft.splice(+b.closest('.erow').dataset.i, 1); paintProg(); });
  const cancel = document.getElementById('pCancel'); if(cancel) cancel.onclick = () => { P2.editing = null; P2.msg = ''; paintProg(); };
  const sv = document.getElementById('pSave'); if(sv) sv.onclick = async () => {
    readDraft();
    const items = P2.draft.filter(it => it.name).map(it => ({name: it.name.slice(0, 60), desc: (it.desc || '').slice(0, 120), who: it.who || '', to: it.to, cur: it.cur}));
    if(items.some(it => it.to !== null && it.cur !== null && it.cur > it.to)){ P2.msg = '참여 학생 수가 정원보다 많은 프로그램이 있어요. 숫자를 확인해 주세요.'; paintProg(); return; }
    P2.saving = true; P2.msg = ''; paintProg();
    const { data, error } = await P2.sb.from('seats').upsert({inst_key: ikey(r), inst_name: r.name, items}, {onConflict: 'inst_key'}).select('inst_key,items,updated_at').single();
    P2.saving = false;
    if(error){
      P2.msg = /row-level security|permission/i.test(error.message || '') ? '이 기관의 정원을 입력할 권한이 없어요. 서부교육지원청에 담당 기관 등록을 확인해 주세요.'
        : /JWT|token|session/i.test(error.message || '') ? '로그인이 만료됐어요. 다시 로그인한 뒤 저장해 주세요.'
        : /invalid items/i.test(error.message || '') ? '입력한 내용 형식이 맞지 않아요. 프로그램 이름(60자 이내)과 숫자(0~999)를 확인해 주세요.'
        : '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      paintProg(); return;
    }
    SEATS[data.inst_key] = {items: data.items || [], updatedAt: data.updated_at};
    P2.editing = null; P2.msg = ''; paintProg(); fillSeatChips(); toast('정원·참여 현황을 저장했어요');
  };
}
function fillSeatChips(){
  document.querySelectorAll('.avail[data-k]').forEach(sp => {
    const rec = P2.data[sp.dataset.k]; const sts = (rec?.items || []).map(seatOf).filter(Boolean);
    if(!sts.length){ sp.hidden = true; return; }
    const left = sts.reduce((a, b) => a + b.left, 0);
    sp.hidden = false; sp.className = 'avail ' + (left === 0 ? 'full' : left <= 2 ? 'few' : 'ok'); sp.dataset.k = sp.dataset.k;
    sp.textContent = left ? `참가 가능 ${left}명` : '모두 마감';
  });
}
/* ---------- web: Supabase (seats are read with one plain request; the login library loads only when needed) ---------- */
const CFG = window.APP_CONFIG || {};
const SB_ON = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/YOUR_/.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let sbLoading = null;
function getSb(){
  if(P2.sb) return Promise.resolve(P2.sb);
  if(!sbLoading) sbLoading = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = SB_LIB; s.crossOrigin = 'anonymous';
    s.onload = () => {
      try{
        P2.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true}});
        P2.sb.auth.onAuthStateChange(evt => { if(evt === 'SIGNED_OUT' || evt === 'TOKEN_REFRESHED') refreshMe(); });
        ok(P2.sb);
      }catch(e){ sbLoading = null; no(e); }
    };
    s.onerror = () => { sbLoading = null; s.remove(); no(new Error('supabase-js')); };
    document.head.appendChild(s);
  });
  return sbLoading;
}
function canEditInst(r){ return !!(P2.sb && P2.email && (P2.isAdmin || P2.assigned.has(ikey(r)))); }

async function loadSeats(){
  if(!SB_ON) return;
  try{
    const res = await fetch(CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/seats?select=inst_key,items,updated_at', {headers: {apikey: CFG.supabaseAnonKey}});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    for(const k in SEATS) delete SEATS[k];
    (data || []).forEach(row => { SEATS[row.inst_key] = {items: Array.isArray(row.items) ? row.items : [], updatedAt: row.updated_at}; });
    if(!P2.editing) paintProg();
    fillSeatChips();
  }catch(e){ console.warn('seats', e.message); }
}

/* who am I */
async function refreshMe(){
  if(!P2.sb) return;
  const { data: { session } } = await P2.sb.auth.getSession();
  P2.email = (session && session.user && session.user.email || '').toLowerCase();
  P2.assigned = new Set(); P2.isAdmin = false;
  if(P2.email){
    const [st, ad] = await Promise.all([P2.sb.from('staff').select('inst_key'), P2.sb.rpc('is_admin')]);
    (st.data || []).forEach(x => P2.assigned.add(x.inst_key));
    P2.isAdmin = ad.data === true;
  }
  paintLogin();
  if(!P2.editing) paintProg();
}
function paintLogin(){
  const btn = $('#loginBtn'), st = $('#whoState'), mine = $('#mineBox'), list = $('#mineList');
  if(!SB_ON){ btn.hidden = true; st.hidden = true; mine.hidden = true; return; }
  if(!P2.email){ btn.hidden = false; st.hidden = true; mine.hidden = true; return; }
  btn.hidden = true; st.hidden = false;
  const n = P2.assigned.size;
  st.innerHTML = `<span><b>${esc(P2.email)}</b> · ${P2.isAdmin ? '관리자' : `담당 기관 ${n}곳`}</span>${P2.isAdmin ? '<a class="linkbtn" href="admin.html">관리 화면</a>' : ''}<button class="linkbtn" id="logoutBtn" type="button">로그아웃</button>`;
  $('#logoutBtn').onclick = async () => { await P2.sb.auth.signOut(); P2.editing = null; await refreshMe(); toast('로그아웃했어요'); };
  const keys = [...P2.assigned];
  mine.hidden = !keys.length;
  list.innerHTML = '';
  keys.forEach(k => {
    const r = D.res.find(x => ikey(x) === k); if(!r) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = r.name;
    b.onclick = () => openInst(k); list.appendChild(b);
  });
  if(!P2.isAdmin && !n){
    mine.hidden = false;
    list.innerHTML = '<span style="font-size:13px;color:var(--muted)">이 이메일에 연결된 기관이 없어요. 서부교육지원청에 담당 기관 등록을 요청해 주세요.</span>';
  }
}
/* jump to one of my institutions and open its editor */
function openInst(k){
  const r = D.res.find(x => ikey(x) === k); if(!r) return;
  CATS.forEach(c => S.cats.add(c[0]));
  setSchool({name: `${r.name} 주변`, gu: r.gu, lv: '', lat: r.lat, lon: r.lon, custom: true});
  const t = current.find(x => ikey(x) === k);
  if(t){ select(t, false); setTimeout(() => { const e = document.getElementById('pEdit'); if(e) e.click(); }, 350); }
}

/* login dialog: email -> one-time code */
const lg = {wrap: $('#lgWrap'), s1: $('#lgStep1'), s2: $('#lgStep2'), msg: $('#lgMsg'), email: ''};
function lgMsg(t){ lg.msg.textContent = t || ''; lg.msg.hidden = !t; }
function openLogin(){ getSb().catch(() => {}); lg.wrap.hidden = false; lg.s1.hidden = false; lg.s2.hidden = true; lgMsg(''); $('#lgEmail').focus(); }
function closeLogin(){ lg.wrap.hidden = true; }
$('#loginBtn').onclick = openLogin;
$('#lgClose').onclick = closeLogin;
lg.wrap.addEventListener('click', e => { if(e.target === lg.wrap) closeLogin(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && !lg.wrap.hidden) closeLogin(); });
$('#lgBack').onclick = () => { lg.s2.hidden = true; lg.s1.hidden = false; lgMsg(''); $('#lgEmail').focus(); };
lg.s1.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#lgEmail').value.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ lgMsg('이메일 주소 형식을 확인해 주세요.'); return; }
  const btn = $('#lgSend'); btn.disabled = true; lgMsg('');
  try{
    await getSb();
    const reg = await P2.sb.rpc('is_registered', {p_email: email});
    if(reg.error) throw reg.error;
    if(reg.data !== true){ lgMsg('등록되지 않은 이메일이에요. 서부교육지원청 담당 장학사에게 담당자 등록을 요청해 주세요.'); return; }
    const { error } = await P2.sb.auth.signInWithOtp({email, options: {shouldCreateUser: true}});
    if(error){
      lgMsg(error.status === 429 || /rate|seconds/i.test(error.message || '') ? '인증번호를 너무 자주 요청했어요. 1분쯤 뒤에 다시 시도해 주세요.' : '인증번호를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return;
    }
    lg.email = email; lg.s1.hidden = true; lg.s2.hidden = false;
    lgMsg(''); $('#lgCode').value = ''; $('#lgCode').focus();
    toast('인증번호를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요');
  }catch(err){ lgMsg('지금은 로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요.'); }
  finally{ btn.disabled = false; }
});
lg.s2.addEventListener('submit', async e => {
  e.preventDefault();
  const token = $('#lgCode').value.replace(/\D/g, '');
  if(token.length < 6){ lgMsg('이메일로 받은 인증번호를 모두 입력해 주세요.'); return; }
  const btn = $('#lgVerify'); btn.disabled = true;
  const { error } = await P2.sb.auth.verifyOtp({email: lg.email, token, type: 'email'});
  btn.disabled = false;
  if(error){ lgMsg('인증번호가 맞지 않거나 시간이 지났어요. 다시 확인하거나 새로 받아 주세요.'); return; }
  closeLogin(); await refreshMe(); toast('로그인했어요');
});

paintLogin();
if(SB_ON){
  loadSeats();
  // refresh the counts when the page comes back into view, and every 2 minutes while it is open
  document.addEventListener('visibilitychange', () => { if(!document.hidden) loadSeats(); });
  setInterval(() => { if(!document.hidden) loadSeats(); }, 120000);
  // a staff member who logged in before: load the login library in the background
  let hasSession = false; try{ hasSession = Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); }catch(e){}
  if(hasSession) getSb().then(refreshMe).catch(() => {});
}


function hideInfo(){ info.hidden = true; info.classList.remove('full'); P2.shown = null; P2.editing = null; mapMode(false); }
/* phones: the sheet lives on <body>; while it is open the map card is pinned above it (map mode) */
const infoHome = info.parentNode;
function placeInfo(){
  const phone = innerWidth <= 900;
  if(phone && info.parentNode !== document.body) document.body.appendChild(info);
  else if(!phone && info.parentNode !== infoHome){ infoHome.appendChild(info); mapMode(false); }
}
function syncSheet(){ if(info.classList.contains('full') && document.documentElement.style.getPropertyValue('--sheet-h')) return; // the big sheet covers the map instead of squeezing it
  document.documentElement.style.setProperty('--sheet-h', (info.hidden ? 0 : Math.round(info.getBoundingClientRect().height)) + 'px'); }
function mapMode(on){
  const root = document.documentElement; on = !!on && innerWidth <= 900;
  if(root.classList.contains('mapmode') === on){ if(on) syncSheet(); return; }
  root.classList.toggle('mapmode', on); syncSheet();
  mapW = 0; MK = null; unitFast();
  if(mapH > 0) setVB([vb[0], vb[1], vb[2], vb[2] * mapH / Math.max(1, mapW)]); // keep the scale, fit the new frame
}
function recentre(){ if(S.sel && innerWidth <= 900){ const r = current.find(isSel); if(r){ syncSheet(); mapW = 0; unitFast(); setVB([vb[0], vb[1], vb[2], vb[2] * mapH / Math.max(1, mapW)]); ensureVisibleSheet(r, map.getBoundingClientRect().top); } } }
placeInfo(); addEventListener('resize', () => { placeInfo(); if(!info.hidden) syncSheet(); });
if(window.ResizeObserver) new ResizeObserver(() => { if(!info.hidden && document.documentElement.classList.contains('mapmode')) syncSheet(); }).observe(info);
/* phone sheet: tap the handle or "자세히 보기" to enlarge, scroll the details to enlarge, swipe the top down to shrink or close */
function bindSheet(){
  const body = info.querySelector('.ibody'), head = info.querySelector('.ihead');
  const grow = on => { if(info.classList.contains('full') === on) return; info.classList.toggle('full', on); if(!on) recentre(); };
  info.querySelector('.grab').onclick = () => grow(!info.classList.contains('full'));
  body.addEventListener('scroll', () => { if(body.scrollTop > 24 && innerWidth <= 900) grow(true); }, {passive: true});
  let y0 = null;
  head.addEventListener('touchstart', e => { y0 = e.target.closest('a,button:not(.grab)') ? null : e.touches[0].clientY; }, {passive: true});
  head.addEventListener('touchend', e => {
    if(y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if(dy < -30) grow(true);
    else if(dy > 50){ if(info.classList.contains('full')) grow(false); else info.querySelector('.ix').click(); }
  }, {passive: true});
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && !info.hidden) info.querySelector('.ix').click(); });

/* ---------- copy ---------- */
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 1800); }
function copy(text, msg){
  const done = () => toast(msg);
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }catch(e){ toast('복사하지 못했어요. 글자를 직접 선택해 주세요.'); } ta.remove(); };
  if(navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
$('#copyAll').onclick = () => {
  const sc = S.school;
  const lines = [`[${sc.name}] 반경 ${fmtD(S.r)} 안 도움 기관 ${current.length}곳 (직선거리 순)`];
  current.forEach((r, i) => lines.push(`${i+1}. ${r.name} (${CATL[r.cat]}) ${fmtD(r.m)} · ${r.ph || '-'} · ${r.addr}`));
  lines.push('출처: 2026 학생맞춤통합지원 복지 서비스별 자원 목록(부산서부교육지원청)');
  copy(lines.join('\n'), `${current.length}곳 목록을 복사했어요`);
};

try{ const ro = JSON.parse(sessionStorage.getItem('swk-reopen') || 'null');
  if(ro && ro.school){ sessionStorage.removeItem('swk-reopen'); S.school = ro.school; if([500, 1000, 2000].includes(ro.r)) S.r = ro.r; S.reopen = ro.sel; } }catch(e){}
render();
q.value = '';
if(S.reopen){ const t = current.find(x => keyOf(x) === S.reopen); S.reopen = null; if(t) setTimeout(() => select(t, false), 350); }
setVB([-10, -10, pr.w + 20, pr.h + 20]);
requestAnimationFrame(() => { const r = map.getBoundingClientRect(); const asp = r.width/Math.max(1,r.height);
  const [x,y] = P(S.school.lon, S.school.lat); const ru = S.r / mPerUnit * 1.18; let w = ru*2, h = ru*2; if(w/h < asp) w = h*asp; else h = w/asp; setVB([x-w/2, y-h/2, w, h]); });
(window.ResizeObserver ? new ResizeObserver(() => { mapW = 0; MK = null; scaleMarks(); }).observe(map) : addEventListener('resize', () => { mapW = 0; MK = null; scaleMarks(); }));
