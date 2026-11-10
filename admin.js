/* 담당자 관리 화면 (관리자 전용) */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = window.APP_CONFIG || {}, D = window.APP_DATA || {res: []};
const GUK = {'서구':'seo','중구':'jg','영도구':'yd','사하구':'saha'};
const ikey = r => `${GUK[r.gu]}-${r.no}`;
const BYKEY = {}; D.res.forEach(r => { BYKEY[ikey(r)] = r; });
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const fmt = t => { try{ return new Date(t).toLocaleString('ko-KR', {dateStyle: 'short', timeStyle: 'short'}); }catch(e){ return t || ''; } };
function msg(el, t, ok){ el.textContent = t || ''; el.className = 'msg ' + (ok ? 'ok' : 'bad'); }

if(!CFG.supabaseUrl || /YOUR_/.test(CFG.supabaseUrl + CFG.supabaseAnonKey) || !window.supabase){
  msg($('#lmsg'), 'config.js에 Supabase 주소와 anon 키를 먼저 넣어 주세요.');
  $('#f1').hidden = true; return;
}
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true}});
let STAFF = [], SEATS = [], loginEmail = '';

/* institution picker grouped by 구 */
(function(){
  const sel = $('#inst'), groups = {};
  D.res.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')).forEach(r => { (groups[r.gu] = groups[r.gu] || []).push(r); });
  sel.innerHTML = '<option value="">기관을 고르세요</option>' + ['서구','중구','영도구','사하구'].filter(g => groups[g]).map(g =>
    `<optgroup label="${esc(g)}">${groups[g].map(r => `<option value="${esc(ikey(r))}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('');
})();
function findInst(s){
  s = s.trim(); if(BYKEY[s]) return BYKEY[s];
  const n = s.replace(/\s+/g, '');
  const hits = D.res.filter(r => r.name.replace(/\s+/g, '') === n);
  return hits.length === 1 ? hits[0] : null;
}

/* login */
$('#f1').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#em').value.trim().toLowerCase();
  if(!EMAIL.test(email)) return msg($('#lmsg'), '이메일 형식을 확인해 주세요.');
  $('#b1').disabled = true;
  const reg = await sb.rpc('is_registered', {p_email: email});
  if(reg.error || reg.data !== true){ $('#b1').disabled = false; return msg($('#lmsg'), '등록되지 않은 이메일이에요.'); }
  const { error } = await sb.auth.signInWithOtp({email, options: {shouldCreateUser: true}});
  $('#b1').disabled = false;
  if(error) return msg($('#lmsg'), error.status === 429 ? '너무 자주 요청했어요. 1분쯤 뒤에 다시 해 주세요.' : '인증번호를 보내지 못했어요.');
  loginEmail = email; $('#f1').hidden = true; $('#f2').hidden = false; $('#code').focus();
  msg($('#lmsg'), '인증번호를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.', true);
});
$('#back').onclick = () => { $('#f2').hidden = true; $('#f1').hidden = false; msg($('#lmsg'), ''); };
$('#f2').addEventListener('submit', async e => {
  e.preventDefault();
  $('#b2').disabled = true;
  const { error } = await sb.auth.verifyOtp({email: loginEmail, token: $('#code').value.replace(/\D/g, ''), type: 'email'});
  $('#b2').disabled = false;
  if(error) return msg($('#lmsg'), '인증번호가 맞지 않거나 시간이 지났어요.');
  start();
});
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function start(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session) return;
  const ad = await sb.rpc('is_admin');
  $('#who').textContent = session.user.email; $('#logout').hidden = false;
  if(ad.data !== true){
    $('#f1').hidden = true; $('#f2').hidden = true;
    msg($('#lmsg'), '이 이메일은 관리자로 등록되어 있지 않아요. 기관 담당자는 지도 화면에서 입력해 주세요.');
    return;
  }
  $('#login').hidden = true; $('#app').hidden = false;
  await Promise.all([loadStaff(), loadSeats(), loadLog()]);
}

/* staff */
async function loadStaff(){
  const { data, error } = await sb.from('staff').select('email,inst_key,inst_name,created_at').order('inst_key');
  if(error) return msg($('#amsg'), '담당자 목록을 불러오지 못했어요: ' + error.message);
  STAFF = data || []; paintStaff();
}
function paintStaff(){
  const q = $('#flt').value.trim().toLowerCase();
  const rows = STAFF.filter(s => !q || (s.email + ' ' + (s.inst_name || '')).toLowerCase().includes(q));
  $('#cnt').textContent = `${STAFF.length}건`;
  $('#staff').innerHTML = rows.length ? rows.map((s, i) =>
    `<tr><td>${esc(s.inst_name || s.inst_key)}<br><span class="muted">${esc((BYKEY[s.inst_key] || {}).gu || '')} · ${esc(s.inst_key)}</span></td><td>${esc(s.email)}</td><td>${esc(fmt(s.created_at))}</td><td><button class="del" data-i="${STAFF.indexOf(s)}" type="button">삭제</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">등록된 담당자가 없어요.</td></tr>';
}
$('#flt').addEventListener('input', paintStaff);
$('#staff').addEventListener('click', async e => {
  const b = e.target.closest('button.del'); if(!b) return;
  const s = STAFF[+b.dataset.i]; if(!s) return;
  if(!window.confirm(`${s.inst_name || s.inst_key} 담당자 ${s.email} 을(를) 삭제할까요?`)) return;
  const { error } = await sb.from('staff').delete().eq('email', s.email).eq('inst_key', s.inst_key);
  if(error) return msg($('#amsg'), '삭제하지 못했어요: ' + error.message);
  msg($('#amsg'), '삭제했어요.', true); loadStaff();
});
async function addRows(rows){
  const { error } = await sb.from('staff').upsert(rows, {onConflict: 'email,inst_key', ignoreDuplicates: true});
  return error;
}
$('#add').onclick = async () => {
  const r = BYKEY[$('#inst').value], email = $('#sem').value.trim().toLowerCase();
  if(!r) return msg($('#amsg'), '기관을 골라 주세요.');
  if(!EMAIL.test(email)) return msg($('#amsg'), '이메일 형식을 확인해 주세요.');
  const err = await addRows([{email, inst_key: ikey(r), inst_name: r.name}]);
  if(err) return msg($('#amsg'), '등록하지 못했어요: ' + err.message);
  msg($('#amsg'), `${r.name} — ${email} 등록했어요.`, true); $('#sem').value = ''; loadStaff();
};
$('#bulkBtn').onclick = async () => {
  const rows = [], bad = [];
  $('#bulk').value.split(/\r?\n/).forEach((line, i) => {
    if(!line.trim()) return;
    const at = line.lastIndexOf(',') >= 0 ? line.lastIndexOf(',') : line.lastIndexOf('\t');
    const name = at >= 0 ? line.slice(0, at) : '', email = (at >= 0 ? line.slice(at + 1) : '').trim().toLowerCase();
    const r = findInst(name);
    if(!r || !EMAIL.test(email)) bad.push(`${i + 1}번째 줄: ${line.trim()}`);
    else rows.push({email, inst_key: ikey(r), inst_name: r.name});
  });
  if(bad.length) return msg($('#bmsg'), '아래 줄을 확인해 주세요(기관 이름이 정확한지, 이메일이 맞는지).\n' + bad.join('\n'));
  if(!rows.length) return msg($('#bmsg'), '붙여 넣은 내용이 없어요.');
  const err = await addRows(rows);
  if(err) return msg($('#bmsg'), '등록하지 못했어요: ' + err.message);
  msg($('#bmsg'), `${rows.length}명 등록했어요.`, true); $('#bulk').value = ''; loadStaff();
};
$('#bmsg').style.whiteSpace = 'pre-line';

/* seats + log */
async function loadSeats(){
  const { data } = await sb.from('seats').select('inst_key,inst_name,items,updated_at,updated_by').order('inst_key');
  SEATS = data || [];
  const n = SEATS.reduce((a, s) => a + (Array.isArray(s.items) ? s.items.length : 0), 0);
  $('#seatInfo').textContent = `입력한 기관 ${SEATS.length}곳 · 프로그램 ${n}개`;
}
async function loadLog(){
  const { data } = await sb.from('seats_log').select('inst_key,inst_name,items,changed_at,changed_by').order('changed_at', {ascending: false}).limit(50);
  const rows = data || [];
  $('#log').innerHTML = rows.length ? rows.map(l => {
    const items = Array.isArray(l.items) ? l.items : [];
    const sum = items.map(it => `${it.name}${it.to != null ? ` ${it.cur != null ? it.cur : '?'}/${it.to}` : ''}`).join(', ');
    return `<tr><td>${esc(fmt(l.changed_at))}</td><td>${esc(l.inst_name || l.inst_key)}</td><td>${esc(l.changed_by)}</td><td>${esc(sum || '(비움)')}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="muted">아직 기록이 없어요.</td></tr>';
}
$('#csv').onclick = () => {
  const q = v => { v = String(v == null ? '' : v); if(/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const lines = [['구','기관','프로그램','대상','정원','참여','남은 자리','최종 입력','입력한 사람'].map(q).join(',')];
  SEATS.forEach(s => {
    const r = BYKEY[s.inst_key] || {};
    (Array.isArray(s.items) ? s.items : []).forEach(it => {
      const left = it.to != null && it.cur != null ? it.to - it.cur : '';
      lines.push([r.gu, s.inst_name || r.name, it.name, it.who, it.to, it.cur, left, fmt(s.updated_at), s.updated_by].map(q).join(','));
    });
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `정원현황_${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

sb.auth.getSession().then(({data}) => { if(data.session) start(); });
})();
