-- Migración 5b · configuracion_semillas (docs/modelo-datos.md §3.4, §7, §10.3)
-- Claves de negocio de `configuracion` (§7; las de seguridad vienen de identidad_rbac), franjas, formatos, tarifas
-- de ejemplo, niveles de verificación, parámetros tributarios y plantillas de notificación. Todas las cifras
-- sugeridas quedan con `pendiente_validacion = true` hasta que el contador o el negocio las confirmen.

-- 1. Claves de configuración (§7)
insert into public.configuracion
  (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica, pendiente_validacion) values
  ('comision.porcentaje_global', '0.20', 'PORCENTAJE', 0, 0.5, null, 'comision',
   'Comisión de la plataforma sobre el monto bruto de cada asignación, salvo excepción por anunciante o campaña.', '%', false, true),
  ('comision.visible_para_medio', 'true', 'BOOLEANO', null, null, null, 'comision',
   'Si el medio ve el monto bruto y la comisión además de su monto neto.', null, true, false),
  ('campanas.tope_porcentaje_por_medio', '0.15', 'PORCENTAJE', 0.01, 1, null, 'campanas',
   'Porcentaje máximo del presupuesto de una campaña que puede ir a un mismo medio (valor por defecto de cada oferta).', '%', false, false),
  ('ofertas.anticipacion_minima_horas', '24', 'ENTERO', 0, 720, null, 'ofertas',
   'Horas mínimas entre el envío a revisión de una oferta y su fecha límite de aceptación.', 'h', false, false),
  ('ofertas.minimo_medios', '1', 'ENTERO', 1, 500, null, 'ofertas',
   'Número mínimo de medios (cupos) que debe tener una oferta.', 'medios', false, true),
  ('medios.umbral_seguidores', '30000', 'ENTERO', 1000, 1000000, null, 'medios',
   'Seguidores verificados mínimos de una cuenta para participar en el marketplace.', 'seguidores', true, false),
  ('medios.reverificacion_dias', '30', 'ENTERO', 7, 365, null, 'medios',
   'Días de vigencia de una verificación de cuenta social antes de exigir la reverificación.', 'días', false, false),
  ('medios.reverificacion_gracia_dias', '7', 'ENTERO', 0, 60, null, 'medios',
   'Días en que una cuenta sigue elegible después de vencer su reverificación.', 'días', false, false),
  ('medios.codigo_verificacion_minutos', '60', 'ENTERO', 5, 1440, null, 'medios',
   'Vigencia del código temporal que el medio publica en una historia para verificar su cuenta.', 'min', false, false),
  ('medios.n_minimo_cumplimiento', '3', 'ENTERO', 1, 100, null, 'medios',
   'Asignaciones mínimas para calcular y mostrar la tasa de cumplimiento de un medio.', 'asignaciones', false, false),
  ('medios.dias_actividad', '90', 'ENTERO', 7, 365, null, 'medios',
   'Ventana en días para considerar activo a un medio.', 'días', false, false),
  ('medios.dias_riesgo_sin_aceptar', '30', 'ENTERO', 7, 180, null, 'medios',
   'Días sin aceptar ofertas tras los que un medio activo se marca en riesgo de abandono.', 'días', false, false),
  ('metricas.cortes_requeridos', '["H24","H72","D7"]', 'LISTA_TEXTO', null, null, array['H24', 'H72', 'D7'], 'metricas',
   'Cortes de métricas que se exigen por defecto en cada oferta.', null, true, false),
  ('metricas.plazo_carga_horas', '48', 'ENTERO', 1, 336, null, 'metricas',
   'Horas que tiene el medio para cargar las métricas después de cada corte.', 'h', false, false),
  ('metricas.factor_desviacion', '3.0', 'DECIMAL', 1.5, 10, null, 'metricas',
   'Factor sobre la mediana histórica del medio a partir del cual una métrica se marca como desviada.', '×', false, false),
  ('metricas.minimo_historial', '5', 'ENTERO', 1, 50, null, 'metricas',
   'Publicaciones previas mínimas para evaluar la desviación de las métricas.', 'publicaciones', false, false),
  ('metricas.multiplo_alcance_seguidores', '{"FACEBOOK":3,"INSTAGRAM":2,"TIKTOK":20}', 'MAPA_DECIMAL', 1, 100,
   array['FACEBOOK', 'INSTAGRAM', 'TIKTOK'], 'metricas',
   'Múltiplo de los seguidores por plataforma a partir del cual un alcance reportado se marca como alerta.', '×', false, false),
  ('calidad.multiplicador_piso', '0.70', 'DECIMAL', 0.5, 1, null, 'calidad',
   'Multiplicador de calidad mínimo de una cuenta.', '×', false, true),
  ('calidad.multiplicador_techo', '1.40', 'DECIMAL', 1, 2, null, 'calidad',
   'Multiplicador de calidad máximo de una cuenta.', '×', false, true),
  ('calidad.minimo_publicaciones', '5', 'ENTERO', 1, 50, null, 'calidad',
   'Publicaciones verificadas mínimas para calcular el multiplicador de calidad.', 'publicaciones', false, false),
  ('calidad.ventana_publicaciones', '20', 'ENTERO', 5, 100, null, 'calidad',
   'Últimas publicaciones que entran en la mediana de alcance del multiplicador de calidad.', 'publicaciones', false, false),
  ('calidad.corte_referencia', '"D7"', 'TEXTO', null, null, array['H24', 'H72', 'D7'], 'calidad',
   'Corte de métricas que se usa para calcular el multiplicador de calidad.', null, false, false),
  ('calidad.dias_aviso_cambio', '7', 'ENTERO', 0, 30, null, 'calidad',
   'Días de antelación con que se anuncia al medio un cambio de su multiplicador de calidad.', 'días', false, false),
  ('precios.redondeo', '100', 'ENTERO', 1, 1000, null, 'precios',
   'Múltiplo en pesos al que se redondea el precio de una asignación.', 'COP', false, false),
  ('precios.recargo_exclusividad', '1.25', 'DECIMAL', 1, 3, null, 'precios',
   'Multiplicador del precio de las ofertas con exclusividad por sector.', '×', false, true),
  ('disputas.plazo_vencida_horas', '72', 'ENTERO', 1, 720, null, 'disputas',
   'Horas que tiene el medio para disputar una asignación vencida sin publicar.', 'h', false, false),
  ('disputas.plazo_recarga_horas', '24', 'ENTERO', 1, 168, null, 'disputas',
   'Horas para cargar la evidencia después de ganar la disputa de una asignación vencida.', 'h', false, false),
  ('liquidaciones.periodicidad', '"QUINCENAL"', 'TEXTO', null, null, array['SEMANAL', 'QUINCENAL', 'MENSUAL'], 'liquidaciones',
   'Periodicidad de los cortes de liquidación a los medios.', null, false, true),
  ('liquidaciones.dias_pago', '8', 'ENTERO', 0, 90, null, 'liquidaciones',
   'Días entre la aprobación de una liquidación y su pago.', 'días', false, true),
  ('facturacion.dias_vencimiento', '30', 'ENTERO', 0, 120, null, 'facturacion',
   'Días de plazo de pago de las facturas a anunciantes.', 'días', false, false),
  ('facturacion.iva', '0.19', 'PORCENTAJE', 0, 0.5, null, 'facturacion',
   'Tarifa de IVA de las facturas a anunciantes.', '%', false, true),
  ('tributario.reteica_municipio_base', '"MEDIO"', 'TEXTO', null, null, array['MEDIO', 'PLATAFORMA'], 'tributario',
   'Municipio cuya tarifa de ReteICA se aplica: el del medio o el domicilio fiscal de la plataforma.', null, false, true),
  ('tributario.municipio_plataforma', '"11001"', 'TEXTO', null, null, null, 'tributario',
   'Código DIVIPOLA del domicilio fiscal de la plataforma.', null, false, true),
  ('tributario.politica_seg_social', '"ALERTA"', 'TEXTO', null, null, array['ALERTA', 'BLOQUEAR'], 'tributario',
   'Qué hacer si un medio supera el umbral mensual sin seguridad social aprobada: alertar o bloquear la aprobación.', null, false, true),
  ('analitica.n_minimo_tasas', '20', 'ENTERO', 1, 1000, null, 'analitica',
   'Muestra mínima de tasas agregadas, comparativos, rankings e insights.', 'casos', false, false),
  ('analitica.umbral_variacion', '0.15', 'PORCENTAJE', 0.01, 1, null, 'analitica',
   'Variación a partir de la cual el motor de insights la considera significativa.', '%', false, false),
  ('retencion.accesos_dias', '365', 'ENTERO', 30, 1825, null, 'retencion',
   'Días que se conserva el registro de accesos.', 'días', false, false),
  ('retencion.bitacora_dias', '1825', 'ENTERO', 365, 3650, null, 'retencion',
   'Días que se conserva la bitácora de auditoría (5 años por defecto).', 'días', false, false),
  ('retencion.intentos_login_dias', '30', 'ENTERO', 1, 365, null, 'retencion',
   'Días que se conservan los intentos de ingreso del limitador.', 'días', false, false),
  ('retencion.notificaciones_dias', '180', 'ENTERO', 7, 730, null, 'retencion',
   'Días que se conservan las notificaciones leídas.', 'días', false, false),
  ('archivos.vigencia_url_firmada_segundos', '300', 'ENTERO', 30, 3600, null, 'archivos',
   'Vigencia de las URL firmadas para descargar archivos privados.', 's', false, false),
  ('archivos.max_creativo_mb', '50', 'ENTERO', 1, 500, null, 'archivos',
   'Tamaño máximo por archivo creativo (no puede superar el límite del plan de Storage ni el del bucket).', 'MB', false, false)
on conflict (clave) do nothing;

-- 2. Franjas de seguidores (D3: comunes a las tres plataformas)
insert into public.franjas (clave, nombre, seguidores_min, seguidores_max, orden) values
  ('F1', '30.000 – 60.000', 30000, 60000, 1),
  ('F2', '60.001 – 120.000', 60001, 120000, 2),
  ('F3', 'Más de 120.000', 120001, null, 3)
on conflict (clave) do nothing;

-- 3. Formatos por plataforma (D2: una oferta = un formato = una plataforma)
insert into public.formatos (plataforma, clave, nombre, requisitos, orden) values
  ('INSTAGRAM', 'POST_FEED', 'Post de feed',
   '{"relaciones_aspecto":["1:1","4:5","1.91:1"],"mime":["image/jpeg","image/png","image/webp","video/mp4"],"duracion_max_s":60,"peso_max_mb":50}', 1),
  ('INSTAGRAM', 'CARRUSEL', 'Carrusel',
   '{"relaciones_aspecto":["1:1","4:5"],"mime":["image/jpeg","image/png","image/webp","video/mp4"],"max_archivos":10,"peso_max_mb":50}', 2),
  ('INSTAGRAM', 'REEL', 'Reel',
   '{"relaciones_aspecto":["9:16"],"mime":["video/mp4","video/quicktime"],"duracion_max_s":90,"peso_max_mb":50}', 3),
  ('INSTAGRAM', 'HISTORIA', 'Historia',
   '{"relaciones_aspecto":["9:16"],"mime":["image/jpeg","image/png","image/webp","video/mp4"],"duracion_max_s":60,"peso_max_mb":50}', 4),
  ('FACEBOOK', 'POST_FEED', 'Post de feed',
   '{"relaciones_aspecto":["1:1","4:5","1.91:1"],"mime":["image/jpeg","image/png","image/webp","video/mp4"],"peso_max_mb":50}', 5),
  ('FACEBOOK', 'VIDEO', 'Video',
   '{"relaciones_aspecto":["16:9","1:1","4:5","9:16"],"mime":["video/mp4","video/quicktime"],"duracion_max_s":600,"peso_max_mb":50}', 6),
  ('FACEBOOK', 'REEL', 'Reel',
   '{"relaciones_aspecto":["9:16"],"mime":["video/mp4","video/quicktime"],"duracion_max_s":90,"peso_max_mb":50}', 7),
  ('FACEBOOK', 'HISTORIA', 'Historia',
   '{"relaciones_aspecto":["9:16"],"mime":["image/jpeg","image/png","image/webp","video/mp4"],"duracion_max_s":60,"peso_max_mb":50}', 8),
  ('TIKTOK', 'VIDEO', 'Video',
   '{"relaciones_aspecto":["9:16"],"mime":["video/mp4","video/quicktime"],"duracion_max_s":600,"peso_max_mb":50}', 9)
on conflict (plataforma, clave) do nothing;

-- 4. Tarifas de ejemplo (COP por publicación, §10.3; pendientes de validación, §14.2.1). Vigentes desde el
--    1 de enero de 2026 (Bogotá): la fecha pasada solo la admite la carga del owner (amo.modo_carga).
do $$
begin
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde, pendiente_validacion)
  select f.id, f.plataforma, fr.id, v.valor, private.inicio_dia(date '2026-01-01'), true
  from (values
    ('INSTAGRAM', 'HISTORIA', 'F1', 120000), ('INSTAGRAM', 'HISTORIA', 'F2', 220000), ('INSTAGRAM', 'HISTORIA', 'F3', 400000),
    ('INSTAGRAM', 'POST_FEED', 'F1', 250000), ('INSTAGRAM', 'POST_FEED', 'F2', 450000), ('INSTAGRAM', 'POST_FEED', 'F3', 800000),
    ('INSTAGRAM', 'CARRUSEL', 'F1', 300000), ('INSTAGRAM', 'CARRUSEL', 'F2', 550000), ('INSTAGRAM', 'CARRUSEL', 'F3', 950000),
    ('INSTAGRAM', 'REEL', 'F1', 350000), ('INSTAGRAM', 'REEL', 'F2', 650000), ('INSTAGRAM', 'REEL', 'F3', 1200000),
    ('FACEBOOK', 'HISTORIA', 'F1', 90000), ('FACEBOOK', 'HISTORIA', 'F2', 160000), ('FACEBOOK', 'HISTORIA', 'F3', 300000),
    ('FACEBOOK', 'POST_FEED', 'F1', 180000), ('FACEBOOK', 'POST_FEED', 'F2', 320000), ('FACEBOOK', 'POST_FEED', 'F3', 600000),
    ('FACEBOOK', 'VIDEO', 'F1', 220000), ('FACEBOOK', 'VIDEO', 'F2', 400000), ('FACEBOOK', 'VIDEO', 'F3', 750000),
    ('FACEBOOK', 'REEL', 'F1', 250000), ('FACEBOOK', 'REEL', 'F2', 450000), ('FACEBOOK', 'REEL', 'F3', 850000),
    ('TIKTOK', 'VIDEO', 'F1', 300000), ('TIKTOK', 'VIDEO', 'F2', 550000), ('TIKTOK', 'VIDEO', 'F3', 1000000)
  ) as v (plataforma, formato, franja, valor)
  join public.formatos f on f.plataforma = v.plataforma::public.plataforma and f.clave = v.formato
  join public.franjas fr on fr.clave = v.franja
  where not exists (select 1 from public.tarifas t where t.formato_id = f.id and t.franja_id = fr.id);
  perform set_config('amo.modo_carga', '', true);
end $$;

-- 5. Niveles de verificación del medio (§7.1.1; topes pendientes de contador, §14.2.2, D18, D26, D32).
--    Todo nivel exige además el certificado del medio de pago declarado (regla fija de la transición a VERIFICADO).
insert into public.niveles_verificacion
  (nivel, nombre, requisitos, documentos_requeridos, tope_anual, porcentaje_alerta, porcentaje_bloqueo, pendiente_validacion) values
  (1, 'Persona natural informal',
   array['Cédula de ciudadanía por ambas caras', 'Prueba de vida (selfie con la cédula)',
         'Certificado de la cuenta bancaria o billetera digital a nombre propio'],
   array['CEDULA_FRENTE', 'CEDULA_REVERSO', 'PRUEBA_VIDA']::public.documento_medio_tipo[], 30000000, 0.8000, 0.9500, true),
  (2, 'Persona natural con RUT',
   array['Requisitos del nivel 1', 'RUT actualizado'],
   array['CEDULA_FRENTE', 'CEDULA_REVERSO', 'PRUEBA_VIDA', 'RUT']::public.documento_medio_tipo[], 120000000, 0.8000, 0.9500, true),
  (3, 'Persona jurídica',
   array['Requisitos del nivel 2 (del representante legal)', 'Certificado de existencia y representación legal (Cámara de Comercio)',
         'RUT de la sociedad'],
   array['CEDULA_FRENTE', 'CEDULA_REVERSO', 'PRUEBA_VIDA', 'RUT', 'CAMARA_COMERCIO', 'RUT_SOCIEDAD']::public.documento_medio_tipo[],
   null, 0.8000, 0.9500, true)
on conflict (nivel) do nothing;

-- 6. Parámetros tributarios (UVT y SMLMV del año; pendientes de validación con el contador).
--    2025: UVT Res. DIAN 000193 de 2024; SMLMV Decreto 1572 de 2024. 2026: UVT Res. DIAN 000238 de 2025; SMLMV 2026.
insert into public.parametros_tributarios (anio, uvt, smlmv, umbral_seg_social_smlmv, pendiente_validacion) values
  (2025, 49799, 1423500, 1, true),
  (2026, 52374, 1750905, 1, true)
on conflict (anio) do nothing;

-- 7. Plantillas de notificación (Markdown con variables {{variable}}). Invitación y recuperación son correos
--    (el usuario aún no tiene sesión); el resto se muestra en la aplicación.
insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('usuario.invitado', 'EMAIL', 'Invitación a AMO', 'Te invitaron a AMO',
   E'Hola {{nombre}}:\n\n{{invitador}} te invitó a AMO con el rol **{{rol}}**. Activa tu cuenta desde este enlace (vence en {{vigencia_horas}} horas):\n\n{{enlace}}\n\nSi no esperabas esta invitación, ignora este correo.',
   array['nombre', 'invitador', 'rol', 'enlace', 'vigencia_horas']),
  ('usuario.recuperacion', 'EMAIL', 'Recuperación de contraseña', 'Recupera tu contraseña de AMO',
   E'Hola {{nombre}}:\n\nRecibimos una solicitud para restablecer tu contraseña. Usa este enlace (vence en {{vigencia_minutos}} minutos):\n\n{{enlace}}\n\nSi no la pediste, ignora este correo: tu contraseña no cambiará.',
   array['nombre', 'enlace', 'vigencia_minutos']),
  ('oferta.nueva_elegible', 'APP', 'Nueva oferta disponible', null,
   '**{{anunciante}}** publicó «{{oferta}}» para {{plataforma}}. Acéptala antes del {{fecha_limite}}.',
   array['anunciante', 'oferta', 'plataforma', 'fecha_limite']),
  ('oferta.devuelta', 'APP', 'Oferta devuelta', null,
   'Tu oferta «{{oferta}}» fue devuelta con observaciones: {{motivo}}',
   array['oferta', 'motivo']),
  ('oferta.publicada', 'APP', 'Oferta publicada', null,
   'Tu oferta «{{oferta}}» ya está publicada en el marketplace.',
   array['oferta']),
  ('asignacion.recordatorio_publicacion', 'APP', 'Recuerda publicar', null,
   'Publica el contenido de «{{oferta}}» antes del {{fecha_fin}}.',
   array['oferta', 'fecha_fin']),
  ('asignacion.recordatorio_metricas', 'APP', 'Carga tus métricas', null,
   'Carga las métricas del corte {{corte}} de «{{oferta}}» antes del {{fecha_limite}}.',
   array['oferta', 'corte', 'fecha_limite']),
  ('asignacion.metricas_atrasadas', 'APP', 'Métricas atrasadas', null,
   'Las métricas del corte {{corte}} de «{{oferta}}» están atrasadas. Cárgalas cuanto antes para no retrasar tu pago.',
   array['oferta', 'corte']),
  ('asignacion.vencida', 'APP', 'Asignación vencida', null,
   'La asignación de «{{oferta}}» venció sin publicación. Puedes abrir una disputa hasta el {{plazo_disputa}}.',
   array['oferta', 'plazo_disputa']),
  ('asignacion.cancelada', 'APP', 'Asignación cancelada', null,
   'La asignación de «{{oferta}}» fue cancelada. Motivo: {{motivo}}',
   array['oferta', 'motivo']),
  ('evidencia.rechazada', 'APP', 'Evidencia rechazada', null,
   'La evidencia de publicación de «{{oferta}}» fue rechazada: {{motivo}}. Carga una evidencia nueva.',
   array['oferta', 'motivo']),
  ('metricas.rechazadas', 'APP', 'Métricas rechazadas', null,
   'Las métricas del corte {{corte}} de «{{oferta}}» fueron rechazadas: {{motivo}}.',
   array['oferta', 'corte', 'motivo']),
  ('creativo.actualizado', 'APP', 'Contenido actualizado', null,
   'El anunciante actualizó el contenido de «{{oferta}}». Descarga la versión {{version}} antes de publicar.',
   array['oferta', 'version']),
  ('cuenta.reverificacion_pendiente', 'APP', 'Reverifica tu cuenta', null,
   'Tu cuenta de {{plataforma}} @{{handle}} debe reverificarse antes del {{fecha_limite}} para seguir recibiendo ofertas.',
   array['plataforma', 'handle', 'fecha_limite']),
  ('cuenta.verificacion_resuelta', 'APP', 'Verificación de cuenta', null,
   'La verificación de tu cuenta de {{plataforma}} @{{handle}} quedó {{resultado}}.',
   array['plataforma', 'handle', 'resultado']),
  ('multiplicador.cambio_programado', 'APP', 'Cambio de multiplicador', null,
   'El multiplicador de calidad de @{{handle}} pasará de {{actual}} a {{proximo}} desde el {{fecha}}.',
   array['handle', 'actual', 'proximo', 'fecha']),
  ('liquidacion.pagada', 'APP', 'Liquidación pagada', null,
   'Pagamos tu liquidación del periodo {{periodo}} por {{monto_neto}}.',
   array['periodo', 'monto_neto']),
  ('disputa.abierta', 'APP', 'Disputa abierta', null,
   'Se abrió una disputa sobre «{{oferta}}» por {{motivo}}.',
   array['oferta', 'motivo']),
  ('disputa.resuelta', 'APP', 'Disputa resuelta', null,
   'La disputa sobre «{{oferta}}» se resolvió: {{resultado}}.',
   array['oferta', 'resultado']),
  ('seguridad.pais_inusual', 'APP', 'Ingreso desde un país inusual', null,
   'Detectamos un ingreso a tu cuenta desde {{pais}} el {{fecha}}. Si no fuiste tú, cambia tu contraseña y avisa al administrador.',
   array['pais', 'fecha'])
on conflict (clave, canal) do nothing;

-- 8. Verificación
do $$ begin
  assert (select count(*) from public.configuracion) = 53, 'configuracion: se esperaban 53 claves (11 de seguridad + 42)';
  assert (select count(*) from public.franjas where activa) = 3, 'franjas: se esperaban 3';
  assert (select count(*) from public.formatos) = 9, 'formatos: se esperaban 9';
  assert (select count(*) from public.tarifas where vigente_hasta is null and pendiente_validacion) = 27,
         'tarifas: se esperaban 27 vigentes pendientes de validación';
  assert (select count(*) from public.niveles_verificacion) = 3, 'niveles_verificacion: se esperaban 3';
  assert (select count(*) from public.parametros_tributarios) = 2, 'parametros_tributarios: se esperaban 2025 y 2026';
  assert (select count(*) from public.plantillas_notificacion) = 20, 'plantillas_notificacion: se esperaban 20';
  assert coalesce(current_setting('amo.modo_carga', true), '') = '', 'amo.modo_carga debe quedar apagado';
end $$;
