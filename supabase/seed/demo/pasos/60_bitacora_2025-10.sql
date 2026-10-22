begin;
set local amo.modo_carga = 'on';
set local statement_timeout = '110s';
select private.demo_volcar_bitacora(date '2025-10-01');
commit;
