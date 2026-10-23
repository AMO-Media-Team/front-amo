# Fase 4 — Validación, verificación, disputas y suspensión (E3, parte 1)

Requisitos: ADM-002, ADM-007…012, INT-003, INT-004, INT-006 (criterios en `context/requisitos/datos/requisitos.mjs`).
Lee primero [`README.md`](README.md): sus reglas siguen vigentes. Mira también [`fase-2.md`](fase-2.md) (moderación:
el molde de las decisiones) y [`fase-3.md`](fase-3.md) (Mis campañas, ejecución, seguimiento).

## Lo que ya tiene la base

Migración `20261023171316_e3_validacion` (aplicada en la base local; tipos regenerados; §3.12 de `docs/modelo-datos.md`).
Los `*_srv` los ejecuta `service_role` con actor y sesión (`contextoDelActor` + `admin.rpc`, como `desistirAsignacion`).

| Objeto                                                                                                                                                                       | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validar_evidencia_srv(p_publicacion_id, p_aprobar, p_etiqueta_verificada, p_observaciones, p_actor_id, p_session_id)` → `{asignacion_id, estado, fecha_limite_publicacion}` | ADM-007. Aprobar exige `p_etiqueta_verificada = true` (`AMO_ETIQUETA_REQUERIDA`); al aprobar la última publicación la asignación pasa sola a `EVIDENCIA_VALIDADA` (y a `METRICAS_CARGADAS` si ya tiene todo). Rechazar exige observaciones (≤ 1000, `AMO_MOTIVO_REQUERIDO`), vuelve a `CONTENIDO_ENTREGADO` y da al medio al menos `evidencias.plazo_recarga_horas` (24 h) para cargar otra. Una asignación cerrada no se valida (hint `asignacion_cerrada`).                                                                                              |
| `validar_metrica_srv(p_metrica_id, p_aprobar, p_observaciones, p_actor_id, p_session_id)` → `{asignacion_id, estado}`                                                        | ADM-008. Aprobar exige la evidencia aprobada y, si la métrica tiene alerta, observaciones (hint `alerta_sin_revision`). Rechazar exige observaciones; si la asignación estaba en `METRICAS_CARGADAS` vuelve a `EVIDENCIA_VALIDADA`.                                                                                                                                                                                                                                                                                                                        |
| `corregir_metrica_srv(p_metrica_id, p_valores jsonb, p_motivo, p_actor_id, p_session_id)`                                                                                    | ADM-008 c2. Solo `metricas.editar_validadas` (ADMIN, no OPERACIONES), solo métricas `APROBADA`, motivo ≥ 10 caracteres; claves de `p_valores`: `fecha_corte`, `alcance`, `impresiones`, `reproducciones`, `espectadores_unicos`, `me_gusta`, `comentarios`, `compartidos`, `guardados`, `clics_enlace`, `visitas_perfil`, `tiempo_promedio_visualizacion_s`, `porcentaje_reproduccion_completa`. La bitácora guarda actor y motivo; si no cambia nada, `AMO_TRANSICION_INVALIDA`. Nadie del equipo reescribe cifras por la sesión.                         |
| `cancelar_asignacion_srv(p_asignacion_id, p_causa cancelacion_causa, p_motivo, p_suspender_medio, p_actor_id, p_session_id)` → `{asignacion_id, estado, medio_suspendido}`   | ADM-010 / INT-006. Causas `ADMINISTRATIVA`, `ACUERDO`, `INCUMPLIMIENTO_MEDIO`, `FRAUDE`. Con `p_suspender_medio` (solo fraude o incumplimiento) suspende al medio en la misma transacción. `LIQUIDADA`/`PAGADA` → hint `liquidacion_vigente` («anula primero la liquidación»); `EN_DISPUTA` → hint `en_disputa` (se cancela al resolverla). Libera cupo y presupuesto; fraude e incumplimiento cuentan como incumplimiento.                                                                                                                                |
| Verificar (`transicionar('asignaciones', id, 'VERIFICADA', motivo?, { permanencia_verificada? })`)                                                                           | ADM-009. Exige todos los cortes requeridos aprobados, ninguna métrica pendiente (hint `metricas_pendientes`) y la permanencia cumplida (`AMO_PERMANENCIA_PENDIENTE`: muéstralo como «Permanencia pendiente hasta {fecha}»). La constancia manual de permanencia (`permanencia_verificada` + motivo) solo con `metricas.editar_validadas`.                                                                                                                                                                                                                  |
| `cola_evidencias(p_limite, p_desplazamiento)`, `cola_metricas(p_solo_alertas, p_limite, p_desplazamiento)`, `cola_verificacion(p_limite, p_desplazamiento)`                  | Colas del equipo, lo más antiguo primero (métricas con alerta arriba; verificación: listas primero, con `bloqueo` `METRICAS` o `PERMANENCIA`). Columnas en `database.types.ts`. Cada una trae `total` para paginar.                                                                                                                                                                                                                                                                                                                                        |
| `alertas_metricas(p_asignacion_id default null, p_medio_id default null)`                                                                                                    | Las columnas `alerta_desviacion`, `alerta_multiplo` y `detalle_alertas` de `metricas` **ya no se leen por PostgREST** (`permission denied`): el medio no las ve y el equipo las lee aquí (`asignaciones.ver`). Con asignación: todas sus métricas; con medio: las que tuvieron alerta; sin nada: las pendientes con alerta. `detalle_alertas`: `mediana_historica`, `mediana_impresiones`, `n_historial`, `factor`, `seguidores`, `multiplo`, `alcance`, `impresiones`, `limite_alcance` y, si la hubo, `alerta_previa` (la que tuvo antes de corregirse). |
| `abrir_disputa_srv(p_asignacion_id, p_motivo disputa_motivo, p_descripcion, p_actor_id, p_session_id)` → uuid                                                                | ADM-011. Desde `PUBLICADA`, `EVIDENCIA_VALIDADA`, `METRICAS_CARGADAS` o `VERIFICADA` (cualquier parte); una `VENCIDA_SIN_PUBLICAR` solo la reclama el medio, con motivo `OTRO` o `INCUMPLIMIENTO`, hasta `vencida_at + disputas.plazo_vencida_horas` (72 h; `reclamo_hasta` en `mis_asignaciones_medio`). Una disputa abierta por asignación (`disputas_abierta_key`). Motivo `PERMANENCIA` marca el post como retirado.                                                                                                                                   |
| Resolver (`transicionar('disputas', id, 'EN_REVISION'                                                                                                                        | 'RESUELTA'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 'DESCARTADA', motivo, { estado_asignacion_resultante, causa?, permanencia_verificada? })`)                                                                                               | ADM-012. Opciones de `estado_asignacion_resultante`: el estado previo, `CANCELADA` (con `causa`), `VERIFICADA` si el previo es `METRICAS_CARGADAS` (mismas exigencias que verificar) y `CONTENIDO_ENTREGADO` si el previo es `VENCIDA_SIN_PUBLICAR` (retoma cupo y da `disputas.plazo_recarga_horas`; falla si la oferta ya cerró, hint `oferta_cerrada`). `DESCARTADA` restaura el previo. `EN_REVISION` no pide motivo. |
| `disputa_mensajes` (insert con la sesión: `disputa_id`, `mensaje`, `adjunto_path`, `interno`) y `mensajes_disputa(p_disputa_id)`                                             | Hilo: `autor_parte` (`MEDIO`, `ANUNCIANTE`, `ADMIN`), `autor_nombre` (el medio, la empresa o «Equipo AMO»), `autor_persona` (solo para quien tiene `usuarios.ver`), `es_mio`, `mensaje`, `adjunto_path`, `interno`, `created_at`. Escriben solo las partes (disputa abierta) o quien tiene `disputas.resolver`; las notas internas (`interno`) solo quien resuelve y van en `disputa/{id}/interno/…`. Adjuntos: bucket `evidencias`, `disputa/{id}/{uuid}.{ext}`, jpeg, png, webp o pdf de hasta 10 MB (`carpetaDisputa`, `prepararSubidaFirmada`).        |
| `asignaciones_en_curso_medio(p_medio_id)`                                                                                                                                    | ADM-002 c2: asignaciones en curso de un medio con su oferta, empresa, plazo, monto, disputa abierta y si se puede cancelar (en disputa se cancela al resolverla).                                                                                                                                                                                                                                                                                                                                                                                          |
| Medio suspendido                                                                                                                                                             | `transicionar('medios', id, 'SUSPENDIDO'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 'VERIFICADO', motivo)`con`medios.suspender`. No ve ofertas (`mi_elegibilidad_marketplace` ya dice el motivo), conserva lo que tiene en curso mientras el equipo decide y puede disputar. |
| Avisos nuevos o con datos nuevos                                                                                                                                             | `asignacion.reabierta` (reclamo a favor, con `plazo`), `cola.disputa_mensaje` (al equipo cuando una parte escribe), `evidencia.rechazada` (con `plazo`), `metricas.rechazadas` (corte en palabras).                                                                                                                                                                                                                                                                                                                                                        |
| Configuración nueva (pública)                                                                                                                                                | `evidencias.plazo_recarga_horas` (24) y `soporte.correo` (vacío: no hay correo definido; muestra el texto solo si tiene valor).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Medio durante una disputa                                                                                                                                                    | `puedo_cargar_metricas` y `proximas_acciones_medio` cuentan con el estado previo: el medio sigue cargando los cortes; `proximas_acciones_medio` devuelve además `RECLAMAR` (vencida reclamable, `vence_at` = fin del plazo).                                                                                                                                                                                                                                                                                                                               |

## Lo que integró el líder (no lo toques; si necesitas otra cosa ahí, repórtalo)

- Navegación: «Validación» (`/operacion/validacion`, `evidencias.validar` o `metricas.validar`) y «Disputas»
  (`/operacion/disputas`, `disputas.ver`) en Operación, después de «Moderación».
- `/ir`: `disputas` → equipo `/operacion/disputas/{id}` (con `disputas.ver`), medio `/mis-campanas/{asignacion}/disputa`,
  anunciante `/campanas/{campana}/asignaciones/{asignacion}/disputa`. Contrato: respeta esas rutas.
- Rutas: `src/features/validacion/rutas.ts` (`RUTA_VALIDACION`, `COLAS_VALIDACION`, `rutaColaValidacion`) y
  `src/features/disputas/rutas.ts` (`RUTA_DISPUTAS`, `rutaDisputaInterna`, `rutaDisputaMedio`, `rutaDisputaAnunciante`).
- Configuración: fichas de `evidencias.plazo_recarga_horas` y `soporte.correo` (texto libre editable).
- E2E: proyecto `validacion` (`SPECS_VALIDACION`: `validacion-*` y `disputas-*`, un worker, 1440 px), después de
  `pauta-medio` y `anunciante`. Las fábricas de la pauta ya existen (`e2e/utilidades/pauta.ts`: `prepararAsignacionE2E({
hasta })`, `validarEvidenciaE2E`, `aprobarMetricaE2E`…); las nuevas las hace el paquete E0 con los nombres de abajo.
- La sesión E2E `interno` es un ADMIN con TOTP (`CUENTA_INTERNA`).

**Convenciones de la fase:** las decisiones siguen el molde de la moderación (`src/features/moderacion`: módulo puro de
decisiones a partir de `accionesPermitidas`, con `bloqueo` explicado; `DialogoConfirmacion`, `DialogoMotivo`
(`src/features/usuarios/components/dialogo-motivo.tsx`), foco tras el cambio y toast con «Volver a la cola»). Las colas
siguen `src/features/verificacion/colas.ts` (parámetros en la URL con nuqs, paginación acotada, `NavegacionColas`). Para
revisar capturas: `useFirmas`, `Miniatura` y el visor de `src/features/operacion/components/evidencias-asignacion.tsx`, y
`HojaRevision` de `src/features/verificacion`. Errores de la BD con `mensajeErrorBd`; los `hint` nuevos tienen texto propio
en la interfaz. Interno: escritorio primero pero usable a 834 y 390 px; externo: móvil primero (390 px).

## Paquete VA — Validación (ADM-007, ADM-008, ADM-009)

**Propiedad:** `src/features/validacion/**` (conserva `rutas.ts`), `src/app/(app)/operacion/validacion/**`,
`src/features/operacion/components/evidencias-asignacion.tsx`, `e2e/validacion-colas.spec.ts`.

- `/operacion/validacion?cola=evidencias|metricas|verificar&pagina=` (`requerirPermiso(["evidencias.validar",
"metricas.validar"])`; `evidencias` exige `evidencias.validar`, las otras `metricas.validar`): tarjetas de cola con
  contador, lo más antiguo primero.
  - **Evidencias:** post (abre en otra pestaña), captura (visor), número de publicación, medio y cuenta, oferta, etiqueta
    declarada, observaciones previas. Aprobar exige marcar «La etiqueta de publicidad es visible»; rechazar pide
    observaciones (sugerencias: «El post no abre públicamente», «Falta la etiqueta de publicidad», «La captura no
    corresponde al post»…). Tras decidir, la siguiente de la cola.
  - **Métricas:** cifras por plataforma, captura y, si hay alerta, su porqué lado a lado (mediana histórica, factor,
    seguidores, múltiplo, límite: ADM-008 c1); filtro «Solo con alertas». Aprobar una con alerta exige anotar qué se revisó.
  - **Verificar:** listas primero; las bloqueadas dicen por qué («Faltan métricas por aprobar», «Permanencia pendiente hasta
    {fecha}»).
- Decisiones reutilizables en la ficha de la asignación: en `evidencias-asignacion.tsx`, por publicación y por corte, los
  mismos controles (aprobar, rechazar y, con `metricas.editar_validadas`, «Corregir» una aprobada: formulario con motivo
  obligatorio y las reglas de coherencia de `src/features/ejecucion/coherencia.ts`).
- **`VerificarAsignacion`** (contrato): componente cliente exportado desde
  `src/features/validacion/components/verificar-asignacion.tsx` con props `{ asignacionId: string; estado:
EstadoAsignacion; publicaciones: PublicacionEvidencia[]; cortesRequeridos: Corte[]; puedeVerificar: boolean;
puedeConstanciaManual: boolean }` (tipos de `src/features/operacion`): botón «Verificar» con el bloqueo explicado o la
  confirmación; con constancia manual, motivo obligatorio. El líder lo monta en la cabecera de la ficha.
- Acciones en `src/features/validacion/actions.ts` (`validarEvidencia`, `validarMetrica`, `corregirMetrica`,
  `verificarAsignacion`), cada una con `requerirPermiso` y `revalidatePath` de la ficha y la cola.

## Paquete AS — Ficha de la asignación y alertas (ADM-010, ADM-011 del equipo, INT-003/004 en Operación)

**Propiedad:** `src/features/operacion/**` salvo `components/evidencias-asignacion.tsx` (VA) y lo del medio (MS:
`components/ficha-medio.tsx`, `components/secciones-medios.tsx`, `components/tabla-medios.tsx`, `components/cuentas-sociales.tsx`,
`queries/medios.ts`), `src/app/(app)/operacion/asignaciones/**`, `src/features/dashboard/admin/**`,
`e2e/validacion-asignacion.spec.ts`.

- **Alertas por RPC:** `obtenerAsignacion` lee las alertas con `alertas_metricas(p_asignacion_id)`; el filtro «Con alertas»
  de la lista de asignaciones toma los ids de `alertas_metricas()` (pendientes con alerta); el panel del administrador
  (`metricasAtipicasPendientes`) también. Nada en `src/` debe seleccionar esas columnas de `metricas`.
- **Cabecera de la ficha:** `CabeceraAsignacion` acepta `acciones` (el hueco de `CabeceraFicha`); en el celular, en
  `PieAcciones`. Acciones: «Cancelar» (`asignaciones.gestionar`): causa del catálogo (`CAUSAS_CANCELACION`), motivo y, con
  fraude o incumplimiento del medio, «Suspender también al medio» (`cancelar_asignacion_srv`); bloqueos explicados para
  `LIQUIDADA`/`PAGADA` («Anula primero la liquidación») y `EN_DISPUTA` («Se cancela al resolver la disputa»). «Abrir
  disputa» (`disputas.abrir`, en los estados disputables y sin otra abierta) con motivo y descripción
  (`abrir_disputa_srv` como ADMIN) o «Ver la disputa» (`rutaDisputaInterna`). Deja un hueco `verificar` para el
  `VerificarAsignacion` de VA (el líder lo conecta).
- `DisputasAsignacion` enlaza cada disputa a `rutaDisputaInterna(id)`.

## Paquete MS — Ficha y suspensión de medios (ADM-002)

**Propiedad:** `src/features/operacion/components/{ficha-medio,secciones-medios,tabla-medios,cuentas-sociales}.tsx`,
`src/features/operacion/queries/medios.ts`, `src/features/gestion-medios/components/acciones-ficha-medio.tsx`,
`src/features/suspension-medios/**` (nuevo), `src/app/(app)/operacion/medios/**`, `e2e/validacion-medios.spec.ts`.

- «Suspender» / «Reactivar» (`medios.suspender`) en las acciones de la ficha, con motivo obligatorio. El diálogo de
  suspensión muestra las asignaciones en curso (`asignaciones_en_curso_medio`) con enlace a cada ficha para decidir si se
  cancelan (ADM-002 c2), y el resultado dice cuántas quedan en curso.
- Pestañas nuevas en la ficha del medio: «Disputas» (las de sus asignaciones, con estado y enlace) y «Alertas» (métricas con
  alerta: `alertas_metricas(p_medio_id)`, con su porqué y enlace a la asignación). El historial de asignaciones,
  cumplimiento, documentos y verificaciones ya existen.

## Paquete DI — Disputas del equipo y bloques compartidos (ADM-011, ADM-012)

**Propiedad:** `src/features/disputas/**` (conserva `rutas.ts`), `src/app/(app)/operacion/disputas/**`,
`e2e/disputas-bandeja.spec.ts`.

- Bloques que usa DX (contrato, exportados desde `src/features/disputas`): tipos (`DisputaDetalle`, `MensajeDisputa`),
  consultas server-only (`disputasDeAsignacion(asignacionId)`, `mensajesDeDisputa(disputaId)` con
  `mensajes_disputa`), acciones (`abrirDisputa({ asignacionId, motivo, descripcion })`, `prepararAdjuntoDisputa`,
  `enviarMensajeDisputa({ disputaId, mensaje, adjuntoPath?, interno? })`, `firmarAdjuntoDisputa`) y componentes
  (`HiloDisputa` con el hilo, los adjuntos firmados y la caja de respuesta; `EstadoDisputa`; textos de motivos y estados
  por parte en `presentacion.ts`). Documenta las props en el informe.
- `/operacion/disputas` (`disputas.ver`): bandeja con filtros en la URL (estado: abiertas, en revisión, cerradas; motivo;
  parte) y la tabla genérica (`src/components/data-table`), lo más antiguo primero entre las abiertas.
- `/operacion/disputas/[id]`: asignación resumida (enlace a su ficha), quién abrió y por qué, hilo con notas internas
  resaltadas («Solo la ve el equipo AMO»), adjuntos; acciones con `disputas.resolver`: «Tomar en revisión», «Resolver»
  (opciones según el estado previo, con causa si cancela y la explicación de cada efecto: restaurar, verificar, reabrir la
  publicación de una vencida con 24 h para la evidencia, cancelar) y «Descartar», con motivo. FINANZAS la ve en solo lectura.

## Paquete DX — Disputas y reclamos de medio y anunciante (ADM-011, MED-011 c2, MED-008 c2) — corre después de DI

**Propiedad:** `src/app/(app)/mis-campanas/[id]/disputa/**`, `src/app/(app)/campanas/[id]/asignaciones/**`,
`src/features/mis-campanas/**`, `src/features/seguimiento/**`, `src/features/dashboard/medio/**`,
`src/features/ejecucion/presentacion.ts`, `src/features/mi-medio/presentacion.ts`, `e2e/pauta-medio-disputa.spec.ts`,
`e2e/anunciante-disputa.spec.ts`.

- **Medio** `/mis-campanas/[id]/disputa` (`disputas.abrir`): una vencida reclamable → «Reclamar: sí publiqué», motivo `OTRO`,
  descripción precargada «Sí publiqué y no se registró» (editable), enlace del post y captura opcionales (primer mensaje),
  cuenta regresiva hasta `reclamo_hasta` y el aviso «Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la
  razón, tendrás 24 horas para cargar la evidencia». En los estados disputables: «Reportar un problema» con motivos
  Métricas, Contenido, Pago y Otro. Siempre: «Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO». Abierta:
  el hilo; cerrada: el resultado en voz del medio («Te dimos la razón: tienes hasta {fecha}…», «Se mantuvo la decisión»,
  «Quedó verificada», «Se canceló tu participación»).
- En Mis campañas: el paso «reclamo» y la ficha enlazan a esa página (no más «escríbele al equipo AMO» sin canal: usa
  `soporte.correo` solo si tiene valor), insignia «En disputa» en la tarjeta y aviso de suspensión en el tablero y en cada
  ficha en curso («Tu medio está suspendido. El equipo AMO revisa tus campañas en curso; mientras no te avisemos que se
  cancelan, puedes seguir cumpliéndolas.»). Cancelada por fraude: «Según los términos que aceptaste, esta publicación no se
  paga.». En `EN_DISPUTA` con cortes pendientes, el siguiente paso sigue siendo cargarlos.
- Inicio del medio: la acción `RECLAMAR` («Reclama la publicación», con su plazo) lleva a la disputa.
- **Anunciante:** en el seguimiento, «Reportar un problema» (estados disputables, sin otra abierta; motivos Incumplimiento,
  Métricas, Contenido, Permanencia, Otro) o «Ver la disputa»; página `/campanas/[id]/asignaciones/[asignacionId]/disputa`
  con el mismo hilo y el aviso «Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo
  verán el medio y el equipo AMO.».

## Paquete E0 — Fábricas E2E de la fase

**Propiedad:** `scripts/bootstrap/**`, `scripts/pruebas/**`, `e2e/utilidades/**` salvo `prueba.ts` y `proyectos.ts`,
`.env.example`.

- Cuenta `OPERACIONES` (con TOTP como los roles internos) y un medio verificado dedicado a suspensión («Medio Suspensión
  E2E», con una cuenta de Instagram vigente) para no tocar «Medio E2E». Credenciales en variables `E2E_*` de `.env.local`
  (genéralas sin imprimirlas; documenta los nombres, sin valores, en `.env.example`).
- API para los specs (`e2e/utilidades/validacion.ts`), por el camino real y con la guarda de producción:
  `ingresarComoOperaciones(page)`, `asignacionConEvidenciaPendienteE2E()`, `asignacionConMetricaPendienteE2E({ conAlerta? })`
  (alerta por múltiplo: alcance > 2 × seguidores en Instagram), `asignacionListaParaVerificarE2E({ permanenciaDias? })`,
  `abrirDisputaE2E({ asignacionId, como: "MEDIO"|"ANUNCIANTE"|"ADMIN", motivo, descripcion })`,
  `mensajeDisputaE2E({ disputaId, como, mensaje, interno? })`, `resolverDisputaE2E({ disputaId, resultado, causa? })`,
  `vencerAsignacionE2E({ asignacionId })` (solo local: lleva el plazo al pasado y corre `private.vencer_asignaciones()` por
  la conexión de la base local), `cancelarAsignacionE2E({ asignacionId, causa })`, `suspenderMedioE2E()` /
  `reactivarMedioE2E()` (el medio dedicado) y `restablecerValidacionE2E()` (limpieza de las campañas «Validación E2E»).
  Campañas con el prefijo «Validación E2E».
- `pnpm bootstrap:e2e` crea las cuentas nuevas; `pnpm pruebas:pauta-e2e` (o un comprobador nuevo) verifica las fábricas.

## Paquete SQ — Suite SQL

**Propiedad:** `supabase/tests/humo_e3_validacion.sql` (nueva) y ajustes en otras suites si hace falta (no en las
migraciones). Cubre cada objeto de la tabla de arriba con casos positivos y negativos (permisos por rol: ADMIN, OPERACIONES,
FINANZAS, medio, anunciante; atomicidad; plazos con `amo.reloj`; alertas por cuenta, por impresiones, persistentes e
invisibles para medio y anunciante; colas; resolución de disputas con cada destino; oferta que no cierra con una vencida
reclamable; métricas durante la disputa; `asignacion.reabierta`; `cola.disputa_mensaje`). Corre con `pnpm db:suites local`.

## Decisiones de la fase (D65–D74, en `docs/modelo-datos.md` §11.1)

D65 validación atómica y plazo de recarga · D66 corrección solo por `corregir_metrica_srv` · D67 alertas por cuenta,
persistentes y ocultas · D68 constancia al aprobar con alerta; sin pendientes al verificar; constancia manual solo ADMIN ·
D69 cancelación con causa y suspensión opcional · D70 reclamo de vencida (Otro o Incumplimiento) y oferta que no cierra
mientras se pueda reclamar · D71 mensajes con su parte · D72 métricas durante la disputa · D73 medio suspendido sigue
cumpliendo lo que tiene y sus verificadas se liquidan · D74 `soporte.correo`.
