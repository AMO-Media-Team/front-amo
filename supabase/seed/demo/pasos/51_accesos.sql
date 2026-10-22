begin;
set local amo.modo_carga = 'on';
set local statement_timeout = '110s';
select private.demo_accesos(0.4242);
commit;
