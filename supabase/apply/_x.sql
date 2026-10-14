-- Read-only probe: the 39 "Canceled" visits in the user's file (UC Number,
-- visit UID) against the live calls and visits.
with f(ucn, uid) as (values
('25L29F0008','H-926344b1'),
('26A22F0004','H-88cf8fc4'),
('26B04F0005','H-94bcc800'),
('26B03F0031','H-0e7dabbe'),
('26B04F0024','H-0375f8e4'),
('25L30F0014','H-8123663b'),
('25L22F0033','H-d44582e7'),
('26A08F0002','H-627632f8'),
('26A05F0001','H-3ccb7626'),
('26B03F0017','H-ab332f2a'),
('26B13F0012','H-ee2bf99e'),
('26B03F0032','H-f8434031'),
('26A30F0020','H-ca7c6c6e'),
('26A30F0004','H-ac65988d'),
('26A30F0006','H-ced8cb85'),
('26A30F0008','H-910dd5d2'),
('26A30F0005','H-2b1a98dd'),
('26A30F0007','H-9894a085'),
('26B02F0008','H-d78bebdd'),
('26A28F0008','H-3792e74b'),
('26B10F0016','H-5be280f2'),
('26C26I0001','H-e0226aa7'),
('26C17F0011','H-3bf9cb06'),
('26C30F0010','H-acf05da5'),
('26A19F0044','H-9875997c'),
('26D07F0016','H-0f6d2e26'),
('26C18F0010','H-efdbb2ac'),
('26D08F0004','H-8b66cfd4'),
('26E12F0024','H-94b4ab94'),
('26B16F0030','H-6afba427'),
('26C10F0002','H-fb3da293'),
('26D10F0016','H-20fdfa4d'),
('26E07F0010','H-d6d7b6ec'),
('26E07F0012','H-ff247dc7'),
('26E07F0010','H-3f35a61d'),
('26C18F0070','H-0b5039a8'),
('26F01F0007','H-02a41594'),
('26F01F0008','H-36113ca4'),
('26G08F0031','H-f30b1087')
), lv as (
  select distinct on (r.ucn) r.ucn, r.uid, r.call_status, r.visit_at, r.updated_at
    from public.reports r join f on f.ucn = r.ucn
   order by r.ucn, r.updated_at desc nulls last, r.id desc
)
select f.ucn, f.uid as file_uid,
       c.call_type, c.open_state, c.last_status, (c.cancelled_at is not null) as cancelled_in_rithi,
       (select r.call_status from public.reports r where r.uid = f.uid) as file_visit_status_now,
       (select count(*) from public.reports r where r.ucn = f.ucn) as visits,
       lv.uid as latest_uid, lv.call_status as latest_status, (lv.visit_at at time zone 'Asia/Kolkata')::date as latest_visit
  from f left join public.calls c on c.ucn = f.ucn left join lv on lv.ucn = f.ucn
 order by f.ucn, f.uid;
