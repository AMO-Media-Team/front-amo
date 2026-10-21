-- Migración 14 · bitacora_indice_cronologico (docs/modelo-datos.md §3.3)
-- La línea de tiempo de Auditoría y el bloque «Actividad reciente» de Inicio leen la bitácora por conjunto
-- (keyset): `where created_at >= … and created_at < … order by created_at desc, id desc limit 31`. El único índice
-- sobre la fecha era `bitacora_created_at_brin`, que no puede servir un `order by … limit` y, además, es inútil
-- cuando las filas no están físicamente en orden cronológico (carga demo con fechas de 15 meses, importaciones):
-- el plan era Bitmap Heap Scan con todos los bloques «lossy» (95 mil filas leídas y 82 mil descartadas en el
-- recheck) + top-N sort, 4,7 s en frío de CPU. Con dos o tres paneles de Inicio abiertos a la vez superaba el
-- `statement_timeout` de 8 s («No se pudo leer la línea de tiempo (57014)»); se vio al ejecutar la suite E2E
-- completa (2026-10-06). El costo crecía con cada evento registrado: la bitácora es inmutable y solo aumenta.
-- Corrección: índice B-tree en el mismo orden de la paginación. También sirve los conteos por periodo de la
-- cabecera de Auditoría (rango sobre created_at). El BRIN se conserva (no estorba y es diminuto).

create index bitacora_created_at_id_idx on public.bitacora (created_at desc, id desc);
