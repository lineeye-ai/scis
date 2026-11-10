# 학교 주변 도움 기관 찾기 (부산서부교육지원청)

학교를 고르면 주변의 복지·돌봄·상담·의료 기관을 지도와 목록으로 보여 주는 웹 앱이에요.
기관 담당자는 이메일 인증번호로 로그인해서 **자기 기관의 프로그램 정원·참여 인원**만 입력할 수 있고, 그 현황은 누구나 볼 수 있어요.

- 화면: GitHub Pages (정적 사이트, 서버 불필요)
- 로그인·정원 데이터: Supabase (무료 요금제로 시작 가능)
- 학생 개인정보는 다루지 않아요. 저장하는 것은 **프로그램별 숫자**와 **담당자 이메일**뿐이에요.

---

## 파일 구성

| 파일 | 하는 일 |
|---|---|
| `index.html`, `app.js` | 지도·검색 화면(모든 사람용) |
| `admin.html`, `admin.js` | 담당자 등록·변경 기록·CSV 내려받기(관리자용) |
| `config.js` | Supabase 연결 설정 — **설치할 때 여기만 고치면 돼요** |
| `data/app-data.js` | 기관·학교·지도·프로그램 정보 |
| `supabase/schema.sql` | 데이터베이스 표·권한 규칙(한 번 실행) |
| `.nojekyll` | GitHub Pages가 파일을 그대로 쓰게 하는 빈 파일 |

`config.js`를 고치지 않아도 앱은 **보기 전용**으로 동작해요(지도·기관 정보·프로그램 목록은 보이고, 로그인과 정원 입력만 숨겨져요). 그래서 1단계(GitHub 올리기)만 먼저 해도 바로 써 볼 수 있어요.

---

## 1단계. GitHub에 올리기 (약 10분)

1. GitHub에 로그인 → 오른쪽 위 **+ → New repository**
   - Repository name: 예) `school-resource-map`
   - **Public** 선택 (무료 계정의 GitHub Pages는 공개 저장소에서만 동작해요. 올라가는 파일에는 비밀 정보가 없어요.)
2. 만든 저장소에서 **Add file → Upload files** → 이 묶음의 **파일과 폴더를 모두** 끌어다 놓고 **Commit changes**
   - `.nojekyll`처럼 점으로 시작하는 파일이 안 보이면, 저장소에서 **Add file → Create new file**로 이름 `.nojekyll`인 빈 파일을 만들어도 돼요.
3. 저장소 **Settings → Pages**
   - Source: **Deploy from a branch**, Branch: **main** / **/(root)** → Save
4. 1~2분 뒤 같은 화면 위쪽에 주소가 나타나요. 예) `https://내아이디.github.io/school-resource-map/`

> 터미널을 쓸 줄 알면: `git init && git add . && git commit -m "first" && git branch -M main && git remote add origin https://github.com/내아이디/school-resource-map.git && git push -u origin main`

---

## 2단계. Supabase 준비 (약 20분)

### 2-1. 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
   - Region: **Northeast Asia (Seoul)** 권장
   - Database password: 길게 만들어 안전한 곳에 보관(앱에는 쓰지 않아요)

### 2-2. 데이터베이스 설정
1. `supabase/schema.sql`을 열어 **맨 아래 줄**의 `CHANGE_ME@example.com`을 관리자(장학사) 이메일로 바꿔요.
2. Supabase 왼쪽 메뉴 **SQL Editor → New query** → 파일 내용 전체 붙여 넣기 → **Run**
   - "Success" 가 나오면 끝. 여러 번 실행해도 안전해요.

### 2-3. 이메일 로그인 설정 (중요)
**Authentication** 메뉴에서:

1. **Sign In / Providers → Email**: 켜져 있는지 확인. "Allow new users to sign up"도 켜 두세요(처음 로그인할 때 계정이 자동으로 만들어져요. 권한은 관리자가 등록한 기관에만 생겨요).
2. **이메일 템플릿**(Emails → Templates)에서 **Magic Link**와 **Confirm signup** 두 개를 아래처럼 바꿔요. 앱은 링크가 아니라 **숫자 인증번호**를 입력받기 때문에 `{{ .Token }}`이 꼭 들어가야 해요.
   - 제목: `[서부교육지원청] 도움 기관 지도 로그인 인증번호`
   - 본문:
     ```html
     <p>학교 주변 도움 기관 찾기 로그인 인증번호입니다.</p>
     <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
     ```
3. **SMTP 설정(Emails → SMTP Settings)** — 꼭 필요해요.
   Supabase 기본 메일 서버는 **프로젝트 팀원에게만, 시간당 몇 통만** 보내요. 기관 담당자에게 메일이 가려면 별도 메일 서버를 연결해야 해요.
   - 교육청 메일 서버(SMTP) 사용 가능 여부를 정보화 담당에게 문의하거나,
   - Resend, Brevo, Amazon SES 같은 메일 발송 서비스의 SMTP 정보를 넣어요(발신 주소 도메인 인증 필요).
   - 연결 후 **Rate Limits**에서 시간당 발송 수를 담당자 수에 맞게 늘려 두세요.
4. **URL Configuration → Site URL**에 1단계에서 받은 주소를 넣어요. 예) `https://내아이디.github.io/school-resource-map/`

### 2-4. 앱과 연결
1. Supabase **Project Settings → API**(또는 Data API / API Keys)에서 두 값을 복사해요.
   - **Project URL** 예) `https://abcdefghijkl.supabase.co`
   - **anon public** 키 (또는 publishable 키)
2. GitHub 저장소에서 `config.js` → 연필(Edit) → 두 값을 바꿔 넣고 Commit.
   > ⚠️ **service_role(secret) 키는 절대 넣지 마세요.** 그 키가 있으면 모든 권한 규칙을 건너뛸 수 있어요. anon 키는 공개돼도 괜찮게 설계했어요(권한은 데이터베이스 규칙이 지켜요).
3. 1~2분 뒤 사이트를 새로 고치면 오른쪽 위에 **담당자 로그인** 버튼이 생겨요.

---

## 3단계. 담당자 등록하고 쓰기

1. 사이트 주소 뒤에 `admin.html`을 붙여 열어요. 예) `https://내아이디.github.io/school-resource-map/admin.html`
2. 관리자 이메일로 인증번호를 받아 로그인
3. **담당자 등록**: 기관을 고르고 담당자 이메일 입력 → 등록
   - 여러 명은 "여러 명 한꺼번에 등록"에 `기관 이름, 이메일`을 한 줄씩 붙여 넣어요(엑셀 두 칸을 복사해 붙여도 돼요).
   - 한 사람이 여러 기관을, 한 기관을 여러 사람이 맡을 수 있어요.
4. 담당자에게 사이트 주소를 안내 → 담당자는 **담당자 로그인 → 이메일 → 인증번호** 후 "내가 입력할 기관"을 눌러 정원·참여 수를 입력해요.
5. 입력한 내용은 곧바로 모든 사람 화면에 보이고, 관리 화면의 **최근 변경 기록**에 누가 언제 고쳤는지 남아요.

관리자를 더 늘리려면 SQL Editor에서:
```sql
insert into public.admins (email) values (lower('새관리자@example.com'));
-- 빼려면
delete from public.admins where email = lower('뺄관리자@example.com');
```

---

## 4단계. 교육청 계정으로 옮기기

1. 교육청 GitHub 계정(또는 조직)을 준비해요.
2. 지금 저장소 **Settings → General → 맨 아래 Danger Zone → Transfer ownership** → 교육청 계정 이름 입력
3. 옮긴 저장소에서 **Settings → Pages**가 켜져 있는지 확인해요.
4. **사이트 주소가 바뀌어요.** 예) `https://내아이디.github.io/...` → `https://교육청계정.github.io/...`
   (저장소는 자동으로 넘어가지만 옛 Pages 주소는 넘어가지 않아요.)
5. Supabase **Authentication → URL Configuration → Site URL**을 새 주소로 바꿔요.
6. 담당자들에게 새 주소를 안내해요.

Supabase 프로젝트도 교육청 소유로 옮기려면: 교육청 이메일로 Supabase 조직을 만들고 → 지금 프로젝트의 **Project Settings → General → Transfer project**로 그 조직에 넘기면 돼요. 주소와 키는 그대로라 `config.js`를 바꿀 필요가 없어요.

> 자체 도메인(예: `map.○○.go.kr`)을 쓰려면 Settings → Pages → Custom domain에 넣고, 교육청 DNS에 CNAME을 추가하면 돼요. 이때도 Supabase Site URL을 바꿔 주세요.

---

## 프로그램 정보 고치기

기관별 프로그램 목록은 `data/app-data.js` 안의 `"progs"`에 있어요. 고친 뒤에는 `"progsDate"`(예: `"2026년 11월 6일"`)도 바꿔 주세요. 기관 정보 창의 프로그램 목록 아래에 "(○○ 확인)"으로 보여요.
- GitHub에서 파일을 열고 연필(Edit)로 고친 뒤 Commit하면 1~2분 뒤 반영돼요.
- 파일이 커서 직접 고치기 어렵다면 Claude에게 "이 파일의 ○○기관 프로그램을 바꿔 줘"라고 파일과 함께 요청해도 돼요.

정원·참여 수는 이 파일이 아니라 Supabase에 저장되니, 프로그램 정보를 고쳐도 사라지지 않아요(기관 코드가 같으면 그대로 이어져요).

---

## 보안·개인정보 점검표 (정보보안 검토 때 함께 보세요)

- **수집하는 개인정보**: 기관 담당자 이메일 1개(로그인 확인 용도). 학생·가정 정보는 받지 않아요.
- **권한은 데이터베이스가 지켜요(Row Level Security)**:
  - 정원 현황: 누구나 읽기 / 등록된 담당자는 **자기 기관만** 쓰기 / 관리자는 전체
  - 담당자 목록·변경 기록: 관리자만 보기
  - 저장 시각과 입력자 이메일은 서버가 직접 기록해서 화면에서 위조할 수 없어요.
  - 입력값 검사(프로그램 30개 이하, 숫자 0~999, 참여 ≤ 정원 등)도 서버에서 해요.
- **로그인**: 비밀번호 없이 이메일 인증번호(일회용, 시간 제한). 로그인 화면은 등록되지 않은 이메일에는 메일을 보내지 않아요.
  - 참고: 누군가 Supabase에 직접 요청하면 등록되지 않은 이메일로도 "계정"은 만들어질 수 있지만, 기관이 연결되지 않아 **아무것도 고칠 수 없어요.** 필요하면 Authentication → Users에서 정리할 수 있어요.
- **화면 보안**: 모든 표시 문자열을 이스케이프하고, Content-Security-Policy로 외부 스크립트를 jsdelivr(supabase-js 2.45.4)로만 제한했어요.
- **보관·파기**: 담당자가 바뀌면 관리 화면에서 삭제하고, Supabase Authentication → Users에서 해당 이메일도 지워 주세요.
- **무료 요금제 주의**: Supabase 무료 프로젝트는 **7일 동안 아무 요청이 없으면 일시 정지**돼요(대시보드에서 다시 켤 수 있음). 상시 운영하려면 Pro 요금제를 쓰거나 정기적으로 접속되도록 운영해 주세요.

담당자 안내용 개인정보 문구(예시):
> 이 서비스는 기관 담당자 확인을 위해 이메일 주소만 수집하며, 담당 기간 동안 보관 후 파기합니다. 수집 항목: 이메일 / 이용 목적: 프로그램 정원·참여 현황 입력 권한 확인 / 보관 기간: 담당 지정 해제 시까지.

---

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 로그인 버튼이 안 보여요 | `config.js` 두 값이 바뀌었는지, 저장 후 1~2분 지났는지 |
| 인증번호 메일이 안 와요 | SMTP 설정, 스팸함, Supabase Logs → Auth |
| 메일에 숫자 대신 링크만 와요 | 이메일 템플릿에 `{{ .Token }}`이 있는지 (Magic Link, Confirm signup 둘 다) |
| "등록되지 않은 이메일" | 관리 화면에서 그 이메일이 등록됐는지(대소문자 무관) |
| 저장하면 "권한이 없어요" | 그 기관이 담당자에게 연결됐는지 |
| 사이트가 갑자기 정원을 못 불러와요 | Supabase 프로젝트가 일시 정지됐는지(무료 요금제) |
