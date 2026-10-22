begin;
set local amo.modo_carga = 'on';
set local statement_timeout = '110s';
select private.demo_finanzas(date '2026-06-01', 0.4242);
commit;
