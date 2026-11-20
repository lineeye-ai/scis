/* 기관 담당자 신청서 — 누구나 신청만 할 수 있고, 신청 내용은 관리자만 볼 수 있어요 */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const CFG = window.APP_CONFIG || {}, D = window.APP_DATA || {res: []};
const GUK = {'서구':'seo','중구':'jg','영도구':'yd','사하구':'saha'};
const ikey = r => `${GUK[r.gu]}-${r.no}`;
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const RES = D.res.filter(r => GUK[r.gu] && !/교육지원청/.test(r.name));
const BYKEY = {}; RES.forEach(r => { BYKEY[ikey(r)] = r; });

const gu = $('#gu'), inst = $('#inst');
gu.innerHTML = '<option value="">구를 고르세요</option>' + ['서구','중구','영도구','사하구'].map(g => `<option>${g}</option>`).join('');
function fillInst(){
  const list = RES.filter(r => r.gu === gu.value).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  inst.innerHTML = gu.value ? '<option value="">기관을 고르세요</option>' + list.map(r => `<option value="${ikey(r)}"></option>`).join('') : '<option value="">구를 먼저 고르세요</option>';
  [...inst.options].slice(1).forEach((o, i) => { o.textContent = list[i].name; });
  showCur();
}
function showCur(){
  const r = BYKEY[inst.value], site = r ? (D.sites || {})[inst.value] : '';
  const set = (id, v) => { const el = $('#' + id); el.textContent = r ? '현재: ' + (v || '(없음)') : ''; el.hidden = !r; };
  set('cur_name', r && r.name); set('cur_addr', r && r.addr); set('cur_phone', r && r.ph && r.ph !== '-' ? r.ph : ''); set('cur_site', site);
}
document.querySelectorAll('input[name="consent"]').forEach(x => x.addEventListener('change', () => msg('')));
gu.addEventListener('change', fillInst); inst.addEventListener('change', showCur); fillInst();
// a link like apply.html?inst=saha-13 opens with that institution chosen
(function(){ const k = new URLSearchParams(location.search).get('inst'); const r = k && BYKEY[k]; if(r){ gu.value = r.gu; fillInst(); inst.value = k; showCur(); } })();

const msg = (t, ok) => { const m = $('#msg'); m.textContent = t || ''; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
const v = id => $('#' + id).value.trim();
function fail(id, t){ msg(t); const el = $('#' + id); if(el && el.focus) el.focus(); return false; }

$('#f').addEventListener('submit', async e => {
  e.preventDefault(); msg('');
  if(v('website')) return; // filled only by bots
  if(!inst.value) return fail(gu.value ? 'inst' : 'gu', '기관을 골라 주세요.');
  if(!v('name')) return fail('name', '담당자 성명을 적어 주세요.');
  const email = v('email').toLowerCase();
  if(!EMAIL.test(email)) return fail('email', '로그인용 이메일 형식을 확인해 주세요.');
  if(email !== v('email_c').toLowerCase()) return fail('email_c', '이메일 확인 칸이 위와 달라요.');
  const email2 = v('email2').toLowerCase();
  if(email2 && !EMAIL.test(email2)) return fail('email2', '추가 담당자 이메일 형식을 확인해 주세요.');
  if(email2 && !v('name2')) return fail('name2', '추가 담당자 성명을 적어 주세요.');
  const c = document.querySelector('input[name="consent"]:checked');
  if(!c) return fail(null, '개인정보 수집·이용 동의 여부를 골라 주세요.');
  if(c.value !== 'yes') return fail(null, '동의하지 않으시면 담당자로 등록할 수 없어요. 궁금한 점은 교육지원청 담당 장학사에게 문의해 주세요.');
  if(!CFG.supabaseUrl || !CFG.supabaseAnonKey) return fail(null, '지금은 신청을 받을 수 없어요. 교육지원청에 문의해 주세요.');
  const r = BYKEY[inst.value], o = s => v(s) || null;
  const row = {inst_key: inst.value, inst_name: r.name, name: v('name'), dept: o('dept'), phone: o('phone'), email,
    name2: o('name2'), dept2: o('dept2'), phone2: o('phone2'), email2: email2 || null,
    fix_name: o('fix_name'), fix_addr: o('fix_addr'), fix_phone: o('fix_phone'), fix_site: o('fix_site'), fix_etc: o('fix_etc'), consent: true};
  const btn = $('#send'); btn.disabled = true; btn.textContent = '보내는 중…';
  try{
    const res = await fetch(CFG.supabaseUrl + '/rest/v1/staff_requests', {method: 'POST',
      headers: {'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, Prefer: 'return=minimal'},
      body: JSON.stringify(row)});
    if(!res.ok){
      let t = ''; try{ t = (await res.json()).message || ''; }catch(_){}
      throw new Error(/잠시 후|신청이 많아/.test(t) ? t : '신청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    $('#f').hidden = true; $('#doneEmail').textContent = email; $('#done').hidden = false; scrollTo(0, 0);
  }catch(err){ msg(err.message || '신청을 보내지 못했어요.'); }
  finally{ btn.disabled = false; btn.textContent = '신청하기'; }
});
})();
