-- =====================================================================
-- 학교 주변 도움 기관 찾기 — Supabase 데이터베이스 설정
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전하게 만들었어요.
--
-- 맨 아래 "최초 관리자" 줄의 이메일을 장학사님 이메일로 바꾼 뒤 실행하세요.
-- =====================================================================

-- 1) 테이블 ------------------------------------------------------------

-- 관리자(서부교육지원청 담당자). 관리 화면(admin.html)을 쓸 수 있어요.
create table if not exists public.admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- 기관 담당자: 이메일 1개에 기관 여러 곳을 연결할 수 있어요.
create table if not exists public.staff (
  email      text not null check (email = lower(email)),
  inst_key   text not null check (inst_key ~ '^(seo|jg|yd|saha)-[0-9]{1,3}$'),
  inst_name  text,
  created_at timestamptz not null default now(),
  primary key (email, inst_key)
);

-- 기관별 프로그램 정원·참여 현황(공개)
create table if not exists public.seats (
  inst_key   text primary key check (inst_key ~ '^(seo|jg|yd|saha)-[0-9]{1,3}$'),
  inst_name  text,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 변경 기록(관리자만 봐요)
create table if not exists public.seats_log (
  id         bigint generated always as identity primary key,
  inst_key   text not null,
  inst_name  text,
  items      jsonb,
  changed_at timestamptz not null default now(),
  changed_by text
);
create index if not exists seats_log_changed_at on public.seats_log (changed_at desc);

-- 2) 도우미 함수 --------------------------------------------------------

create or replace function public.current_email() returns text
  language sql stable
  as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.admins where email = public.current_email() and public.current_email() <> '') $$;

create or replace function public.can_edit(k text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_admin()
            or exists (select 1 from public.staff where email = public.current_email() and inst_key = k and public.current_email() <> '') $$;

-- 로그인 화면에서 "등록된 이메일인지"만 확인해요(기관 정보는 알려 주지 않아요).
create or replace function public.is_registered(p_email text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.staff  where email = lower(trim(p_email)))
            or exists (select 1 from public.admins where email = lower(trim(p_email))) $$;

revoke all on function public.is_admin() from public;
revoke all on function public.can_edit(text) from public;
revoke all on function public.is_registered(text) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_edit(text) to authenticated;
grant execute on function public.is_registered(text) to anon, authenticated;
-- Supabase는 새 함수에 anon 실행 권한을 기본으로 주므로, 로그인한 사람만 쓰는 함수는 anon에서 다시 막아요.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.can_edit(text) from anon;

-- 3) 입력값 검사 + 누가/언제 고쳤는지 서버에서 기록 ---------------------
--    (화면에서 보낸 값은 믿지 않고, 저장 시각과 이메일은 서버가 채워요)
create or replace function public.seats_stamp() returns trigger
  language plpgsql security definer set search_path = public
  as $$
declare e jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) > 30 then
    raise exception 'invalid items: list';
  end if;
  for e in select * from jsonb_array_elements(new.items) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(length(e ->> 'name'), 0) not between 1 and 60
       or length(coalesce(e ->> 'desc', '')) > 120
       or length(coalesce(e ->> 'who', '')) > 10
       or (e ? 'to'  and jsonb_typeof(e -> 'to')  not in ('null', 'number'))
       or (e ? 'cur' and jsonb_typeof(e -> 'cur') not in ('null', 'number'))
       or coalesce((e ->> 'to')::numeric, 0)  not between 0 and 999
       or coalesce((e ->> 'cur')::numeric, 0) not between 0 and 999
       or (e ->> 'to') is not null and (e ->> 'cur') is not null and (e ->> 'cur')::numeric > (e ->> 'to')::numeric
    then
      raise exception 'invalid items: %', left(e::text, 80);
    end if;
  end loop;
  new.updated_at := now();
  new.updated_by := public.current_email();
  insert into public.seats_log (inst_key, inst_name, items, changed_by)
  values (new.inst_key, new.inst_name, new.items, new.updated_by);
  return new;
end $$;

revoke execute on function public.seats_stamp() from public, anon, authenticated;

drop trigger if exists seats_stamp on public.seats;
create trigger seats_stamp before insert or update on public.seats
  for each row execute function public.seats_stamp();

-- 4) 접근 규칙(Row Level Security) -------------------------------------
alter table public.admins    enable row level security;
alter table public.staff     enable row level security;
alter table public.seats     enable row level security;
alter table public.seats_log enable row level security;

-- 정원 현황: 누구나 보기, 담당 기관(또는 관리자)만 입력
drop policy if exists seats_read   on public.seats;
drop policy if exists seats_insert on public.seats;
drop policy if exists seats_update on public.seats;
drop policy if exists seats_delete on public.seats;
create policy seats_read   on public.seats for select to anon, authenticated using (true);
create policy seats_insert on public.seats for insert to authenticated with check (public.can_edit(inst_key));
create policy seats_update on public.seats for update to authenticated using (public.can_edit(inst_key)) with check (public.can_edit(inst_key));
create policy seats_delete on public.seats for delete to authenticated using (public.is_admin());

-- 담당자 목록: 본인 줄만 보기, 관리자는 전체 관리
drop policy if exists staff_read  on public.staff;
drop policy if exists staff_admin on public.staff;
create policy staff_read  on public.staff for select to authenticated using (email = public.current_email() or public.is_admin());
create policy staff_admin on public.staff for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 관리자 목록: 관리자끼리만 보기(추가·삭제는 SQL Editor에서)
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated using (public.is_admin());

-- 변경 기록: 관리자만 보기(기록은 트리거가 자동으로 남겨요)
drop policy if exists log_read on public.seats_log;
create policy log_read on public.seats_log for select to authenticated using (public.is_admin());

-- 표 권한(규칙과 함께 동작)
grant select on public.seats to anon, authenticated;
grant insert, update, delete on public.seats to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select on public.admins to authenticated;
grant select on public.seats_log to authenticated;
revoke all on public.staff, public.admins, public.seats_log from anon;

-- 5) 실시간 반영(다른 사람이 저장하면 열린 화면에 바로 보이게) ----------
do $$ begin
  alter publication supabase_realtime add table public.seats;
exception when duplicate_object then null; end $$;

-- 6) 최초 관리자 ------------------------------------------------------
-- 아래 이메일을 장학사님 이메일로 바꾸세요(소문자로). 관리자를 더 추가할 때도 이 줄을 복사해 실행해요.
insert into public.admins (email) values (lower('CHANGE_ME@example.com')) on conflict do nothing;
