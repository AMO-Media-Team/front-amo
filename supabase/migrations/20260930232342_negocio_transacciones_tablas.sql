-- Migración 7a · negocio_transacciones_tablas (docs/modelo-datos.md §3.6, §4.1, §4.2, §11)
-- Enums, private.transiciones_estado con su semilla completa (§4.2, incluidas las entidades de M3/M6) y las tablas
-- transaccionales: campañas, ofertas y cupos, vistas, creativos, excepciones de comisión, asignaciones y montos,
-- descargas, publicaciones, métricas, dispersiones, liquidaciones, documentos soporte, facturas, pagos y disputas.
-- M7 va en cuatro migraciones: 7a tablas (esta; RLS habilitada sin políticas = nadie accede), 7b funciones núcleo y
-- triggers, 7c procedimientos y SRF, 7d políticas, grants, auditoría y verificación.
-- Desviaciones de la implementación (docs/modelo-datos.md §3.6 «Real»):
--   · metricas.id es uuid (no bigint): transicionar_srv (firma fija, p_id uuid) debe poder transicionar métricas.
--   · documentos_soporte: un solo documento NO ANULADO por liquidación (índice único parcial) para poder volver a
--     emitir tras anular uno; el número es coherente (todos los campos de numeración juntos) y un borrador anulado
--     no consume número (el CHECK del doc impedía BORRADOR → ANULADO). Igual en facturas (BORRADOR → ANULADA).

-- 1. Enums
create type public.campana_estado as enum ('BORRADOR', 'ACTIVA', 'FINALIZADA', 'CANCELADA');
create type public.oferta_estado as enum ('BORRADOR', 'EN_REVISION', 'DEVUELTA', 'PUBLICADA', 'CUPOS_COMPLETOS',
  'EN_EJECUCION', 'VENCIDA', 'CERRADA', 'CANCELADA');
create type public.asignacion_estado as enum ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA',
  'METRICAS_CARGADAS', 'VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA', 'VENCIDA_SIN_PUBLICAR', 'EN_DISPUTA', 'CANCELADA');
create type public.creativo_tipo as enum ('IMAGEN', 'VIDEO', 'CARRUSEL');
create type public.corte_metrica as enum ('H24', 'H72', 'D7', 'PERSONALIZADO');
create type public.metrica_fuente as enum ('MANUAL', 'API');
create type public.comision_origen as enum ('GLOBAL', 'EXCEPCION_ANUNCIANTE', 'EXCEPCION_CAMPANA');
create type public.cancelacion_causa as enum ('ADMINISTRATIVA', 'ACUERDO', 'INCUMPLIMIENTO_MEDIO', 'FRAUDE');
create type public.liquidacion_estado as enum ('BORRADOR', 'APROBADA', 'PAGADA', 'ANULADA');
create type public.documento_soporte_estado as enum ('BORRADOR', 'EMITIDO', 'ANULADO');
create type public.factura_estado as enum ('BORRADOR', 'EMITIDA', 'PAGADA_PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA');
create type public.disputa_estado as enum ('ABIERTA', 'EN_REVISION', 'RESUELTA', 'DESCARTADA');
create type public.disputa_motivo as enum ('INCUMPLIMIENTO', 'METRICAS', 'CONTENIDO', 'PERMANENCIA', 'PAGO', 'OTRO');
create type public.disputa_parte as enum ('ANUNCIANTE', 'MEDIO', 'ADMIN');
create type public.transicion_actor as enum ('ADMIN', 'ANUNCIANTE', 'MEDIO', 'SISTEMA');

-- 2. Máquina de estados: fuente única (§4.1). Sin RLS ni grants (esquema private).
create table private.transiciones_estado (
  entidad text not null constraint transiciones_estado_entidad_chk check (entidad in ('perfiles', 'anunciantes', 'medios',
    'documentos_medio', 'documentos_anunciante', 'verificaciones_cuenta', 'campanas', 'ofertas', 'asignaciones',
    'publicaciones', 'metricas', 'liquidaciones', 'documentos_soporte', 'facturas', 'disputas')),
  desde text not null,                         -- 'NUEVO' = creación
  hacia text not null,
  actor public.transicion_actor not null,
  permiso text references public.permisos (clave) on update cascade,     -- null solo para SISTEMA
  requiere_motivo boolean not null default false,
  columna_at text,                             -- timestamp que toca la transición (§4.1); null = ninguno
  modo_at text constraint transiciones_estado_modo_at_chk check (modo_at in ('PRIMERA', 'SIEMPRE', 'LIMPIAR')),
  descripcion text not null,
  primary key (entidad, desde, hacia, actor),
  constraint transiciones_estado_permiso_chk check ((actor = 'SISTEMA') = (permiso is null)),
  constraint transiciones_estado_columna_chk check ((columna_at is null) = (modo_at is null)),
  constraint transiciones_estado_auto_chk check (desde <> hacia or entidad = 'medios')
);
create index transiciones_estado_permiso_idx on private.transiciones_estado (permiso);

insert into private.transiciones_estado (entidad, desde, hacia, actor, permiso, requiere_motivo, columna_at, modo_at, descripcion) values
  -- perfiles (§4.2; las filas ADMIN exigen además private.puede_gestionar)
  ('perfiles', 'INVITADO', 'ACTIVO', 'SISTEMA', null, false, 'activado_at', 'PRIMERA', 'Activación al confirmar el enlace de invitación'),
  ('perfiles', 'INVITADO', 'ACTIVO', 'ADMIN', 'usuarios.invitar', false, 'activado_at', 'PRIMERA', 'Alta con contraseña temporal'),
  ('perfiles', 'INVITADO', 'DESACTIVADO', 'ADMIN', 'usuarios.invitar', true, 'desactivado_at', 'SIEMPRE', 'Revocar la invitación'),
  ('perfiles', 'ACTIVO', 'SUSPENDIDO', 'ADMIN', 'usuarios.suspender', true, 'suspendido_at', 'SIEMPRE', 'Suspender la cuenta'),
  ('perfiles', 'SUSPENDIDO', 'ACTIVO', 'ADMIN', 'usuarios.suspender', true, 'activado_at', 'PRIMERA', 'Reactivar la cuenta'),
  ('perfiles', 'ACTIVO', 'DESACTIVADO', 'ADMIN', 'usuarios.eliminar', true, 'desactivado_at', 'SIEMPRE', 'Desactivar la cuenta (baja lógica)'),
  ('perfiles', 'SUSPENDIDO', 'DESACTIVADO', 'ADMIN', 'usuarios.eliminar', true, 'desactivado_at', 'SIEMPRE', 'Desactivar una cuenta suspendida'),
  ('perfiles', 'DESACTIVADO', 'INVITADO', 'ADMIN', 'usuarios.invitar', true, null, null, 'Volver a invitar'),
  -- anunciantes (columna estado_verificacion)
  ('anunciantes', 'PENDIENTE', 'VERIFICADO', 'ADMIN', 'anunciantes.verificar', false, 'verificado_at', 'PRIMERA', 'Verificar el anunciante'),
  ('anunciantes', 'PENDIENTE', 'RECHAZADO', 'ADMIN', 'anunciantes.verificar', true, 'rechazado_at', 'SIEMPRE', 'Rechazar la verificación'),
  ('anunciantes', 'RECHAZADO', 'PENDIENTE', 'ANUNCIANTE', 'anunciantes.editar_propio', false, null, null, 'Reenviar a verificación'),
  ('anunciantes', 'VERIFICADO', 'SUSPENDIDO', 'ADMIN', 'anunciantes.suspender', true, 'suspendido_at', 'SIEMPRE', 'Suspender el anunciante'),
  ('anunciantes', 'SUSPENDIDO', 'VERIFICADO', 'ADMIN', 'anunciantes.suspender', true, null, null, 'Reactivar el anunciante'),
  -- medios (estado + nivel_verificacion)
  ('medios', 'PENDIENTE', 'VERIFICADO', 'ADMIN', 'medios.verificar', false, 'verificado_at', 'PRIMERA', 'Verificar el medio en un nivel'),
  ('medios', 'PENDIENTE', 'RECHAZADO', 'ADMIN', 'medios.verificar', true, 'rechazado_at', 'SIEMPRE', 'Rechazar la verificación'),
  ('medios', 'RECHAZADO', 'PENDIENTE', 'MEDIO', 'medios.editar_propio', false, null, null, 'Reenviar a verificación'),
  ('medios', 'VERIFICADO', 'VERIFICADO', 'ADMIN', 'medios.verificar', true, null, null, 'Cambiar el nivel de verificación'),
  ('medios', 'VERIFICADO', 'SUSPENDIDO', 'ADMIN', 'medios.suspender', true, 'suspendido_at', 'SIEMPRE', 'Suspender el medio'),
  ('medios', 'SUSPENDIDO', 'VERIFICADO', 'ADMIN', 'medios.suspender', true, null, null, 'Reactivar el medio (conserva el nivel)'),
  -- documentos (estado_validacion)
  ('documentos_medio', 'PENDIENTE', 'APROBADO', 'ADMIN', 'medios.verificar', false, 'validado_at', 'SIEMPRE', 'Aprobar el documento'),
  ('documentos_medio', 'PENDIENTE', 'RECHAZADO', 'ADMIN', 'medios.verificar', true, 'validado_at', 'SIEMPRE', 'Rechazar el documento'),
  ('documentos_medio', 'APROBADO', 'VENCIDO', 'SISTEMA', null, false, null, null, 'Vencimiento del documento (cron)'),
  ('documentos_anunciante', 'PENDIENTE', 'APROBADO', 'ADMIN', 'anunciantes.verificar', false, 'validado_at', 'SIEMPRE', 'Aprobar el documento'),
  ('documentos_anunciante', 'PENDIENTE', 'RECHAZADO', 'ADMIN', 'anunciantes.verificar', true, 'validado_at', 'SIEMPRE', 'Rechazar el documento'),
  ('documentos_anunciante', 'APROBADO', 'VENCIDO', 'SISTEMA', null, false, null, null, 'Vencimiento del documento (cron)'),
  -- verificaciones de cuenta, publicaciones y métricas (estado_validacion)
  ('verificaciones_cuenta', 'PENDIENTE', 'APROBADA', 'ADMIN', 'medios.verificar', false, 'validada_at', 'SIEMPRE', 'Aprobar la verificación de la cuenta'),
  ('verificaciones_cuenta', 'PENDIENTE', 'RECHAZADA', 'ADMIN', 'medios.verificar', true, 'validada_at', 'SIEMPRE', 'Rechazar la verificación de la cuenta'),
  ('publicaciones', 'PENDIENTE', 'APROBADA', 'ADMIN', 'evidencias.validar', false, 'validada_at', 'SIEMPRE', 'Aprobar la evidencia (etiqueta verificada)'),
  ('publicaciones', 'PENDIENTE', 'RECHAZADA', 'ADMIN', 'evidencias.validar', true, 'validada_at', 'SIEMPRE', 'Rechazar la evidencia'),
  ('publicaciones', 'RECHAZADA', 'PENDIENTE', 'MEDIO', 'asignaciones.ejecutar', false, null, null, 'Nueva evidencia (registrar_evidencia_srv)'),
  ('metricas', 'PENDIENTE', 'APROBADA', 'ADMIN', 'metricas.validar', false, 'validada_at', 'SIEMPRE', 'Aprobar la métrica'),
  ('metricas', 'PENDIENTE', 'RECHAZADA', 'ADMIN', 'metricas.validar', true, 'validada_at', 'SIEMPRE', 'Rechazar la métrica'),
  ('metricas', 'RECHAZADA', 'PENDIENTE', 'MEDIO', 'asignaciones.ejecutar', false, null, null, 'Corrección del medio (trigger de edición)'),
  ('metricas', 'APROBADA', 'PENDIENTE', 'ADMIN', 'metricas.editar_validadas', true, null, null, 'Reabrir una métrica validada'),
  -- campañas
  ('campanas', 'NUEVO', 'BORRADOR', 'ANUNCIANTE', 'campanas.gestionar_propias', false, null, null, 'Crear la campaña'),
  ('campanas', 'NUEVO', 'BORRADOR', 'ADMIN', 'campanas.gestionar', false, null, null, 'Crear la campaña por cuenta del anunciante'),
  ('campanas', 'BORRADOR', 'ACTIVA', 'ANUNCIANTE', 'campanas.gestionar_propias', false, 'activada_at', 'PRIMERA', 'Activar (anunciante verificado)'),
  ('campanas', 'BORRADOR', 'ACTIVA', 'ADMIN', 'campanas.gestionar', false, 'activada_at', 'PRIMERA', 'Activar la campaña'),
  ('campanas', 'BORRADOR', 'CANCELADA', 'ANUNCIANTE', 'campanas.gestionar_propias', false, 'cancelada_at', 'SIEMPRE', 'Cancelar el borrador'),
  ('campanas', 'BORRADOR', 'CANCELADA', 'ADMIN', 'campanas.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar el borrador'),
  ('campanas', 'ACTIVA', 'CANCELADA', 'ANUNCIANTE', 'campanas.gestionar_propias', true, 'cancelada_at', 'SIEMPRE', 'Cancelar sin asignaciones con cupo (cascada a ofertas)'),
  ('campanas', 'ACTIVA', 'CANCELADA', 'ADMIN', 'campanas.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar sin asignaciones con cupo (cascada a ofertas)'),
  ('campanas', 'ACTIVA', 'FINALIZADA', 'SISTEMA', null, false, 'finalizada_at', 'SIEMPRE', 'Cierre automático (cron)'),
  ('campanas', 'ACTIVA', 'FINALIZADA', 'ADMIN', 'campanas.gestionar', true, 'finalizada_at', 'SIEMPRE', 'Cierre manual (ofertas cerradas o canceladas)'),
  -- ofertas
  ('ofertas', 'NUEVO', 'BORRADOR', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, null, null, 'Crear la oferta'),
  ('ofertas', 'NUEVO', 'BORRADOR', 'ADMIN', 'ofertas.gestionar', false, null, null, 'Crear la oferta por cuenta del anunciante'),
  ('ofertas', 'BORRADOR', 'EN_REVISION', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, 'enviada_at', 'SIEMPRE', 'Enviar a revisión'),
  ('ofertas', 'BORRADOR', 'EN_REVISION', 'ADMIN', 'ofertas.gestionar', false, 'enviada_at', 'SIEMPRE', 'Enviar a revisión'),
  ('ofertas', 'BORRADOR', 'CANCELADA', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, 'cancelada_at', 'SIEMPRE', 'Cancelar el borrador'),
  ('ofertas', 'BORRADOR', 'CANCELADA', 'ADMIN', 'ofertas.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar el borrador'),
  ('ofertas', 'EN_REVISION', 'BORRADOR', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, null, null, 'Retirar de revisión para editar (D12)'),
  ('ofertas', 'EN_REVISION', 'PUBLICADA', 'ADMIN', 'ofertas.moderar', false, 'publicada_at', 'PRIMERA', 'Publicar en el marketplace'),
  ('ofertas', 'EN_REVISION', 'DEVUELTA', 'ADMIN', 'ofertas.moderar', true, 'devuelta_at', 'SIEMPRE', 'Devolver con comentarios'),
  ('ofertas', 'EN_REVISION', 'CANCELADA', 'ADMIN', 'ofertas.moderar', true, 'cancelada_at', 'SIEMPRE', 'Rechazo de moderación (D12)'),
  ('ofertas', 'DEVUELTA', 'EN_REVISION', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, 'enviada_at', 'SIEMPRE', 'Reenviar a revisión'),
  ('ofertas', 'DEVUELTA', 'CANCELADA', 'ANUNCIANTE', 'ofertas.gestionar_propias', false, 'cancelada_at', 'SIEMPRE', 'Cancelar la oferta devuelta'),
  ('ofertas', 'DEVUELTA', 'CANCELADA', 'ADMIN', 'ofertas.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar la oferta devuelta'),
  ('ofertas', 'PUBLICADA', 'CUPOS_COMPLETOS', 'SISTEMA', null, false, 'cupos_completos_at', 'SIEMPRE', 'Cupos llenos antes de la ventana (reservar_cupo)'),
  ('ofertas', 'PUBLICADA', 'EN_EJECUCION', 'SISTEMA', null, false, 'en_ejecucion_at', 'PRIMERA', 'Inicio de la ventana con asignaciones (cron)'),
  ('ofertas', 'PUBLICADA', 'VENCIDA', 'SISTEMA', null, false, 'vencida_at', 'SIEMPRE', 'Fecha límite sin asignaciones (cron)'),
  ('ofertas', 'PUBLICADA', 'CANCELADA', 'ANUNCIANTE', 'ofertas.gestionar_propias', true, 'cancelada_at', 'SIEMPRE', 'Cancelar sin asignaciones con cupo'),
  ('ofertas', 'PUBLICADA', 'CANCELADA', 'ADMIN', 'ofertas.moderar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar sin asignaciones con cupo'),
  ('ofertas', 'BORRADOR', 'CANCELADA', 'SISTEMA', null, false, 'cancelada_at', 'SIEMPRE', 'Cascada de la cancelación de la campaña'),
  ('ofertas', 'EN_REVISION', 'CANCELADA', 'SISTEMA', null, false, 'cancelada_at', 'SIEMPRE', 'Cascada de la cancelación de la campaña'),
  ('ofertas', 'DEVUELTA', 'CANCELADA', 'SISTEMA', null, false, 'cancelada_at', 'SIEMPRE', 'Cascada de la cancelación de la campaña'),
  ('ofertas', 'PUBLICADA', 'CANCELADA', 'SISTEMA', null, false, 'cancelada_at', 'SIEMPRE', 'Cascada de la cancelación de la campaña'),
  ('ofertas', 'CUPOS_COMPLETOS', 'PUBLICADA', 'SISTEMA', null, false, null, null, 'Se liberó un cupo antes de la ventana (D5)'),
  ('ofertas', 'CUPOS_COMPLETOS', 'EN_EJECUCION', 'SISTEMA', null, false, 'en_ejecucion_at', 'PRIMERA', 'Inicio de la ventana (cron)'),
  ('ofertas', 'EN_EJECUCION', 'CERRADA', 'SISTEMA', null, false, 'cerrada_at', 'SIEMPRE', 'Cierre tras la ventana (cron)'),
  ('ofertas', 'VENCIDA', 'CERRADA', 'SISTEMA', null, false, 'cerrada_at', 'SIEMPRE', 'Cierre tras la ventana (cron)'),
  -- asignaciones
  ('asignaciones', 'NUEVO', 'ACEPTADA', 'MEDIO', 'ofertas.aceptar', false, null, null, 'Aceptar la oferta (reservar_cupo_srv)'),
  ('asignaciones', 'NUEVO', 'RECHAZADA', 'MEDIO', 'ofertas.aceptar', false, null, null, 'Rechazar la oferta desde el marketplace'),
  ('asignaciones', 'ACEPTADA', 'RECHAZADA', 'MEDIO', 'ofertas.aceptar', true, 'rechazada_at', 'SIEMPRE', 'Desistir antes de descargar (D9)'),
  ('asignaciones', 'ACEPTADA', 'CONTENIDO_ENTREGADO', 'MEDIO', 'asignaciones.ejecutar', false, 'contenido_descargado_at', 'PRIMERA', 'Primera descarga del creativo'),
  ('asignaciones', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'MEDIO', 'asignaciones.ejecutar', false, 'publicada_at', 'PRIMERA', 'Evidencia de todas las publicaciones'),
  ('asignaciones', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'ADMIN', 'evidencias.validar', false, 'evidencia_validada_at', 'PRIMERA', 'Validar la evidencia'),
  ('asignaciones', 'PUBLICADA', 'CONTENIDO_ENTREGADO', 'ADMIN', 'evidencias.validar', true, 'publicada_at', 'LIMPIAR', 'Evidencia rechazada: el medio la vuelve a cargar'),
  ('asignaciones', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS', 'SISTEMA', null, false, 'metricas_cargadas_at', 'PRIMERA', 'Todos los cortes cargados (evaluar_metricas_cargadas)'),
  ('asignaciones', 'METRICAS_CARGADAS', 'EVIDENCIA_VALIDADA', 'ADMIN', 'metricas.validar', true, null, null, 'Métricas rechazadas'),
  ('asignaciones', 'METRICAS_CARGADAS', 'VERIFICADA', 'ADMIN', 'metricas.validar', false, 'verificada_at', 'PRIMERA', 'Verificar (puerta a pago)'),
  ('asignaciones', 'VERIFICADA', 'LIQUIDADA', 'ADMIN', 'liquidaciones.generar', false, 'liquidada_at', 'SIEMPRE', 'Incluir en una liquidación'),
  ('asignaciones', 'LIQUIDADA', 'VERIFICADA', 'ADMIN', 'liquidaciones.aprobar', true, 'liquidada_at', 'LIMPIAR', 'Anulación de la liquidación'),
  ('asignaciones', 'LIQUIDADA', 'PAGADA', 'ADMIN', 'liquidaciones.registrar_pago', false, 'pagada_at', 'SIEMPRE', 'Pago de la liquidación'),
  ('asignaciones', 'ACEPTADA', 'VENCIDA_SIN_PUBLICAR', 'SISTEMA', null, false, 'vencida_at', 'SIEMPRE', 'Venció la fecha límite de publicación (cron)'),
  ('asignaciones', 'CONTENIDO_ENTREGADO', 'VENCIDA_SIN_PUBLICAR', 'SISTEMA', null, false, 'vencida_at', 'SIEMPRE', 'Venció la fecha límite de publicación (cron)'),
  ('asignaciones', 'PUBLICADA', 'EN_DISPUTA', 'MEDIO', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'PUBLICADA', 'EN_DISPUTA', 'ANUNCIANTE', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'PUBLICADA', 'EN_DISPUTA', 'ADMIN', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'EVIDENCIA_VALIDADA', 'EN_DISPUTA', 'MEDIO', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'EVIDENCIA_VALIDADA', 'EN_DISPUTA', 'ANUNCIANTE', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'EVIDENCIA_VALIDADA', 'EN_DISPUTA', 'ADMIN', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'METRICAS_CARGADAS', 'EN_DISPUTA', 'MEDIO', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'METRICAS_CARGADAS', 'EN_DISPUTA', 'ANUNCIANTE', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'METRICAS_CARGADAS', 'EN_DISPUTA', 'ADMIN', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'VERIFICADA', 'EN_DISPUTA', 'MEDIO', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'VERIFICADA', 'EN_DISPUTA', 'ANUNCIANTE', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'VERIFICADA', 'EN_DISPUTA', 'ADMIN', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Abrir disputa'),
  ('asignaciones', 'VENCIDA_SIN_PUBLICAR', 'EN_DISPUTA', 'MEDIO', 'disputas.abrir', true, 'en_disputa_at', 'SIEMPRE', 'Reclamo de una vencida (sin cupo)'),
  ('asignaciones', 'EN_DISPUTA', 'PUBLICADA', 'ADMIN', 'disputas.resolver', true, null, null, 'Restaurar (previo PUBLICADA)'),
  ('asignaciones', 'EN_DISPUTA', 'EVIDENCIA_VALIDADA', 'ADMIN', 'disputas.resolver', true, null, null, 'Restaurar (previo EVIDENCIA_VALIDADA)'),
  ('asignaciones', 'EN_DISPUTA', 'METRICAS_CARGADAS', 'ADMIN', 'disputas.resolver', true, null, null, 'Restaurar (previo METRICAS_CARGADAS)'),
  ('asignaciones', 'EN_DISPUTA', 'VERIFICADA', 'ADMIN', 'disputas.resolver', true, 'verificada_at', 'PRIMERA', 'A favor del medio'),
  ('asignaciones', 'EN_DISPUTA', 'VENCIDA_SIN_PUBLICAR', 'ADMIN', 'disputas.resolver', true, null, null, 'Restaurar la vencida (el reclamo no prospera)'),
  ('asignaciones', 'EN_DISPUTA', 'CONTENIDO_ENTREGADO', 'ADMIN', 'disputas.resolver', true, null, null, 'Reabrir la vencida (re-consume cupo)'),
  ('asignaciones', 'EN_DISPUTA', 'CANCELADA', 'ADMIN', 'disputas.resolver', true, 'cancelada_at', 'SIEMPRE', 'A favor del anunciante'),
  ('asignaciones', 'ACEPTADA', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  ('asignaciones', 'CONTENIDO_ENTREGADO', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  ('asignaciones', 'PUBLICADA', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  ('asignaciones', 'EVIDENCIA_VALIDADA', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  ('asignaciones', 'METRICAS_CARGADAS', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  ('asignaciones', 'VERIFICADA', 'CANCELADA', 'ADMIN', 'asignaciones.gestionar', true, 'cancelada_at', 'SIEMPRE', 'Cancelar con causa'),
  -- liquidaciones (D21)
  ('liquidaciones', 'NUEVO', 'BORRADOR', 'ADMIN', 'liquidaciones.generar', false, null, null, 'Generar la liquidación'),
  ('liquidaciones', 'BORRADOR', 'APROBADA', 'ADMIN', 'liquidaciones.aprobar', false, 'aprobada_at', 'SIEMPRE', 'Aprobar (segregación D17)'),
  ('liquidaciones', 'BORRADOR', 'ANULADA', 'ADMIN', 'liquidaciones.aprobar', true, 'anulada_at', 'SIEMPRE', 'Anular el borrador'),
  ('liquidaciones', 'APROBADA', 'PAGADA', 'ADMIN', 'liquidaciones.registrar_pago', false, 'pagada_at', 'SIEMPRE', 'Registrar el pago con soporte'),
  ('liquidaciones', 'APROBADA', 'ANULADA', 'ADMIN', 'liquidaciones.aprobar', true, 'anulada_at', 'SIEMPRE', 'Anular la liquidación aprobada'),
  -- documentos soporte (D22)
  ('documentos_soporte', 'NUEVO', 'BORRADOR', 'SISTEMA', null, false, null, null, 'Borrador sin número'),
  ('documentos_soporte', 'BORRADOR', 'EMITIDO', 'ADMIN', 'liquidaciones.aprobar', false, 'emitido_at', 'SIEMPRE', 'Emitir con consecutivo DIAN'),
  ('documentos_soporte', 'BORRADOR', 'ANULADO', 'ADMIN', 'liquidaciones.aprobar', true, 'anulado_at', 'SIEMPRE', 'Anular el borrador (no consume número)'),
  ('documentos_soporte', 'BORRADOR', 'ANULADO', 'SISTEMA', null, false, 'anulado_at', 'SIEMPRE', 'Efecto de anular la liquidación'),
  ('documentos_soporte', 'EMITIDO', 'ANULADO', 'ADMIN', 'liquidaciones.aprobar', true, 'anulado_at', 'SIEMPRE', 'Anular el documento emitido'),
  ('documentos_soporte', 'EMITIDO', 'ANULADO', 'SISTEMA', null, false, 'anulado_at', 'SIEMPRE', 'Efecto de anular la liquidación'),
  -- facturas (D23)
  ('facturas', 'NUEVO', 'BORRADOR', 'ADMIN', 'facturas.gestionar', false, null, null, 'Crear el borrador'),
  ('facturas', 'BORRADOR', 'EMITIDA', 'ADMIN', 'facturas.gestionar', false, 'emitida_at', 'SIEMPRE', 'Emitir con consecutivo DIAN'),
  ('facturas', 'BORRADOR', 'ANULADA', 'ADMIN', 'facturas.gestionar', true, 'anulada_at', 'SIEMPRE', 'Anular el borrador'),
  ('facturas', 'EMITIDA', 'PAGADA_PARCIAL', 'SISTEMA', null, false, null, null, 'Pago parcial'),
  ('facturas', 'EMITIDA', 'PAGADA', 'SISTEMA', null, false, 'pagada_at', 'SIEMPRE', 'Pago total'),
  ('facturas', 'EMITIDA', 'VENCIDA', 'SISTEMA', null, false, 'vencida_at', 'SIEMPRE', 'Vencimiento con saldo (cron)'),
  ('facturas', 'EMITIDA', 'ANULADA', 'ADMIN', 'facturas.gestionar', true, 'anulada_at', 'SIEMPRE', 'Anular sin pagos registrados'),
  ('facturas', 'PAGADA_PARCIAL', 'PAGADA', 'SISTEMA', null, false, 'pagada_at', 'SIEMPRE', 'Pago total'),
  ('facturas', 'PAGADA_PARCIAL', 'VENCIDA', 'SISTEMA', null, false, 'vencida_at', 'SIEMPRE', 'Vencimiento con saldo (cron)'),
  ('facturas', 'VENCIDA', 'PAGADA_PARCIAL', 'SISTEMA', null, false, null, null, 'Pago parcial de una vencida'),
  ('facturas', 'VENCIDA', 'PAGADA', 'SISTEMA', null, false, 'pagada_at', 'SIEMPRE', 'Pago total de una vencida'),
  -- disputas (D24)
  ('disputas', 'NUEVO', 'ABIERTA', 'MEDIO', 'disputas.abrir', true, null, null, 'Abrir disputa'),
  ('disputas', 'NUEVO', 'ABIERTA', 'ANUNCIANTE', 'disputas.abrir', true, null, null, 'Abrir disputa'),
  ('disputas', 'NUEVO', 'ABIERTA', 'ADMIN', 'disputas.abrir', true, null, null, 'Abrir disputa'),
  ('disputas', 'ABIERTA', 'EN_REVISION', 'ADMIN', 'disputas.resolver', false, null, null, 'Tomar en revisión'),
  ('disputas', 'ABIERTA', 'RESUELTA', 'ADMIN', 'disputas.resolver', true, 'fecha_resolucion', 'SIEMPRE', 'Resolver'),
  ('disputas', 'EN_REVISION', 'RESUELTA', 'ADMIN', 'disputas.resolver', true, 'fecha_resolucion', 'SIEMPRE', 'Resolver'),
  ('disputas', 'ABIERTA', 'DESCARTADA', 'ADMIN', 'disputas.resolver', true, 'fecha_resolucion', 'SIEMPRE', 'Descartar (restaura el estado previo)'),
  ('disputas', 'EN_REVISION', 'DESCARTADA', 'ADMIN', 'disputas.resolver', true, 'fecha_resolucion', 'SIEMPRE', 'Descartar (restaura el estado previo)');

-- 3. Tablas

create table public.campanas (
  id uuid primary key default private.uuid_v7(),
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  nombre text not null constraint campanas_nombre_chk check (char_length(nombre) between 3 and 120),
  objetivo text constraint campanas_objetivo_chk check (char_length(objetivo) <= 500),
  marca text not null constraint campanas_marca_chk check (char_length(marca) between 1 and 80),
  fecha_inicio date not null,
  fecha_fin date not null,
  presupuesto_total numeric(14,2) not null constraint campanas_presupuesto_total_chk check (presupuesto_total > 0),
  presupuesto_comprometido numeric(14,2) not null default 0,                     -- contador (solo procedimientos)
  estado public.campana_estado not null default 'BORRADOR',
  activada_at timestamptz,
  finalizada_at timestamptz,
  cancelada_at timestamptz,
  creada_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  constraint campanas_fechas_chk check (fecha_fin >= fecha_inicio),
  constraint campanas_presupuesto_comprometido_chk check (presupuesto_comprometido between 0 and presupuesto_total)
);
create index campanas_anunciante_created_idx on public.campanas (anunciante_id, created_at desc);
create index campanas_creada_por_idx on public.campanas (creada_por);
create index campanas_estado_idx on public.campanas (estado) where deleted_at is null;
create index campanas_es_demo_idx on public.campanas (es_demo) where es_demo;
create index campanas_nombre_trgm_idx on public.campanas using gin (private.normalizar_texto(nombre) extensions.gin_trgm_ops);

-- D2: una oferta = un formato = una plataforma.
create table public.ofertas (
  id uuid primary key default private.uuid_v7(),
  campana_id uuid not null references public.campanas (id) on delete restrict,
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,   -- copiado de la campaña (RLS)
  titulo text not null constraint ofertas_titulo_chk check (char_length(titulo) between 3 and 120),
  formato_id uuid not null,
  plataforma public.plataforma not null,
  publicaciones_por_medio smallint not null default 1
    constraint ofertas_publicaciones_chk check (publicaciones_por_medio between 1 and 10),
  permite_multiples_cupos boolean not null default false,
  presupuesto_maximo numeric(14,2) not null constraint ofertas_presupuesto_maximo_chk check (presupuesto_maximo > 0),
  presupuesto_comprometido numeric(14,2) not null default 0,                     -- contador
  tope_porcentaje_por_medio numeric(5,4) not null                                -- default de configuración (trigger)
    constraint ofertas_tope_chk check (tope_porcentaje_por_medio > 0 and tope_porcentaje_por_medio <= 1),
  cupos_totales integer not null default 0,                                      -- = Σ oferta_cupos (trigger)
  cupos_ocupados integer not null default 0,                                     -- contador
  departamentos_objetivo char(2)[] not null default '{}',
  municipios_objetivo char(5)[] not null default '{}',
  categorias_objetivo uuid[] not null default '{}',
  seguidores_minimos integer constraint ofertas_seguidores_minimos_chk check (seguidores_minimos is null or seguidores_minimos >= 0),
  medios_excluidos uuid[] not null default '{}',
  ventana_inicio timestamptz not null,
  ventana_fin timestamptz not null,
  fecha_limite_aceptacion timestamptz not null,
  permanencia_minima_dias smallint not null default 7
    constraint ofertas_permanencia_chk check (permanencia_minima_dias between 0 and 365),
  exclusividad_dias smallint constraint ofertas_exclusividad_chk check (exclusividad_dias is null or exclusividad_dias between 0 and 90),
  cortes_requeridos public.corte_metrica[] not null,                             -- default de configuración (trigger)
  instrucciones text constraint ofertas_instrucciones_chk check (char_length(instrucciones) <= 4000),
  restricciones text constraint ofertas_restricciones_chk check (char_length(restricciones) <= 4000),
  estado public.oferta_estado not null default 'BORRADOR',
  comentario_moderacion text constraint ofertas_comentario_chk check (char_length(comentario_moderacion) <= 2000),
  moderada_por uuid references public.perfiles (id) on delete set null,
  enviada_at timestamptz,
  devuelta_at timestamptz,
  publicada_at timestamptz,
  cupos_completos_at timestamptz,
  en_ejecucion_at timestamptz,
  vencida_at timestamptz,
  cerrada_at timestamptz,
  cancelada_at timestamptz,
  llena_at timestamptz,
  creada_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  constraint ofertas_formato_fkey foreign key (formato_id, plataforma)
    references public.formatos (id, plataforma) on delete restrict,
  constraint ofertas_ventana_chk check (ventana_fin > ventana_inicio),
  constraint ofertas_fecha_limite_chk check (fecha_limite_aceptacion <= ventana_fin),
  constraint ofertas_presupuesto_comprometido_chk check (presupuesto_comprometido between 0 and presupuesto_maximo),
  constraint ofertas_cupos_totales_chk check (cupos_totales >= 0),
  constraint ofertas_cupos_ocupados_chk check (cupos_ocupados between 0 and cupos_totales),
  constraint ofertas_cortes_chk check (cardinality(cortes_requeridos) >= 1 and not ('PERSONALIZADO' = any (cortes_requeridos))),
  constraint ofertas_segmentacion_chk check (cardinality(departamentos_objetivo) <= 40 and cardinality(municipios_objetivo) <= 1200
    and cardinality(categorias_objetivo) <= 100 and cardinality(medios_excluidos) <= 2000)
);
create index ofertas_campana_id_idx on public.ofertas (campana_id);
create index ofertas_anunciante_created_idx on public.ofertas (anunciante_id, created_at desc);
create index ofertas_formato_plataforma_idx on public.ofertas (formato_id, plataforma);
create index ofertas_moderada_por_idx on public.ofertas (moderada_por);
create index ofertas_creada_por_idx on public.ofertas (creada_por);
create index ofertas_estado_fecha_limite_idx on public.ofertas (estado, fecha_limite_aceptacion) where deleted_at is null;
create index ofertas_marketplace_idx on public.ofertas (plataforma, fecha_limite_aceptacion)
  where estado in ('PUBLICADA', 'EN_EJECUCION') and deleted_at is null;
create index ofertas_departamentos_objetivo_idx on public.ofertas using gin (departamentos_objetivo);
create index ofertas_municipios_objetivo_idx on public.ofertas using gin (municipios_objetivo);
create index ofertas_categorias_objetivo_idx on public.ofertas using gin (categorias_objetivo);
create index ofertas_publicada_at_idx on public.ofertas (publicada_at) where publicada_at is not null;
create index ofertas_enviada_at_idx on public.ofertas (enviada_at) where enviada_at is not null;

create table public.oferta_cupos (
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  franja_id uuid not null references public.franjas (id) on delete restrict,
  cupos_totales smallint not null constraint oferta_cupos_totales_chk check (cupos_totales between 1 and 500),
  cupos_ocupados smallint not null default 0,                                    -- contador (solo procedimientos)
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  primary key (oferta_id, franja_id),
  constraint oferta_cupos_ocupados_chk check (cupos_ocupados between 0 and cupos_totales)
);
create index oferta_cupos_franja_id_idx on public.oferta_cupos (franja_id);

-- Denominador de la tasa de aceptación (pares oferta × medio).
create table public.oferta_vistas (
  id bigint generated always as identity primary key,
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  medio_id uuid not null references public.medios (id) on delete cascade,
  primera_vista_at timestamptz not null default private.ahora(),
  ultima_vista_at timestamptz not null default private.ahora(),
  veces integer not null default 1 constraint oferta_vistas_veces_chk check (veces >= 1),
  constraint oferta_vistas_oferta_medio_key unique (oferta_id, medio_id)
);
create index oferta_vistas_medio_id_idx on public.oferta_vistas (medio_id);
create index oferta_vistas_primera_vista_brin on public.oferta_vistas using brin (primera_vista_at);

-- Paquete creativo versionado: un solo creativo vigente por oferta.
create table public.creativos (
  id uuid primary key default private.uuid_v7(),
  oferta_id uuid not null references public.ofertas (id) on delete restrict,
  tipo public.creativo_tipo not null,
  copy_sugerido text constraint creativos_copy_chk check (char_length(copy_sugerido) <= 2200),
  hashtags text[] not null default '{}' constraint creativos_hashtags_chk check (cardinality(hashtags) <= 30),
  menciones text[] not null default '{}' constraint creativos_menciones_chk check (cardinality(menciones) <= 20),
  enlace_destino text constraint creativos_enlace_chk check (enlace_destino ~ '^https://' and char_length(enlace_destino) <= 2000),
  version integer not null default 1 constraint creativos_version_chk check (version >= 1),
  reemplaza_a uuid references public.creativos (id) on delete set null,
  vigente boolean not null default true,
  creado_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint creativos_oferta_version_key unique (oferta_id, version)
);
create unique index creativos_vigente_key on public.creativos (oferta_id) where vigente;
create index creativos_reemplaza_a_idx on public.creativos (reemplaza_a);
create index creativos_creado_por_idx on public.creativos (creado_por);

create table public.creativo_archivos (
  id uuid primary key default private.uuid_v7(),
  creativo_id uuid not null references public.creativos (id) on delete cascade,
  archivo_path text not null,                     -- bucket creativos: oferta/{oferta_id}/{creativo_id}/… (trigger)
  mime text not null constraint creativo_archivos_mime_chk check (mime in ('image/jpeg', 'image/png', 'image/webp',
    'image/gif', 'video/mp4', 'video/quicktime')),
  tamano_bytes bigint not null constraint creativo_archivos_tamano_chk check (tamano_bytes > 0),
  ancho integer constraint creativo_archivos_ancho_chk check (ancho > 0),
  alto integer constraint creativo_archivos_alto_chk check (alto > 0),
  duracion_segundos numeric(8,2) constraint creativo_archivos_duracion_chk check (duracion_segundos >= 0),
  orden smallint not null default 0 constraint creativo_archivos_orden_chk check (orden between 0 and 50),
  sha256 text constraint creativo_archivos_sha256_chk check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default private.ahora()
);
create index creativo_archivos_creativo_orden_idx on public.creativo_archivos (creativo_id, orden);

-- Excepciones de comisión (precedencia: campaña > anunciante > global). Se crea aquí porque referencia campañas.
create table public.comisiones_excepcion (
  id uuid primary key default private.uuid_v7(),
  anunciante_id uuid references public.anunciantes (id) on delete restrict,
  campana_id uuid references public.campanas (id) on delete restrict,
  porcentaje numeric(5,4) not null constraint comisiones_excepcion_porcentaje_chk check (porcentaje between 0 and 0.5),
  vigente_desde timestamptz not null,
  vigente_hasta timestamptz,
  motivo text not null constraint comisiones_excepcion_motivo_chk check (char_length(motivo) between 3 and 500),
  creada_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint comisiones_excepcion_objetivo_chk check (num_nonnulls(anunciante_id, campana_id) = 1),
  constraint comisiones_excepcion_vigencia_chk check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint comisiones_excepcion_anunciante_excl exclude using gist
    (anunciante_id with =, tstzrange(vigente_desde, vigente_hasta, '[)') with &&) where (anunciante_id is not null),
  constraint comisiones_excepcion_campana_excl exclude using gist
    (campana_id with =, tstzrange(vigente_desde, vigente_hasta, '[)') with &&) where (campana_id is not null)
);
create index comisiones_excepcion_anunciante_id_idx on public.comisiones_excepcion (anunciante_id);
create index comisiones_excepcion_campana_id_idx on public.comisiones_excepcion (campana_id);
create index comisiones_excepcion_creada_por_idx on public.comisiones_excepcion (creada_por);

-- Archivo de dispersión bancaria (§7.3.6); append-only.
create table public.dispersiones (
  id uuid primary key default private.uuid_v7(),
  archivo_path text not null,
  cantidad_liquidaciones integer not null constraint dispersiones_cantidad_chk check (cantidad_liquidaciones > 0),
  monto_total numeric(14,2) not null constraint dispersiones_monto_chk check (monto_total > 0),
  generada_por uuid,                               -- sin FK (§3.8)
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  constraint dispersiones_archivo_path_chk check (
    archivo_path like 'dispersion/' || id::text || '/%' and position('..' in archivo_path) = 0)
);
create index dispersiones_created_at_idx on public.dispersiones (created_at desc);
create index dispersiones_generada_por_idx on public.dispersiones (generada_por);
create index dispersiones_es_demo_idx on public.dispersiones (es_demo) where es_demo;

create table public.liquidaciones (
  id uuid primary key default private.uuid_v7(),
  medio_id uuid not null references public.medios (id) on delete restrict,
  periodo_inicio date not null,
  periodo_fin date not null,
  cantidad_asignaciones integer not null default 0 constraint liquidaciones_cantidad_chk check (cantidad_asignaciones >= 0),
  monto_bruto numeric(14,2) not null default 0,
  monto_comision numeric(14,2) not null default 0,
  monto_medio numeric(14,2) not null default 0,
  monto_retenciones numeric(14,2) not null default 0,
  monto_neto numeric(14,2) not null default 0,
  estado public.liquidacion_estado not null default 'BORRADOR',
  requiere_documento_soporte boolean not null,     -- snapshot = not medios_privado.obligado_facturar
  alerta_seg_social boolean not null default false,
  aprobada_por uuid references public.perfiles (id) on delete set null,
  aprobada_at timestamptz,
  pagada_at timestamptz,
  anulada_at timestamptz,
  fecha_pago date,
  referencia_pago text constraint liquidaciones_referencia_chk check (char_length(referencia_pago) <= 120),
  soporte_pago_path text,
  numero_factura_medio text constraint liquidaciones_numero_factura_chk check (char_length(numero_factura_medio) <= 60),
  factura_medio_path text,
  dispersion_id uuid references public.dispersiones (id) on delete restrict,
  creada_por uuid references public.perfiles (id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint liquidaciones_periodo_chk check (periodo_fin >= periodo_inicio),
  constraint liquidaciones_montos_chk check (monto_bruto >= 0 and monto_comision >= 0 and monto_medio >= 0
    and monto_retenciones >= 0),
  constraint liquidaciones_neto_chk check (monto_neto = monto_medio - monto_retenciones),
  constraint liquidaciones_soporte_pago_path_chk check (soporte_pago_path is null
    or (soporte_pago_path like 'liquidacion/' || id::text || '/%' and position('..' in soporte_pago_path) = 0)),
  constraint liquidaciones_factura_medio_path_chk check (factura_medio_path is null
    or (factura_medio_path like 'liquidacion/' || id::text || '/%' and position('..' in factura_medio_path) = 0)),
  constraint liquidaciones_pagada_chk check (estado <> 'PAGADA' or (soporte_pago_path is not null and fecha_pago is not null)),
  constraint liquidaciones_periodo_excl exclude using gist
    (medio_id with =, daterange(periodo_inicio, periodo_fin, '[]') with &&) where (estado <> 'ANULADA')
);
create index liquidaciones_medio_periodo_idx on public.liquidaciones (medio_id, periodo_fin desc);
create index liquidaciones_aprobada_por_idx on public.liquidaciones (aprobada_por);
create index liquidaciones_creada_por_idx on public.liquidaciones (creada_por);
create index liquidaciones_dispersion_id_idx on public.liquidaciones (dispersion_id);
create index liquidaciones_estado_periodo_idx on public.liquidaciones (estado, periodo_fin);
create index liquidaciones_es_demo_idx on public.liquidaciones (es_demo) where es_demo;

-- Documento soporte (§12): el número se toma al EMITIR, nunca en el borrador (sin huecos).
create table public.documentos_soporte (
  id uuid primary key default private.uuid_v7(),
  liquidacion_id uuid not null references public.liquidaciones (id) on delete restrict,
  resolucion_id uuid references public.resoluciones_dian (id) on delete restrict,
  prefijo text,
  consecutivo bigint,
  numero text generated always as (prefijo || consecutivo::text) stored,
  fecha_emision date,
  valor_total numeric(14,2) not null constraint documentos_soporte_valor_chk check (valor_total >= 0),
  cuds text constraint documentos_soporte_cuds_chk check (char_length(cuds) <= 200),
  estado public.documento_soporte_estado not null default 'BORRADOR',
  emitido_at timestamptz,
  anulado_at timestamptz,
  archivo_path text,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint documentos_soporte_numeracion_chk check ((consecutivo is null) = (resolucion_id is null)
    and (consecutivo is null) = (prefijo is null) and (consecutivo is null) = (fecha_emision is null)),
  constraint documentos_soporte_emitido_chk check (estado <> 'EMITIDO' or consecutivo is not null),
  constraint documentos_soporte_borrador_chk check (estado <> 'BORRADOR' or consecutivo is null),
  constraint documentos_soporte_archivo_path_chk check (archivo_path is null
    or (archivo_path like 'documento_soporte/' || id::text || '/%' and position('..' in archivo_path) = 0))
);
create unique index documentos_soporte_liquidacion_key on public.documentos_soporte (liquidacion_id) where estado <> 'ANULADO';
create index documentos_soporte_liquidacion_id_idx on public.documentos_soporte (liquidacion_id);
create unique index documentos_soporte_numero_key on public.documentos_soporte (resolucion_id, consecutivo)
  where consecutivo is not null;
create index documentos_soporte_resolucion_id_idx on public.documentos_soporte (resolucion_id);

-- Facturas plataforma → anunciante.
create table public.facturas (
  id uuid primary key default private.uuid_v7(),
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  campana_id uuid references public.campanas (id) on delete restrict,            -- null = consolidada
  resolucion_id uuid references public.resoluciones_dian (id) on delete restrict,
  prefijo text,
  consecutivo bigint,
  numero text generated always as (prefijo || consecutivo::text) stored,
  periodo_desde date,
  periodo_hasta date,
  fecha_emision date,
  fecha_vencimiento date,
  subtotal numeric(14,2) not null default 0 constraint facturas_subtotal_chk check (subtotal >= 0),
  iva numeric(14,2) not null default 0 constraint facturas_iva_chk check (iva >= 0),
  total numeric(14,2) generated always as (subtotal + iva) stored,
  pagado numeric(14,2) not null default 0,
  saldo numeric(14,2) generated always as (subtotal + iva - pagado) stored,
  estado public.factura_estado not null default 'BORRADOR',
  cufe text constraint facturas_cufe_chk check (char_length(cufe) <= 200),
  archivo_path text,
  emitida_at timestamptz,
  pagada_at timestamptz,
  vencida_at timestamptz,
  anulada_at timestamptz,
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint facturas_pagado_chk check (pagado >= 0 and pagado <= subtotal + iva),
  constraint facturas_vencimiento_chk check (fecha_vencimiento >= fecha_emision),
  constraint facturas_periodo_chk check (periodo_hasta >= periodo_desde),
  constraint facturas_numeracion_chk check ((consecutivo is null) = (resolucion_id is null)
    and (consecutivo is null) = (prefijo is null) and (consecutivo is null) = (fecha_emision is null)),
  constraint facturas_emitida_chk check (estado in ('BORRADOR', 'ANULADA') or consecutivo is not null),
  constraint facturas_borrador_chk check (estado <> 'BORRADOR' or consecutivo is null),
  constraint facturas_archivo_path_chk check (archivo_path is null
    or (archivo_path like 'factura/' || id::text || '/%' and position('..' in archivo_path) = 0))
);
create unique index facturas_numero_key on public.facturas (resolucion_id, consecutivo) where consecutivo is not null;
create index facturas_anunciante_emision_idx on public.facturas (anunciante_id, fecha_emision desc);
create index facturas_campana_id_idx on public.facturas (campana_id);
create index facturas_resolucion_id_idx on public.facturas (resolucion_id);
create index facturas_cartera_idx on public.facturas (estado, fecha_vencimiento) where estado in ('EMITIDA', 'PAGADA_PARCIAL');
create index facturas_es_demo_idx on public.facturas (es_demo) where es_demo;

-- Unidad transaccional con valores de precio CONGELADOS (§8, §10.6). Los montos que el anunciante no ve viven
-- en asignacion_montos (1:1).
create table public.asignaciones (
  id uuid primary key default private.uuid_v7(),
  oferta_id uuid not null references public.ofertas (id) on delete restrict,
  campana_id uuid not null references public.campanas (id) on delete restrict,
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  medio_id uuid not null references public.medios (id) on delete restrict,
  cuenta_social_id uuid references public.cuentas_sociales (id) on delete restrict,
  plataforma public.plataforma not null,
  slot smallint not null default 1 constraint asignaciones_slot_chk check (slot between 1 and 500),
  clave_idempotencia uuid,
  estado public.asignacion_estado not null,
  estado_previo_disputa public.asignacion_estado,
  causa_cancelacion public.cancelacion_causa,
  aceptada_at timestamptz,
  contenido_descargado_at timestamptz,
  publicada_at timestamptz,
  evidencia_validada_at timestamptz,
  metricas_cargadas_at timestamptz,
  verificada_at timestamptz,
  liquidada_at timestamptz,
  pagada_at timestamptz,
  rechazada_at timestamptz,
  vencida_at timestamptz,
  en_disputa_at timestamptz,
  cancelada_at timestamptz,
  metricas_atrasadas_at timestamptz,
  fecha_limite_publicacion timestamptz,
  creativo_descargado_id uuid references public.creativos (id) on delete restrict,
  franja_id uuid references public.franjas (id) on delete restrict,
  franja_clave text,
  seguidores_al_aceptar integer constraint asignaciones_seguidores_chk check (seguidores_al_aceptar >= 0),
  tarifa_id uuid references public.tarifas (id) on delete restrict,
  tarifa_base_aplicada numeric(14,2),
  publicaciones smallint constraint asignaciones_publicaciones_chk check (publicaciones between 1 and 10),
  multiplicador_calidad_aplicado numeric(4,3),
  multiplicador_geografico_aplicado numeric(4,3),
  multiplicador_exclusividad_aplicado numeric(4,3),
  monto_bruto numeric(14,2) constraint asignaciones_monto_bruto_chk check (monto_bruto > 0),
  liquidacion_id uuid references public.liquidaciones (id) on delete restrict,
  factura_id uuid references public.facturas (id) on delete restrict,
  motivo text constraint asignaciones_motivo_chk check (char_length(motivo) <= 1000),
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint asignaciones_precio_chk check ((estado = 'RECHAZADA' and aceptada_at is null)
    or (monto_bruto is not null and tarifa_id is not null and franja_id is not null and cuenta_social_id is not null
        and aceptada_at is not null)),
  constraint asignaciones_liquidacion_chk check (estado not in ('LIQUIDADA', 'PAGADA') or liquidacion_id is not null),
  constraint asignaciones_disputa_chk check ((estado = 'EN_DISPUTA') = (estado_previo_disputa is not null)),
  constraint asignaciones_cancelacion_chk check (estado <> 'CANCELADA' or causa_cancelacion is not null)
);
-- §10.9 un medio, un cupo (slot > 1 solo con permite_multiples_cupos).
create unique index asignaciones_un_cupo_key on public.asignaciones (oferta_id, medio_id, slot)
  where estado not in ('RECHAZADA', 'CANCELADA', 'VENCIDA_SIN_PUBLICAR');
create unique index asignaciones_rechazo_key on public.asignaciones (oferta_id, medio_id)
  where estado = 'RECHAZADA' and aceptada_at is null;
create unique index asignaciones_idempotencia_key on public.asignaciones (clave_idempotencia)
  where clave_idempotencia is not null;
create index asignaciones_oferta_id_idx on public.asignaciones (oferta_id);
create index asignaciones_campana_id_idx on public.asignaciones (campana_id);
create index asignaciones_anunciante_aceptada_idx on public.asignaciones (anunciante_id, aceptada_at);
create index asignaciones_medio_aceptada_idx on public.asignaciones (medio_id, aceptada_at);
create index asignaciones_cuenta_social_id_idx on public.asignaciones (cuenta_social_id);
create index asignaciones_franja_id_idx on public.asignaciones (franja_id);
create index asignaciones_tarifa_id_idx on public.asignaciones (tarifa_id);
create index asignaciones_creativo_descargado_id_idx on public.asignaciones (creativo_descargado_id);
create index asignaciones_liquidacion_id_idx on public.asignaciones (liquidacion_id) where liquidacion_id is not null;
create index asignaciones_factura_id_idx on public.asignaciones (factura_id) where factura_id is not null;
create index asignaciones_vencimiento_idx on public.asignaciones (estado, fecha_limite_publicacion)
  where estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO');
create index asignaciones_medio_estado_idx on public.asignaciones (medio_id, estado);
create index asignaciones_por_liquidar_idx on public.asignaciones (medio_id) where estado = 'VERIFICADA' and liquidacion_id is null;
create index asignaciones_verificada_at_idx on public.asignaciones (verificada_at) where verificada_at is not null;
create index asignaciones_aceptada_at_brin on public.asignaciones using brin (aceptada_at);
create index asignaciones_es_demo_idx on public.asignaciones (es_demo) where es_demo;

create table public.asignacion_montos (
  asignacion_id uuid primary key references public.asignaciones (id) on delete cascade,
  medio_id uuid not null references public.medios (id) on delete restrict,
  monto_bruto numeric(14,2) not null constraint asignacion_montos_bruto_chk check (monto_bruto > 0),
  porcentaje_comision numeric(5,4) not null constraint asignacion_montos_porcentaje_chk check (porcentaje_comision between 0 and 1),
  comision_origen public.comision_origen not null,
  comision_excepcion_id uuid references public.comisiones_excepcion (id) on delete restrict,
  monto_comision numeric(14,2) not null,
  monto_medio numeric(14,2) generated always as (monto_bruto - monto_comision) stored,
  retenciones_aplicadas jsonb constraint asignacion_montos_retenciones_tipo_chk
    check (retenciones_aplicadas is null or jsonb_typeof(retenciones_aplicadas) = 'array'),
  monto_retenciones numeric(14,2) constraint asignacion_montos_monto_retenciones_chk check (monto_retenciones >= 0),
  monto_neto numeric(14,2),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint asignacion_montos_comision_chk check (monto_comision between 0 and monto_bruto),
  constraint asignacion_montos_origen_chk check ((comision_origen = 'GLOBAL') = (comision_excepcion_id is null)),
  constraint asignacion_montos_retenciones_chk check ((retenciones_aplicadas is null) = (monto_retenciones is null)
    and (monto_retenciones is null) = (monto_neto is null)),
  constraint asignacion_montos_neto_chk check (monto_neto is null
    or monto_neto = monto_bruto - monto_comision - monto_retenciones)
);
create index asignacion_montos_medio_id_idx on public.asignacion_montos (medio_id);
create index asignacion_montos_comision_excepcion_id_idx on public.asignacion_montos (comision_excepcion_id);

-- §7.1.4 fecha y hora de cada descarga (D11 con versión); append-only.
create table public.descargas_contenido (
  id bigint generated always as identity primary key,
  asignacion_id uuid not null references public.asignaciones (id) on delete cascade,
  creativo_id uuid not null references public.creativos (id) on delete restrict,
  descargado_at timestamptz not null default private.ahora()
);
create index descargas_contenido_asignacion_idx on public.descargas_contenido (asignacion_id, descargado_at desc);
create index descargas_contenido_creativo_id_idx on public.descargas_contenido (creativo_id);

-- Evidencia de publicación (URL + captura).
create table public.publicaciones (
  id uuid primary key default private.uuid_v7(),
  asignacion_id uuid not null references public.asignaciones (id) on delete restrict,
  anunciante_id uuid not null,                     -- copiado de la asignación (trigger; RLS)
  medio_id uuid not null,                          -- copiado de la asignación (trigger; RLS)
  numero smallint not null default 1 constraint publicaciones_numero_chk check (numero between 1 and 10),
  plataforma public.plataforma not null,           -- copiada
  url_post text not null,
  fecha_publicacion timestamptz not null,
  captura_path text not null,
  miniatura_path text,
  etiqueta_publicidad_confirmada boolean not null default false,
  etiqueta_verificada boolean not null default false,
  permanencia_hasta timestamptz not null,
  permanencia_verificada_at timestamptz,
  retirada_detectada_at timestamptz,
  estado_validacion public.validacion_estado not null default 'PENDIENTE',
  validada_por uuid references public.perfiles (id) on delete set null,
  validada_at timestamptz,
  observaciones text constraint publicaciones_observaciones_chk check (char_length(observaciones) <= 1000),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint publicaciones_asignacion_numero_key unique (asignacion_id, numero),
  constraint publicaciones_url_chk check (char_length(url_post) <= 500 and (
       (plataforma = 'FACEBOOK' and url_post ~* '^https://(www\.|m\.)?(facebook\.com|fb\.watch)/')
    or (plataforma = 'INSTAGRAM' and url_post ~* '^https://(www\.)?instagram\.com/(p|reel|stories)/')
    or (plataforma = 'TIKTOK' and url_post ~* '^https://(www\.|vm\.)?tiktok\.com/'))),
  constraint publicaciones_aprobada_chk check (estado_validacion <> 'APROBADA' or etiqueta_verificada),
  constraint publicaciones_permanencia_chk check (permanencia_hasta >= fecha_publicacion)
);
create index publicaciones_anunciante_id_idx on public.publicaciones (anunciante_id);
create index publicaciones_medio_id_idx on public.publicaciones (medio_id);
create index publicaciones_validada_por_idx on public.publicaciones (validada_por);
create index publicaciones_pendientes_idx on public.publicaciones (created_at) where estado_validacion = 'PENDIENTE';

-- Métricas (§9): una fila por publicación × corte.
create table public.metricas (
  id uuid primary key default private.uuid_v7(),
  publicacion_id uuid not null references public.publicaciones (id) on delete restrict,
  asignacion_id uuid not null references public.asignaciones (id) on delete restrict,     -- derivada (trigger)
  anunciante_id uuid not null,                     -- derivado (trigger; RLS)
  medio_id uuid not null,                          -- derivado (trigger; RLS)
  plataforma public.plataforma not null,           -- derivada
  corte public.corte_metrica not null,
  fecha_corte timestamptz not null,
  periodo_desde timestamptz,
  periodo_hasta timestamptz,
  alcance bigint constraint metricas_alcance_chk check (alcance >= 0),
  impresiones bigint constraint metricas_impresiones_chk check (impresiones >= 0),
  reproducciones bigint constraint metricas_reproducciones_chk check (reproducciones >= 0),
  espectadores_unicos bigint constraint metricas_espectadores_chk check (espectadores_unicos >= 0),
  me_gusta bigint constraint metricas_me_gusta_chk check (me_gusta >= 0),
  comentarios bigint constraint metricas_comentarios_chk check (comentarios >= 0),
  compartidos bigint constraint metricas_compartidos_chk check (compartidos >= 0),
  guardados bigint constraint metricas_guardados_chk check (guardados >= 0),
  clics_enlace bigint constraint metricas_clics_chk check (clics_enlace >= 0),
  visitas_perfil bigint constraint metricas_visitas_chk check (visitas_perfil >= 0),
  tiempo_promedio_visualizacion_s numeric(8,2) constraint metricas_tiempo_chk check (tiempo_promedio_visualizacion_s >= 0),
  porcentaje_reproduccion_completa numeric(5,2)
    constraint metricas_porcentaje_chk check (porcentaje_reproduccion_completa between 0 and 100),
  alcance_norm bigint generated always as (coalesce(alcance, espectadores_unicos)) stored,
  impresiones_norm bigint generated always as (coalesce(impresiones, reproducciones)) stored,
  interacciones bigint generated always as (coalesce(me_gusta, 0) + coalesce(comentarios, 0) + coalesce(compartidos, 0)
                                            + coalesce(guardados, 0)) stored,
  captura_path text not null,
  miniatura_path text,
  fuente public.metrica_fuente not null default 'MANUAL',
  estado_validacion public.validacion_estado not null default 'PENDIENTE',
  alerta_desviacion boolean not null default false,
  alerta_multiplo boolean not null default false,
  detalle_alertas jsonb not null default '{}' constraint metricas_detalle_alertas_chk check (jsonb_typeof(detalle_alertas) = 'object'),
  validada_por uuid,                               -- sin FK (§3.8)
  validada_at timestamptz,
  observaciones text constraint metricas_observaciones_chk check (char_length(observaciones) <= 1000),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint metricas_instagram_chk check (plataforma <> 'INSTAGRAM' or (alcance is not null and impresiones is not null)),
  constraint metricas_facebook_chk check (plataforma <> 'FACEBOOK' or (alcance is not null and impresiones is not null)),
  constraint metricas_tiktok_chk check (plataforma <> 'TIKTOK' or (reproducciones is not null and espectadores_unicos is not null)),
  constraint metricas_personalizado_chk check (corte <> 'PERSONALIZADO' or (periodo_desde is not null and periodo_hasta > periodo_desde))
);
create unique index metricas_corte_key on public.metricas (publicacion_id, corte) where corte <> 'PERSONALIZADO';
create index metricas_publicacion_id_idx on public.metricas (publicacion_id);
create index metricas_asignacion_id_idx on public.metricas (asignacion_id);
create index metricas_aprobadas_idx on public.metricas (asignacion_id, corte)
  include (alcance_norm, impresiones_norm, interacciones, clics_enlace, reproducciones) where estado_validacion = 'APROBADA';
create index metricas_anunciante_id_idx on public.metricas (anunciante_id);
create index metricas_medio_id_idx on public.metricas (medio_id);
create index metricas_validada_por_idx on public.metricas (validada_por);
create index metricas_pendientes_idx on public.metricas (created_at) where estado_validacion = 'PENDIENTE';
create index metricas_alertas_idx on public.metricas (created_at) where alerta_desviacion or alerta_multiplo;
create index metricas_fecha_corte_brin on public.metricas using brin (fecha_corte);

-- Pagos de anunciantes; append-only (los escribe registrar_pago_anunciante_srv).
create table public.pagos_anunciante (
  id uuid primary key default private.uuid_v7(),
  factura_id uuid not null references public.facturas (id) on delete restrict,
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,     -- copiado
  fecha_pago date not null,
  monto numeric(14,2) not null constraint pagos_anunciante_monto_chk check (monto > 0),
  medio_pago text not null constraint pagos_anunciante_medio_chk check (medio_pago in ('TRANSFERENCIA', 'PSE', 'CONSIGNACION', 'CHEQUE', 'OTRO')),
  referencia text constraint pagos_anunciante_referencia_chk check (char_length(referencia) <= 120),
  soporte_path text constraint pagos_anunciante_soporte_path_chk check (soporte_path is null
    or (soporte_path like 'pago/' || factura_id::text || '/%' and position('..' in soporte_path) = 0)),
  registrado_por uuid default private.actor_id(),  -- sin FK (§3.8)
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora()
);
create index pagos_anunciante_factura_id_idx on public.pagos_anunciante (factura_id);
create index pagos_anunciante_anunciante_fecha_idx on public.pagos_anunciante (anunciante_id, fecha_pago);
create index pagos_anunciante_registrado_por_idx on public.pagos_anunciante (registrado_por);
create index pagos_anunciante_es_demo_idx on public.pagos_anunciante (es_demo) where es_demo;

create table public.disputas (
  id uuid primary key default private.uuid_v7(),
  asignacion_id uuid not null references public.asignaciones (id) on delete restrict,
  abierta_por uuid not null,                       -- sin FK (§3.8)
  parte public.disputa_parte not null,
  motivo public.disputa_motivo not null,
  descripcion text not null constraint disputas_descripcion_chk check (char_length(descripcion) between 10 and 4000),
  estado public.disputa_estado not null default 'ABIERTA',
  estado_asignacion_origen public.asignacion_estado not null,
  resolucion text constraint disputas_resolucion_chk check (char_length(resolucion) <= 4000),
  estado_asignacion_resultante public.asignacion_estado,
  resuelta_por uuid references public.perfiles (id) on delete set null,
  fecha_resolucion timestamptz,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint disputas_resuelta_chk check (estado <> 'RESUELTA' or estado_asignacion_resultante is not null)
);
create unique index disputas_abierta_key on public.disputas (asignacion_id) where estado in ('ABIERTA', 'EN_REVISION');
create index disputas_asignacion_id_idx on public.disputas (asignacion_id);
create index disputas_abierta_por_idx on public.disputas (abierta_por);
create index disputas_resuelta_por_idx on public.disputas (resuelta_por);
create index disputas_estado_created_idx on public.disputas (estado, created_at);

-- Conversación de la disputa; append-only (su inserción se audita por la disputa).
create table public.disputa_mensajes (
  id bigint generated always as identity primary key,
  disputa_id uuid not null references public.disputas (id) on delete cascade,
  autor_id uuid not null default private.actor_id(),                -- sin FK (§3.8)
  mensaje text not null constraint disputa_mensajes_mensaje_chk check (char_length(mensaje) between 1 and 4000),
  adjunto_path text,
  interno boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  constraint disputa_mensajes_adjunto_chk check (adjunto_path is null
    or (adjunto_path like 'disputa/' || disputa_id::text || '/%' and position('..' in adjunto_path) = 0
        and interno = (adjunto_path like 'disputa/' || disputa_id::text || '/interno/%')))
);
create index disputa_mensajes_disputa_idx on public.disputa_mensajes (disputa_id, id);
create index disputa_mensajes_autor_id_idx on public.disputa_mensajes (autor_id);

-- 4. RLS habilitada desde ya (sin políticas nadie accede; las políticas y grants llegan en 7d).
alter table public.campanas enable row level security;
alter table public.ofertas enable row level security;
alter table public.oferta_cupos enable row level security;
alter table public.oferta_vistas enable row level security;
alter table public.creativos enable row level security;
alter table public.creativo_archivos enable row level security;
alter table public.comisiones_excepcion enable row level security;
alter table public.dispersiones enable row level security;
alter table public.liquidaciones enable row level security;
alter table public.documentos_soporte enable row level security;
alter table public.facturas enable row level security;
alter table public.asignaciones enable row level security;
alter table public.asignacion_montos enable row level security;
alter table public.descargas_contenido enable row level security;
alter table public.publicaciones enable row level security;
alter table public.metricas enable row level security;
alter table public.pagos_anunciante enable row level security;
alter table public.disputas enable row level security;
alter table public.disputa_mensajes enable row level security;

-- 5. Verificación de la semilla de transiciones: desde/hacia existen en el enum de la columna de estado y cada
--    columna_at existe en la tabla de su entidad (§4.1).
do $$
declare v_malas text;
begin
  select string_agg(t.entidad || ':' || t.desde || '→' || t.hacia || '/' || t.actor, ', ') into v_malas
  from private.transiciones_estado t
  cross join lateral (select case t.entidad when 'anunciantes' then 'estado_verificacion'
                        when 'documentos_medio' then 'estado_validacion' when 'documentos_anunciante' then 'estado_validacion'
                        when 'verificaciones_cuenta' then 'estado_validacion' when 'publicaciones' then 'estado_validacion'
                        when 'metricas' then 'estado_validacion' else 'estado' end as col) c
  join pg_attribute a on a.attrelid = ('public.' || t.entidad)::regclass and a.attname = c.col
  where (t.desde <> 'NUEVO' and not exists (select 1 from pg_enum e where e.enumtypid = a.atttypid and e.enumlabel = t.desde))
     or not exists (select 1 from pg_enum e where e.enumtypid = a.atttypid and e.enumlabel = t.hacia)
     or (t.columna_at is not null and not exists (select 1 from pg_attribute x
                                                   where x.attrelid = ('public.' || t.entidad)::regclass
                                                     and x.attname = t.columna_at and not x.attisdropped));
  assert v_malas is null, 'transiciones con estados o columnas inexistentes: ' || coalesce(v_malas, '');
  assert (select count(*) from private.transiciones_estado) = 141, 'la semilla de transiciones no tiene 141 filas';
end $$;
