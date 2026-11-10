/*
 * 학교 주변 도움 기관 찾기 — 연결 설정
 *
 * Supabase 프로젝트를 만든 뒤 아래 두 값을 바꿔 넣으세요.
 * (Supabase 대시보드 → Project Settings → API)
 *   - supabaseUrl     : Project URL        예) https://abcdefghijkl.supabase.co
 *   - supabaseAnonKey : anon public key    (공개해도 되는 키예요. service_role 키는 절대 넣지 마세요)
 *
 * 값을 바꾸지 않으면 앱은 "보기 전용"으로 동작해요(지도·기관 정보는 보이고, 정원 입력과 로그인은 숨겨져요).
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_PUBLIC_KEY'
};
