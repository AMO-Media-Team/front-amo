begin;
set local amo.modo_carga = 'on';
set local statement_timeout = '110s';
select private.demo_volcar_bitacora(date '2026-09-01');
commit;
