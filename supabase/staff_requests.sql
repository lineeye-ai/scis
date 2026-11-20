-- 기관 담당자 신청 (웹 신청서). 누구나 신청만 할 수 있고, 내용은 관리자만 봅니다.
create table if not exists public.staff_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  inst_key    text not null check (inst_key ~ '^(seo|jg|yd|saha)-[0-9]{1,3}$'),
  inst_name   text not null check (char_length(inst_name) between 1 and 100),
  name        text not null check (char_length(name) between 1 and 40),
  dept        text check (char_length(dept) <= 60),
  phone       text check (char_length(phone) <= 30),
  email       text not null check (char_length(email) <= 120 and email ~* '^[^@\s,]+@[^@\s,]+\.[^@\s,]+$'),
  name2       text check (char_length(name2) <= 40),
  dept2       text check (char_length(dept2) <= 60),
  phone2      text check (char_length(phone2) <= 30),
  email2      text check (email2 is null or (char_length(email2) <= 120 and email2 ~* '^[^@\s,]+@[^@\s,]+\.[^@\s,]+$')),
  fix_name    text check (char_length(fix_name) <= 200),
  fix_addr    text check (char_length(fix_addr) <= 200),
  fix_phone   text check (char_length(fix_phone) <= 200),
  fix_site    text check (char_length(fix_site) <= 300),
  fix_etc     text check (char_length(fix_etc) <= 1000),
  consent     boolean not null check (consent),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  handled_by  text,
  handled_at  timestamptz
);
alter table public.staff_requests enable row level security;

-- 신청(입력)만 누구나: 동의했고, 처리 상태를 스스로 정할 수 없게
drop policy if exists req_insert on public.staff_requests;
create policy req_insert on public.staff_requests for insert to anon, authenticated
  with check (consent and status = 'pending' and handled_by is null and handled_at is null);
-- 보기·수정·삭제는 관리자만
drop policy if exists req_admin_select on public.staff_requests;
create policy req_admin_select on public.staff_requests for select to authenticated using (public.is_admin());
drop policy if exists req_admin_update on public.staff_requests;
create policy req_admin_update on public.staff_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists req_admin_delete on public.staff_requests;
create policy req_admin_delete on public.staff_requests for delete to authenticated using (public.is_admin());
revoke all on public.staff_requests from anon;
grant insert on public.staff_requests to anon, authenticated;
grant select, update, delete on public.staff_requests to authenticated;

-- 남용 방지: 이메일 소문자 정리, 같은 이메일 1시간 3건·전체 1시간 200건 제한
create or replace function public.staff_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.email2 := nullif(lower(trim(coalesce(new.email2,''))), '');
  if (select count(*) from public.staff_requests where email = new.email and created_at > now() - interval '1 hour') >= 3 then
    raise exception '잠시 후 다시 신청해 주세요.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.staff_requests where created_at > now() - interval '1 hour') >= 200 then
    raise exception '신청이 많아 잠시 후 다시 시도해 주세요.' using errcode = 'P0001';
  end if;
  new.created_at := now(); new.status := 'pending'; new.handled_by := null; new.handled_at := null;
  return new;
end $$;
revoke all on function public.staff_requests_guard() from public, anon, authenticated;
drop trigger if exists staff_requests_guard on public.staff_requests;
create trigger staff_requests_guard before insert on public.staff_requests for each row execute function public.staff_requests_guard();

-- 승인: 담당자 표에 등록하고 상태를 바꿈 (관리자만)
create or replace function public.approve_staff_request(p_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare r public.staff_requests; n int := 0;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.staff_requests where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  insert into public.staff(email, inst_key, inst_name) values (r.email, r.inst_key, r.inst_name) on conflict do nothing;
  get diagnostics n = row_count;
  if r.email2 is not null then
    insert into public.staff(email, inst_key, inst_name) values (r.email2, r.inst_key, r.inst_name) on conflict do nothing;
  end if;
  update public.staff_requests set status = 'approved', handled_by = public.current_email(), handled_at = now() where id = p_id;
  return 1;
end $$;
revoke all on function public.approve_staff_request(bigint) from public, anon;
grant execute on function public.approve_staff_request(bigint) to authenticated;
