# Fase 3 — Marketplace, ejecución del medio y seguimiento del anunciante (cierra E2)

Requisitos: MED-008…014, ANU-011, ANU-012, INT-001, INT-002, INT-005, NOT-005, NOT-006, CUP-004…006, DSH-006, PRC-003
y PRC-004 (criterios en `context/requisitos/datos/requisitos.mjs`). Lee primero [`README.md`](README.md): sus reglas siguen
vigentes. Mira también [`fase-2.md`](fase-2.md) (convenciones de archivos, `transicionar`, errores) y el código de la fase 2
como patrón (asistente, creativos, fichas, colas).

## Lo que ya tiene la base

Migración `20261023022211_e2_integridad_ejecucion` (aplicada en la base local; tipos regenerados):

| Objeto                                                                                                                                                                              | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.marketplace_medio(p_plataforma default null, p_incluir_rechazadas default false, p_orden 'fecha'\|'pago' default 'fecha', p_limite default 30, p_desplazamiento default 0)` | MED-008. Ofertas que el medio puede aceptar hoy (visibles, con cupo en su franja), sin las que ya tomó (salvo varios cupos) y sin las que rechazó (salvo `p_incluir_rechazadas`). Columnas: oferta (`titulo`, `formato_id`, `formato_nombre`, `plataforma`, `publicaciones_por_medio`, `permite_multiples_cupos`, ventana, `fecha_limite_aceptacion`, `permanencia_minima_dias`, `exclusividad_dias`, `cortes_requeridos`), `marca`, `anunciante_nombre`, `sector_id`, `categorias_objetivo`, `rechazada_por_mi`, `vista`, `pago_maximo`, `cuentas jsonb` (`[{cuenta_social_id, handle, franja_clave, cupos_restantes, monto_medio}]`) y `total` (para paginar).                                                                                                                                                                                                                                                                                                                                                              |
| `public.mi_elegibilidad_marketplace()` → `(motivo, detalle)`                                                                                                                        | MED-008 c2: `SIN_MEDIO`, `MEDIO_PENDIENTE\|RECHAZADO\|SUSPENDIDO`, `NIVEL_0`, `SIN_CUENTA_VIGENTE`, `BAJO_UMBRAL` u `OK`, con un `detalle` listo para mostrar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `public.ofertas_para_medio(p_oferta_id)` / `public.cotizar_oferta(p_oferta_id, p_cuenta_social_id)` / `public.registrar_vista_oferta(p_oferta_id)`                                  | MED-009: detalle (también para quien ya tiene asignación), cotización por cuenta (multiplicadores y `monto_medio` siempre; tarifa, bruto y comisión solo con `comision.visible_para_medio`) y registro de vista.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `public.reservar_cupo_srv(p_oferta_id, p_medio_id, p_cuenta_social_id, p_actor_id, p_session_id, p_clave_idempotencia)` (service_role)                                              | MED-010: reserva atómica con precio congelado. Errores: `AMO_YA_ACEPTADA` (antes que el cupo), `AMO_SIN_CUPO` «No quedan cupos en tu franja.» (también si la oferta quedó llena), `AMO_OFERTA_NO_DISPONIBLE`, `AMO_NO_ELEGIBLE`, `AMO_PRESUPUESTO_OFERTA\|CAMPANA`, `AMO_TOPE_MEDIO`, `AMO_TOPE_NIVEL`, `AMO_EXCLUSIVIDAD`, `AMO_SIN_TARIFA`, `AMO_IDEMPOTENCIA_INVALIDA` (clave ya usada en otra oferta o en una asignación que ya no está en pie). La interfaz genera una **clave nueva por intento** (al pintar el detalle y tras cada error definitivo) y reusa la misma en un reintento por red. El resultado trae `monto_bruto`: no lo muestres si la comisión no es visible.                                                                                                                                                                                                                                                                                                                                           |
| `public.rechazar_oferta_srv(p_oferta_id, p_actor_id, p_session_id, p_motivo)` / `public.desistir_asignacion_srv(p_asignacion_id, p_actor_id, p_session_id, p_motivo)`               | «No me interesa» (motivo opcional; la oferta sale del listado) y desistir de una asignación concreta (motivo obligatorio; solo `ACEPTADA` sin descarga y antes de la fecha límite de aceptación).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `public.mis_asignaciones_medio(p_estados, p_limite, p_antes_id, p_id)`                                                                                                              | MED-011: asignaciones aceptadas del medio con la oferta (`oferta_titulo`, `marca`, `anunciante_nombre`, `formato_id`, `formato_nombre`, ventana, `fecha_limite_aceptacion`, `cortes_requeridos`, `permanencia_minima_dias`), `handle`, montos (`monto_medio` siempre; `multiplicador_calidad_aplicado` siempre; tarifa, bruto y comisión según la configuración), `fecha_limite_publicacion` y `reclamo_hasta` (vencidas). Una sola con `p_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `public.proximas_acciones_medio(p_limite)` → `(asignacion_id, oferta_titulo, accion, vence_at, numero, corte)`                                                                      | DSH-006: `DESCARGAR`, `DESCARGAR_NUEVA_VERSION`, `PUBLICAR`, `CORREGIR_EVIDENCIA` (con `numero`), `CARGAR_METRICA_<CORTE>` (con `numero` y `corte`), `CORREGIR_METRICAS` (con `numero` y `corte`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `public.registrar_descarga_srv(p_asignacion_id, p_actor_id, p_session_id)` → jsonb                                                                                                  | MED-012: registra la descarga (pasa a `CONTENIDO_ENTREGADO`) y devuelve el creativo vigente (`version`, `tipo`, `copy_sugerido`, `hashtags`, `menciones`, `enlace_destino`, `archivos[{id, archivo_path, mime, tamano_bytes, orden}]`). Después la app firma los archivos con el cliente del usuario (300 s: `archivos.vigencia_url_firmada_segundos`). Vencido el plazo para publicar → `AMO_FUERA_DE_VENTANA`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `public.registrar_evidencia_srv(p_asignacion_id, p_numero, p_url, p_fecha_publicacion, p_captura_path, p_miniatura_path, p_etiqueta_confirmada, p_actor_id, p_session_id)` → uuid   | MED-013: la captura debe estar subida a `evidencias/asignacion/{id}/publicacion/…` y ser imagen (`AMO_CAPTURA_REQUERIDA`); la URL es única en la plataforma (`publicaciones_url_post_key`) y debe ser de una publicación, no de un perfil (`publicaciones_url_chk`, el mismo patrón que `src/lib/redes/url-post.ts`); fecha dentro de la ventana (`AMO_FUERA_DE_VENTANA`); etiqueta de publicidad confirmada (`AMO_ETIQUETA_REQUERIDA`); versión del creativo vigente al publicar descargada (`AMO_CREATIVO_DESACTUALIZADO`). Pasa a `PUBLICADA` al completar las publicaciones.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `public.metricas` (insert/update del medio con la sesión)                                                                                                                           | MED-014: `publicacion_id`, `corte` (`H24\|H72\|D7` de la oferta o `PERSONALIZADO` con `periodo_desde/hasta`), `fecha_corte`, campos por plataforma (Instagram y Facebook: `alcance`, `impresiones` obligatorios, sin `espectadores_unicos`; TikTok: `reproducciones`, `espectadores_unicos` obligatorios, sin `alcance` ni `impresiones`; además `me_gusta`, `comentarios`, `compartidos`, `guardados`, `clics_enlace`, `visitas_perfil`, `tiempo_promedio_visualizacion_s`, `porcentaje_reproduccion_completa`), `captura_path` (imagen en `evidencias/asignacion/{id}/metrica/…`). Reglas: impresiones ≥ alcance, interacciones ≤ impresiones (CHECK), corte pedido por la oferta, `fecha_corte` ≥ publicación + corte y no futura, cortes que no bajan más de `metricas.tolerancia_cortes` (2 %) frente a los otros (`AMO_METRICA_INCOHERENTE` con `detail`), personalizado sin repetir intervalo (`metricas_personalizado_key`). El medio corrige filas `PENDIENTE` o `RECHAZADA` mientras la asignación admite métricas. |
| Recordatorios y avisos                                                                                                                                                              | `asignacion.recordatorio_publicacion`, `asignacion.recordatorio_metricas` (al cumplirse cada corte), `asignacion.metricas_atrasadas` (por corte, 48 h después: `metricas.plazo_carga_horas`, pública), `creativo.actualizado` (solo a quien aún no publica), `oferta.cupo_liberado` (a los elegibles, como mucho cada 6 h), `multiplicador.cambio_programado` (explica el índice frente a la franja, en formato es-CO).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `public.seguimiento_campana(p_campana_id)`                                                                                                                                          | ANU-011: cada asignación aceptada con estado y fechas, `monto_bruto`, el medio (perfil público: `medio_nombre`, municipio, nivel), `cuenta` (`plataforma`, `handle`, `url`, `seguidores_al_aceptar`, `franja_clave`) y `publicaciones` (`numero`, `url_post`, `fecha_publicacion`, `estado_validacion`, `con_captura`, `cortes` aprobados con alcance, impresiones, interacciones, reproducciones y clics). El anunciante ya no ve métricas sin aprobar ni a los medios que rechazaron sin aceptar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Calidad (PRC-003/004)                                                                                                                                                               | `cuentas_sociales` (el medio lee sus cuentas): `multiplicador_calidad`, `multiplicador_proximo`, `multiplicador_proximo_desde`, `indice_calidad`, `indice_franja` (nuevo), `alcance_mediano`, `publicaciones_verificadas_count`, `multiplicador_calculado_at`. El cambio programado se aplica a las 00:01 de Bogotá.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Configuración pública nueva                                                                                                                                                         | `metricas.tolerancia_cortes` (0,02), `metricas.plazo_carga_horas`, `disputas.plazo_vencida_horas`, `disputas.plazo_recarga_horas`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Lo que integró el líder (no lo toques; si necesitas otra cosa ahí, repórtalo)

- Navegación: «Ofertas» (`/ofertas`, `ofertas.marketplace`) y «Mis campañas» (`/mis-campanas`, `asignaciones.ver_propias`) para
  el medio, antes de «Mi medio»; la barra inferior del celular queda **Inicio · Ofertas · Campañas · Mi medio**.
  `e2e/inicio.spec.ts` ya espera esa barra y que `/ofertas` tenga el h1 «Ofertas».
- `/ir`: el medio va a `/ofertas/{id}`, `/mis-campanas/{asignacion}`; el anunciante, a
  `/campanas/{campana}?pestana=seguimiento&asignacion={id}`. Contrato: respeta esos parámetros.
- Bloques compartidos: `PieAcciones` (`src/components/layout/pie-acciones.tsx`, pie fijo con `--reserva-inferior`),
  `BotonCopiar` (`src/components/feedback/boton-copiar.tsx`), rutas `src/features/mis-campanas/rutas.ts`
  (`rutaAsignacionMedio`, `rutaContenido`, `rutaEvidencia(id, numero?)`, `rutaMetricas(id, numero, corte)`) y
  `src/features/marketplace/rutas.ts` (`RUTA_OFERTAS_MEDIO`, `rutaFichaOfertaMedio`). Errores nuevos en `errores-bd.ts`.
- E2E: proyecto `pauta-medio` (`SPECS_PAUTA_MEDIO = /[\\/]pauta-medio-[^\\/]*\.spec\.ts$/`, un worker, 390 px) para las
  pruebas que escriben con «Medio E2E».

**Convenciones de la fase:** rutas de evidencia `evidencias/asignacion/{id}/publicacion/{uuid}.webp` y
`…/metrica/{uuid}.webp` (+ miniatura), construidas en el servidor y confirmadas tras subir (`confirmarObjeto`); capturas
comprimidas como las de cuentas (`COMPRESION_CAPTURA`); fechas y plazos en Bogotá con `CuentaRegresiva` y `calcularPlazo`
de `src/components/tiempo`; textos en voz del medio («Aceptaste…», «Tienes hasta…»); móvil primero (390 px), sin
scroll horizontal, pies fijos que no tapan contenido.

## Paquete MK — Marketplace del medio (MED-008, MED-009, MED-010)

**Propiedad:** `src/features/marketplace/**` (conserva `rutas.ts`), `src/app/(app)/ofertas/**`,
`e2e/pauta-medio-marketplace.spec.ts`.

- `/ofertas` (h1 «Ofertas»): tarjetas con marca, formato y plataforma, pago (el mayor de sus cuentas), cupos restantes en su
  franja, fecha límite con cuenta regresiva y marca de «nueva» (no vista); filtros por plataforma y orden por fecha o pago en
  la URL; «Ver las que rechacé»; paginación. Vacío: el motivo de `mi_elegibilidad_marketplace` con el enlace para
  resolverlo (Mi medio, Cuentas, Nivel), u «Hoy no hay ofertas para ti» si es `OK`.
- `/ofertas/[id]`: detalle completo (pago por cuenta con su franja y multiplicadores visibles; condiciones fijas: etiqueta de
  publicidad obligatoria y no editar el copy; instrucciones, restricciones, ventana, permanencia, exclusividad, cortes) y
  `registrar_vista_oferta`. Pie fijo «Aceptar» / «No me interesa»; si tiene varias cuentas elegibles, elige cuál. Aceptar
  usa `reservar_cupo_srv` con su clave de idempotencia y lleva a `/mis-campanas/{asignacion}`; cada error con su mensaje en
  voz del medio (catálogo propio del paquete). «No me interesa» con motivo opcional. Si ya tiene la asignación, el detalle
  enlaza a «Mis campañas».

## Paquete MC — Mis campañas del medio y contenido (MED-011, MED-012)

**Propiedad:** `src/features/mis-campanas/**` (conserva `rutas.ts`), `src/app/(app)/mis-campanas/page.tsx`,
`src/app/(app)/mis-campanas/[id]/page.tsx`, `src/app/(app)/mis-campanas/[id]/contenido/**`,
`e2e/pauta-medio-campanas.spec.ts`.

- `/mis-campanas`: tablero por estado (en el celular, segmentos con conteo: Por publicar, Publicadas, Validadas, Terminadas,
  Vencidas o canceladas) con la siguiente acción, la fecha límite con cuenta regresiva y el pago; estados en voz del medio
  (`ESTADOS_PARA_MEDIO`, los 12).
- `/mis-campanas/[id]`: progreso y siguiente acción como botón principal (descargar, publicar con `rutaEvidencia`, cargar el
  corte con `rutaMetricas`), precio congelado y multiplicador de calidad aplicado, publicaciones y cortes con su estado,
  línea de tiempo; «Desistir» (motivo) solo si `ACEPTADA` sin descarga y antes de la fecha límite de aceptación; en una
  vencida, el plazo de reclamo (`reclamo_hasta`; abrir la disputa llega en la fase 4: muestra el plazo y que el equipo AMO
  la atiende).
- `/mis-campanas/[id]/contenido`: primero instrucciones y restricciones, luego «Descargar el contenido» (`registrar_descarga_srv`
  - firma con el cliente del usuario por 300 s; vista previa de imagen o video y descarga de cada archivo), y `BotonCopiar`
    para copy, hashtags, menciones y enlace de destino. Si hay una versión nueva (`DESCARGAR_NUEVA_VERSION`), lo destaca.

## Paquete EV — Evidencia y métricas (MED-013, MED-014, INT-001, INT-002, INT-005)

**Propiedad:** `src/features/ejecucion/**`, `src/app/(app)/mis-campanas/[id]/evidencia/**`,
`src/app/(app)/mis-campanas/[id]/metricas/**`, `src/lib/redes/**` (ampliar sin romper sus usos), y en
`src/components/archivos/**` un `useCargaCaptura` genérico si lo necesitas (compatible con los usos actuales),
`e2e/pauta-medio-ejecucion.spec.ts`.

- `/mis-campanas/[id]/evidencia?numero=N`: URL del post validada por plataforma y formato (`validarUrlPost(plataforma, url,
formato?)` con mensaje y ejemplo; coherente con `publicaciones_url_chk`), fecha y hora de publicación (Bogotá, dentro de la
  ventana), captura del panel (cámara o galería, comprimida, con miniatura), casilla obligatoria de la etiqueta de
  publicidad y envío con `registrar_evidencia_srv`. Una publicación rechazada muestra las observaciones y se corrige.
- `/mis-campanas/[id]/metricas?numero=N&corte=X`: campos por plataforma (`CAMPOS_METRICAS` con nombres de EP §9), validación
  de coherencia en pantalla (`validarCoherencia`, las mismas reglas y tolerancia que la BD, bloqueantes), corte bloqueado
  hasta su hora con cuenta regresiva, captura obligatoria, corrección de una `PENDIENTE` o `RECHAZADA`, y el corte
  personalizado (periodo). Insert/update con la sesión (RLS) y errores de la BD traducidos.

## Paquete DM — Inicio del medio y calidad (DSH-006, PRC-003, PRC-004)

**Propiedad:** `src/features/dashboard/medio/**`, `src/features/calidad-medio/**`, `e2e/pauta-medio-inicio.spec.ts`.

- Botones directos: cada próxima acción enlaza a su pantalla (`rutaContenido`, `rutaEvidencia(id, numero)`,
  `rutaMetricas(id, numero, corte)`), con `DESCARGAR_NUEVA_VERSION`; los negocios en curso enlazan a
  `/mis-campanas/{id}`; el tope anual enlaza a «Cómo subir de nivel» en alerta o bloqueo. Cuenta regresiva unificada con
  `src/components/tiempo`.
- Calidad de tus cuentas: por cuenta, el multiplicador vigente, el próximo y desde cuándo, y la explicación (índice frente a
  la mediana de su franja, publicaciones verificadas; con menos de `calidad.minimo_publicaciones` el multiplicador es 1).

## Paquete SG — Seguimiento y métricas del anunciante (ANU-011, ANU-012)

**Propiedad:** `src/features/seguimiento/**`, `src/features/metricas-campana/**`, y en `src/features/campanas/` solo lo
necesario para agregar las pestañas «Seguimiento» y «Métricas» a la ficha (`ficha-campana.tsx`, `tipos.ts` o donde estén
`PESTANAS_CAMPANA`) con sus pruebas; `e2e/anunciante-seguimiento.spec.ts`.

- «Seguimiento» (`?pestana=seguimiento&asignacion=`, permiso `asignaciones.ver_propias`): cada asignación con el medio (perfil
  público y alcance declarado), su estado y fechas, el enlace al post y la captura firmada (acción propia que firma como
  usuario las rutas `asignacion/…` que la RLS deja ver), y los cortes aprobados; se actualiza cada 60 s (solo con la pestaña
  visible) y al recargar. Nunca documentos, datos bancarios ni lo que recibe el medio.
- «Métricas» (`reportes.ver`): consolidado (alcance, impresiones, interacciones, reproducciones, clics) y derivadas (CPM
  efectivo, costo por interacción, engagement, costo por alcance) con cortes por plataforma, medio, municipio y fecha con
  tamaño de muestra; aviso de resultados parciales (cortes aprobados de asignaciones aún sin verificar); exportación a
  Excel y PDF de marca (`src/lib/export`, filtros, indicadores y gráficos) con `reportes.exportar`. Reutiliza
  `desempeno_anunciante`/`kpis_anunciante` y los componentes de reportes; si te falta algo en la BD, repórtalo.

## Paquete E0 — Fábricas de pauta y carrera de cupos (CUP-006)

**Propiedad:** `scripts/bootstrap/**`, `scripts/pruebas/carrera/**`, `e2e/utilidades/**` (solo agregar).

- Fábricas (API de servicio y RPC con actor y sesión reales, nunca en producción): `crearOfertaE2E` con `ventanaDesdeHoy`
  y segmentación que haga elegible a «Medio E2E»; `aceptarOfertaE2E({ ofertaId, medio })` (reserva con la sesión del medio),
  `entregarContenidoE2E`, `publicarEvidenciaE2E({ asignacionId, numero })` (captura real subida), `cargarMetricaE2E(...)`,
  `restablecerPautaMedioE2E()` (deja a «Medio E2E» sin asignaciones de pruebas anteriores) y lectores de estado.
- Carrera de cupos: ajusta `scripts/pruebas/carrera` a los errores nuevos (`AMO_SIN_CUPO` al llenarse,
  `AMO_IDEMPOTENCIA_INVALIDA` al reusar una clave tras desistir: agrega ese escenario), córrela contra la base local
  (`pnpm exec tsx --env-file=.env.local scripts/pruebas/carrera-cupos.ts`) y reporta el resultado.

## Paquete SQ — Suites SQL

**Propiedad:** `supabase/tests/**`.

- Ajusta las suites que la migración rompió: `humo_auditoria_adversarial` (métricas incoherentes en sus datos),
  `humo_configuracion` (58 plantillas, 57 claves), `humo_cron` (agenda `amo_indicadores_medios` en `1 5 * * *`; aviso de
  atrasadas por corte en `generar_recordatorios`, ya no en `marcar_metricas_atrasadas`; texto del multiplicador),
  `humo_negocio_transacciones` (capturas reales en `storage.objects`).
- Suite nueva `humo_e2_ejecucion.sql` con los criterios: marketplace (visibles, rechazadas aparte, pago por cuenta),
  elegibilidad, reserva (último cupo → «No quedan cupos en tu franja», ya aceptada antes que sin cupo, idempotencia de un
  solo uso, precio congelado), desistir, cupo liberado y su aviso, descarga fuera de plazo, evidencia (URL única y de
  publicación, captura en Storage, versión vigente al publicar), métricas (coherencia por fila y entre cortes, corte de la
  oferta, fecha del corte, personalizado idempotente, edición solo mientras admite), recordatorios y atrasadas por corte,
  seguimiento del anunciante (sin métricas pendientes ni rechazos), mis asignaciones y próximas acciones con número y corte.
  Si la BD no cumple algo, **no edites la migración**: repórtalo con el caso y el SQL propuesto.
