# Fase 6 — Cierre de la Entrega 3

Requisitos: ADM-014, MED-016, CTA-007, NOT-004, NOT-007, NOT-003 (resto), CFG-001 y CFG-005 (criterios «Verificable en E2/E3»),
DSH-003, GEO-010 y RNF-ACC-01 / RNF-COM-01 (criterios en `context/requisitos/datos/requisitos.mjs`; léelos, no los copies).
Lee primero [`README.md`](README.md): sus reglas siguen vigentes. El molde de pantallas y decisiones es el de
[`fase-4.md`](fase-4.md) y [`fase-5.md`](fase-5.md).

## Lo que ya tiene la base

Migración `20261024181218_e3_cierre` (aplicada en la base local; tipos regenerados; suite `humo_e3_cierre.sql` 76/76).
Los `*_srv` los ejecuta `service_role` con actor y sesión (`contextoDelActor` + `admin.rpc` + `argumentosRpc`, como en
`src/features/validacion/actions.ts`). Las lecturas sin `_srv` van con la sesión. Firmas exactas en
`src/types/database.types.ts`.

| Objeto                                                                                                                                                                                                              | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `campanas.gestion_asistida`, `ofertas.gestion_asistida`                                                                                                                                                             | ADM-014. `true` cuando la creó alguien de tipo de rol ADMIN; la fija el trigger, nadie la edita. Para la insignia «Creada por el equipo AMO» y el filtro `?origen=asistida`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Bitácora de `campanas`, `ofertas`, `oferta_cupos`, `creativos`, `creativo_archivos`                                                                                                                                 | Si actúa un interno (y no es moderación ni el cron): `metadatos = {"modo": "ASISTIDO", "anunciante_id": …}`; el actor es el operador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Avisos `campana.gestion_asistida` y `oferta.gestion_asistida`                                                                                                                                                       | Al anunciante cuando el equipo crea, activa o cancela su campaña, o envía a revisión, retira o cancela su oferta («El equipo AMO {acción} … por cuenta de tu empresa.»). La cola de moderación dice «(por el equipo AMO)». Las colas ya no le avisan a quien actúa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Permisos de la gestión asistida                                                                                                                                                                                     | `campanas.gestionar` y `ofertas.gestionar` (SUPERADMIN, ADMIN, OPERACIONES). La RLS, las transiciones ADMIN y `puedo_subir_creativo` ya los admiten. El envío a revisión y la activación exigen la empresa VERIFICADO para cualquier actor. Cancelar un borrador o una devuelta pide motivo al interno (no al anunciante).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `mi_reputacion()`                                                                                                                                                                                                   | MED-016. Del medio en sesión (`inicio.medio`): `tasa` (null si `n < n_minimo`), `n`, `cumplidas`, `n_minimo`, `publicaciones_total`, `publicaciones_180d`, `calculada_at`, `casos` (jsonb: `asignacion_id`, `oferta`, `limite`, `estado`, `cumplida`). Ventana de 180 días a hoy, la misma regla del cron.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `medios_cerca_tope()`                                                                                                                                                                                               | CFG-005 c3 (`medios.ver`): `medio_id`, `consumido`, `tope`, `fraccion` de los medios que pasaron el porcentaje de alerta de su tope anual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `configuracion.pendiente_validacion`                                                                                                                                                                                | CFG-001: `authenticated` puede actualizarla (con la política de siempre: `configuracion.editar` y contexto del servidor). Solo de `true` a `false`; volver a marcarla falla con `AMO_CONFIG_INVALIDA`. Queda en la bitácora.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `solicitudes_titular` (tabla)                                                                                                                                                                                       | CTA-007. El titular lee las suyas; `privacidad.gestionar` (SUPERADMIN, ADMIN) lee todas. Columnas: `numero` (radicado), `tipo` (`CONSULTA`, `PRUEBA_AUTORIZACION`, `ACTUALIZACION`, `RECTIFICACION`, `SUPRESION`, `REVOCATORIA`), `estado` (`RADICADA`, `EN_TRAMITE`, `REQUIERE_INFORMACION`, `RESPONDIDA`, `DESISTIDA`), `descripcion`, `datos_afectados` (`IDENTIFICACION`, `CONTACTO`, `PAGO`, `DOCUMENTOS`, `CUENTAS_SOCIALES`, `ACCESOS`, `ACTIVIDAD`, `AUTORIZACIONES`, `OTROS`), `recibida_at`, `plazo_vence` y `alerta_desde` (fechas; el semáforo es: vencida si hoy > `plazo_vence`, por vencer si hoy ≥ `alerta_desde`), `requerimiento`/`requerida_at`, `informacion_aportada`/`informacion_at`, `prorroga_motivo`/`prorrogada_at`, `decision` (`PROCEDE`, `PROCEDE_PARCIAL`, `NO_PROCEDE`), `respuesta`, `respondida_at`, `evidencia_path`, `supresion_ejecutada_at`, `supresion_resultado`, `rol_tipo`, `medio_id`, `anunciante_id`, `perfil_id` (null tras la supresión). |
| `radicar_solicitud_titular_srv(p_actor_id, p_session_id, p_tipo, p_descripcion, p_datos_afectados)` → uuid                                                                                                          | El titular (`cuenta.gestionar`). Plazo: consulta y prueba de la autorización 10 días hábiles; reclamos 15 (configurables, festivos de Colombia). Una abierta por tipo (`AMO_SOLICITUD_ABIERTA`). Avisa al titular (`titular.solicitud_radicada`) y a la cola (`cola.solicitud_titular`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tramitar_…`, `requerir_informacion_titular_srv(…, p_requerimiento)`, `prorrogar_solicitud_titular_srv(…, p_motivo)` → fecha nueva, `responder_solicitud_titular_srv(…, p_decision, p_respuesta, p_evidencia_path)` | El equipo (`privacidad.gestionar`). Prórroga una vez y antes del vencimiento (`AMO_FUERA_DE_VENTANA`). Respuesta de 20 a 4000 caracteres; soporte PDF opcional en `soportes/titular/{id}/{uuid}.pdf`. Cada una avisa al titular.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `aportar_informacion_titular_srv(…, p_informacion)`, `desistir_solicitud_titular_srv(…)`                                                                                                                            | El titular dueño. Aportar reinicia el plazo legal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `datos_titular(p_perfil_id default null)` → jsonb                                                                                                                                                                   | Con la sesión: el propio titular, o `privacidad.gestionar` para atender una consulta. `perfil`, `identificacion`, `medio` (con `datos_reservados`, `cuentas_sociales`, `documentos`), `empresa`, `autorizaciones`, `accesos` (365 días), `actividad`, `consultas_de_tus_datos_reservados` (fecha y rol de quien consultó), `solicitudes`. Nunca valores cifrados. Queda `EXPORTAR` en la bitácora.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `suprimir_titular_srv(p_solicitud_id, …, p_simular default true)` → jsonb                                                                                                                                           | Simulación: `bloqueos` (texto listo), `cuenta`, `medio` (`BORRAR`│`ANONIMIZAR`│`CONSERVAR`│`NINGUNA`), `contacto_empresa`, `archivos` (`{bucket, prefijo}` o `{bucket, ruta}`), `se_conserva`. Ejecutar exige la solicitud RESPONDIDA con PROCEDE o PROCEDE_PARCIAL (`AMO_SUPRESION_BLOQUEADA` con bloqueos). Borra la cuenta y devuelve los archivos que la acción borra de Storage **después** (cliente de servicio). Nadie suprime sus propios datos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cron `amo_privacidad` (08:10)                                                                                                                                                                                       | Desistimiento a los 2 meses sin respuesta y aviso `cola.solicitud_titular_por_vencer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Correo (NOT-004)                                                                                                                                                                                                    | `correo.habilitado = false`, `correo.max_intentos`, `correo.lote`. Con el correo encendido, `notificar` encola en `private.correos_salientes` (no con cuentas demo, plantilla EMAIL inactiva o categoría silenciada). `reclamar_correos_srv(p_limite)` → filas `{correo_id, intento, destinatario, nombre, clave, asunto, cuerpo, datos, titulo, mensaje, entidad, entidad_id, url}` (exige contexto confiable: el cliente de servicio de Next ya lo manda); `registrar_envio_correo_srv(p_id, p_intento, p_resultado 'ENVIADO'│'REINTENTO'│'FALLIDO'│'APLAZADO', p_proveedor_id, p_error)` → `ENVIADO`│`REINTENTO`│`FALLIDO`│`APLAZADO`│`IGNORADO` (APLAZADO: no se alcanzó a intentar; vuelve a la cola sin gastar el intento). Una plantilla EMAIL por cada APP (las `cola.*` inactivas). Job `amo_correos` creado **inactivo** (pg_net se habilita al activar).                                                                                                                      |
| Silencio por categoría                                                                                                                                                                                              | `perfiles.preferencias.correo.silenciadas`: lista de claves de `CLAVES_CATEGORIA` (`src/features/notificaciones/presentacion.ts`). `seguridad` y `privacidad` nunca se silencian. La correspondencia prefijo → categoría está copiada en `private.categoria_notificacion` (la migración).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Aviso en vivo (NOT-007)                                                                                                                                                                                             | Broadcast privado `usuario:{id}`, evento `notificacion`, payload `{id, tipo, prioridad, no_leidas}` (ya sin título). Política «realtime: tópico propio» (solo el dueño, con `acceso_valido`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Limpieza                                                                                                                                                                                                            | `private.limpiar_pruebas(p_conservar uuid[], p_terminos uuid[])` → conteos por tabla. Solo como `postgres` con `amo.modo_carga` y `amo.purga`; `p_conservar` = exactamente los superadministradores activos. `private.tablas_limpieza()` clasifica cada tabla (`conservar`/`borrar`); una prueba exige que toda tabla nueva quede clasificada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Lo que integró el líder (no lo toques; si necesitas otra cosa ahí, repórtalo)

- Permiso `privacidad.gestionar` (`src/lib/auth/permisos.ts`, semilla y §6).
- Navegación: **Datos personales** (`/administracion/privacidad`, `privacidad.gestionar`), **Privacidad** en Cuenta
  (`/cuenta/privacidad`, `cuenta.gestionar`), subpágina **Reputación** de Mi medio, `/api/correos/procesar` en
  `RUTAS_PUBLICAS`.
- `/ir`: `solicitudes_titular` → equipo con `privacidad.gestionar` `/administracion/privacidad/{id}`; los demás
  `/cuenta/privacidad?solicitud={id}`. Campañas y ofertas: sin cambios.
- Contratos: `src/features/privacidad/rutas.ts`, `RUTAS_MI_MEDIO.reputacion` (`src/features/mi-medio/alta.ts`),
  `carpetaSoporte("titular", id)` (`src/lib/storage/rutas.ts`), categoría `privacidad` (prefijo `titular`) en
  `src/features/notificaciones/presentacion.ts`, errores `AMO_SOLICITUD_ABIERTA` y `AMO_SUPRESION_BLOQUEADA`
  (`src/lib/errores-bd.ts`), rótulos de auditoría `solicitudes_titular` y `plataforma`.
- E2E: proyecto `cierre` (`SPECS_CIERRE`: `e2e/cierre-*.spec.ts`, un worker, 1440 px, al final). Las pruebas que escriben
  se saltan fuera de ese proyecto (`test.skip(info.project.name !== PROYECTO_CIERRE, …)`).
- `package.json` (scripts nuevos), `playwright.config.ts`, `src/lib/auth/navegacion.ts` y `supabase/**`: solo el líder.

**Convenciones:** las de las fases 4 y 5 (DAL en cada página y acción, `transicionar`/`*_srv`, `DialogoConfirmacion`,
`DialogoMotivo`, foco tras el cambio, toast, `mensajeErrorBd`, nuqs, tabla genérica, `formatearCOP`, `src/lib/fechas.ts`).
Interno: escritorio primero, usable a 834 y 390 px; medio y anunciante: móvil primero (390 px). Español de Colombia,
WCAG 2.2 AA, temas oscuro y claro, movimiento reducido. Cada agente corre `pnpm exec tsc --noEmit -p .` (o
`pnpm typecheck`), `pnpm exec eslint <sus rutas>`, `pnpm exec vitest run <sus rutas>` y `pnpm exec prettier --write <sus
rutas>`; nadie corre `pnpm build`, la suite E2E completa ni `git stash|checkout|reset`, ni toca `package.json`.

## Paquete GA — Gestión asistida por cuenta del anunciante (ADM-014)

**Propiedad:** `src/features/campanas/**`, `src/features/asistente-oferta/**`, `src/features/ofertas/**`,
`src/features/creativos/**`, `src/features/moderacion/**`, `src/features/operacion/components/ficha-campana.tsx`,
`src/features/operacion/components/lista-campanas.tsx`, `src/features/operacion/components/secciones-campanas.tsx`,
`src/features/operacion/components/ficha-anunciante.tsx` (solo el botón «Nueva campaña»),
`src/app/(app)/operacion/campanas/**`, `src/app/(app)/operacion/ofertas/**`, `src/app/(app)/campanas/**`,
`e2e/cierre-asistida.spec.ts`.

- **Acciones:** amplía el DAL a `["campanas.gestionar_propias", "campanas.gestionar"]` y `["ofertas.gestionar_propias",
"ofertas.gestionar"]` en `src/features/campanas/actions.ts`, `src/features/asistente-oferta/actions.ts` y
  `src/features/ofertas/actions.ts`. La empresa propia solo se exige al anunciante (`usuario.rol.tipo === "ANUNCIANTE"`);
  en modo asistido `crearCampana` recibe `anuncianteId` (zod uuid) y la edición lee la campaña sin filtrar por la empresa
  de la sesión (la RLS decide). La BD es la autoridad.
- **Rutas inyectables:** módulo puro `src/features/campanas/rutas-gestion.ts` con `ModoGestion` (`{ modo: "propio" }` o
  `{ modo: "asistido"; anuncianteId; anunciante }`) y `rutasGestion(modo)` (`campana`, `ofertasCampana`, `oferta`,
  `asistente`, `editarCampana`, `listado`). Reemplaza las rutas del anunciante escritas a mano en el asistente
  (`asistente-oferta.tsx`, `paso-que.tsx`, `paso-envio.tsx`, `seccion-asistente.tsx`), `formulario-campana.tsx`,
  `acciones-campana.tsx`, `acciones-oferta.tsx` y `paginas.tsx`. Los textos en voz del anunciante cambian en modo asistido
  («AMO la revisa…» → «Queda en la cola de moderación»).
- **Acciones por actor:** `accionesAnunciante` → `accionesGestion(estado, tipoActor, permisos, …)`: para ADMIN, solo las
  transiciones con `ofertas.gestionar` (las de moderación siguen en `decisionesDisponibles`); motivo según
  `requiereMotivo` por actor. `puedeEditarCampana` recibe el tipo de actor.
- **Pantallas** (cada página exige **todos** sus permisos: un `requerirPermiso` por permiso):
  - `/operacion/campanas/nueva?anunciante=` (`campanas.gestionar` + `campanas.ver` + `anunciantes.ver`): selector de
    anunciante (no borrados; nombre y estado de verificación) y el formulario de campaña en modo asistido → ficha interna.
  - `/operacion/campanas/[id]/editar` (mismos permisos).
  - `/operacion/campanas/[id]/ofertas/nueva` (`ofertas.gestionar` + `ofertas.ver` + `campanas.ver`): el asistente en modo
    asistido → `/operacion/ofertas/[id]`.
  - `/operacion/ofertas/[id]/editar` (BORRADOR y DEVUELTA).
  - Ficha `/operacion/campanas/[id]`: con `campanas.gestionar`, «Nueva oferta», «Editar», activar, cancelar con motivo,
    archivar; insignia «Creada por el equipo AMO» si `gestion_asistida`.
  - Ficha `/operacion/ofertas/[id]`: con `ofertas.gestionar`, panel **«Gestión por cuenta del anunciante»** separado de la
    decisión de moderación (editar, enviar o reenviar, retirar, cancelar con motivo, archivar) y la carga del paquete
    creativo (`SeccionCreativosAnunciante` con `puedeGestionar`) en lugar de la vista de solo lectura.
  - `/operacion/campanas` y la ficha del anunciante: botón «Nueva campaña» (con el anunciante preseleccionado en la ficha);
    filtro `origen=asistida`.
  - Aviso visible en todas las pantallas asistidas (`AvisoModoAsistido`): «Estás actuando por cuenta de {anunciante}.
    Cada cambio queda en la bitácora a tu nombre. La empresa recibe un aviso cuando creas, activas o cancelas una campaña, y cuando envías, retiras o cancelas una oferta.» Si la empresa no está verificada: «Puedes
    preparar borradores; activar y enviar a revisión exige la empresa verificada».
- **Pruebas:** Vitest de `rutasGestion`, `accionesGestion` (ADMIN y ANUNCIANTE, motivo al cancelar el borrador) y de que
  las acciones aceptan cualquiera de los dos permisos y solo exigen empresa al anunciante. E2E
  `e2e/cierre-asistida.spec.ts`: con la cuenta ADMIN E2E, por cuenta de «Anunciante E2E», crear campaña, oferta (asistente)
  y subir el creativo (reutiliza las utilidades de `e2e/anunciante-creativo.spec.ts`), enviar a revisión; luego como
  anunciante ver la campaña con el aviso y «Equipo AMO» en el historial.

## Paquete RP — Reputación, configuración y paneles (MED-016, CFG-001, CFG-005, DSH-003)

**Propiedad:** `src/features/reputacion/**` (nuevo), `src/app/(app)/mi-medio/reputacion/**`,
`src/features/dashboard/medio/**`, `src/features/dashboard/insights/**`, `src/features/configuracion/**`,
`src/features/operacion/queries/medios.ts`, `src/features/operacion/estado-tablas.ts`,
`src/features/operacion/components/tabla-medios.tsx` y `secciones-medios.tsx` si existen (solo el filtro),
`src/features/mi-medio/components/**` (solo el enlace a reputación en el alta o en el índice de Mi medio),
`e2e/cierre-reputacion.spec.ts`.

- `/mi-medio/reputacion` (`requerirPermiso("medios.editar_propio")` como sus hermanas, con `EncabezadoSeccionMiMedio`,
  `LimiteErrorMiMedio` y `Suspense`; 390 px primero): tasa de cumplimiento a hoy con «n de N negocios» o **«Sin historial
  suficiente»** (criterio MED-016), publicaciones realizadas (totales y de 180 días), multiplicador de calidad vigente con
  su explicación (reutiliza `CalidadCuentas` de `src/features/calidad-medio` sin editarlo) y los casos de la ventana
  (oferta, fecha límite, cumplida o no) — de `mi_reputacion()`. La calificación promedio: «Llega con la calificación de los
  anunciantes» (no hay escritor). Enlace desde la tarjeta «Tu reputación» de `/inicio` y desde Mi medio.
- `dashboard/medio`: el mínimo de casos de la tarjeta sale de `mi_reputacion().n_minimo` (hoy lee una clave que el medio no
  puede leer y usa 3 siempre).
- CFG-001: en Configuración, junto a la insignia «Pendiente de validación» de cada parámetro, «Confirmar valor» (acción
  `confirmarParametro({ clave, actualizadoAt })` con bloqueo optimista; `configuracion.editar`; con
  `DialogoConfirmacion`). Módulos nuevos `privacidad` y `correo` con su rótulo; la lista de plantillas se filtra por canal
  (Aplicación / Correo) y conoce los dominios que faltan (`medio`, `documento`, `anunciante`, `campana`, `factura`, `cola`,
  `titular`). Ayuda del peso del formato: rige el menor entre el del formato y `archivos.max_creativo_mb`.
- CFG-005 c3: segmento «Cerca del tope anual» en `/operacion/medios` (`SEGMENTOS_MEDIO = ["en_riesgo", "cerca_tope"]`,
  `idsCercaTope()` con `medios_cerca_tope()`).
- DSH-003: la regla de métricas atípicas enlaza a `rutaCola("metricas", { soloAlertas: true })` de
  `@/features/validacion/colas` (actualiza su prueba).
- E2E `e2e/cierre-reputacion.spec.ts`: el medio E2E ve su reputación; un administrador confirma un parámetro pendiente y
  la insignia desaparece (vuelve a dejarlo pendiente al final por la base local, nunca en producción).

## Paquete PV — Derechos del titular de datos (CTA-007)

**Propiedad:** `src/features/privacidad/**` (conserva `rutas.ts`), `src/app/(app)/cuenta/privacidad/**`,
`src/app/(app)/administracion/privacidad/**`, `src/features/cuenta/components/navegacion-cuenta.tsx`,
`e2e/cierre-privacidad.spec.ts`, `e2e/utilidades/privacidad.ts`.

- `/cuenta/privacidad` (`requerirPermiso("cuenta.gestionar")`; móvil primero) y su pestaña en `navegacion-cuenta.tsx`:
  1. **Tus datos:** qué trata AMO por categoría y dónde rectificarlos uno mismo (`/cuenta/perfil`, `/mi-medio/perfil`,
     `/mi-medio/pago`, `/empresa?pestana=datos` según el rol).
  2. **Autorizaciones:** documento, versión, fecha e IP enmascarada (de `datos_titular`), con enlace al texto.
  3. **Descargar mis datos:** JSON y Excel (ExcelJS de `src/lib/export`) de `datos_titular()`.
  4. **Radicar solicitud:** tipo (consulta, prueba de la autorización, actualización, rectificación, supresión,
     revocatoria) con una explicación corta de cada derecho y su plazo legal, descripción y datos afectados →
     `radicar_solicitud_titular_srv`. Confirmación con el número de radicado y la fecha límite.
  5. **Mis solicitudes:** radicado, tipo, estado en voz del titular, fecha límite, requerimiento (con «Responder»
     → `aportar_informacion_titular_srv`), prórroga y motivo, respuesta con su soporte (descarga firmada **como servicio**
     después de comprobar con la sesión que la solicitud es suya), «Desistir». `?solicitud=` resalta y enfoca una.
- `/administracion/privacidad?estado=&tipo=&vence=` (`privacidad.gestionar`): bandeja con semáforo («Vencida», «Vence
  hoy», «Por vencer», «En plazo»), radicado, tipo, rol del titular, recibida, vence, estado. `/administracion/privacidad/[id]`:
  titular (nombre, correo, rol, organización con enlace), solicitud, línea de tiempo (de la bitácora), y las acciones:
  «Tramitar», «Pedir información» (`DialogoMotivo`; ayuda: el art. 15 pide hacerlo dentro de 5 días), «Prorrogar» (una
  vez, antes del vencimiento, con motivo), «Responder» (decisión, respuesta y soporte PDF opcional: subida firmada con el
  cliente **de servicio** a `carpetaSoporte("titular", id)` tras el DAL, porque Storage no tiene política para esa carpeta),
  «Ver datos del titular» (`datos_titular(perfil_id)` para atender una consulta) y, para supresión o revocatoria,
  **«Simular supresión»** (muestra bloqueos, qué se borra, qué se anonimiza y qué se conserva) y **«Ejecutar supresión»**
  (solo respondida con procede o procede en parte; confirmación escribiendo el radicado; después borra de Storage los
  archivos que devuelve el RPC con el cliente de servicio, por lotes, y muestra el resultado).
- Componente `InsigniaReclamoEnTramite({ medioId?, anuncianteId?, perfilId? })` (server, `privacidad.gestionar`): «Reclamo
  en trámite» mientras haya un reclamo abierto. El líder lo monta en las fichas de medio, anunciante y usuario.
- Pruebas Vitest de esquemas, semáforo y presentación. E2E `e2e/cierre-privacidad.spec.ts` con una cuenta **desechable**
  (fábrica `e2e/utilidades/privacidad.ts`: crea un medio y su usuario con la API de administración, solo local o develop,
  con la guarda de producción): el medio radica una supresión (criterio CTA-007: queda con fecha y el equipo la recibe),
  el administrador la ve en la bandeja, la responde y ejecuta la supresión; la cuenta ya no puede ingresar.

## Paquete NC — Correo apagado y aviso en vivo (NOT-004, NOT-007)

**Propiedad:** `src/lib/correo/**` (nuevo), `src/app/api/correos/procesar/**`, `src/features/notificaciones/**` (salvo
`presentacion.ts`, que solo puedes ampliar con pruebas), `src/features/cuenta/preferencias.ts`,
`src/features/cuenta/components/panel-preferencias.tsx` y las acciones de preferencias en `src/features/cuenta/actions.ts`,
`src/lib/env-esquema.ts` y `src/lib/env*.ts` (solo variables nuevas), `.env.example`, `e2e/cierre-tiempo-real.spec.ts`.

- **Correo (todo `server-only`):** `tipos.ts` (`AdaptadorCorreo`, `MensajeCorreo { para, asunto, html, texto,
claveIdempotencia }`, `ResultadoEnvio`: enviado / reintentar / fallido), `resend.ts` (`fetch` a
  `https://api.resend.com/emails`, cabecera `Idempotency-Key: amo-correo-{id}`, `AbortSignal.timeout(10_000)`; 429, 5xx,
  red o timeout → reintentar; otro 4xx → fallido), `registro.ts` (local y develop: no envía ni escribe correos en el log),
  `plantilla.ts` (asunto, HTML y texto: sustituye `{{variables}}` escapando cada valor, negrita y cursiva de Markdown, botón
  a `NEXT_PUBLIC_SITE_URL` + `url` o `/ir/{entidad}/{entidad_id}` o `/notificaciones`, colores HEX en línea, pie «Cambia
  qué avisos recibes por correo en Cuenta → Preferencias»), `index.ts` (`obtenerAdaptadorCorreo()`), `procesar.ts`
  (`procesarColaCorreos()`: cliente de servicio → `reclamar_correos_srv(correo.lote)` → envía uno por uno →
  `registrar_envio_correo_srv`).
- **Ruta `/api/correos/procesar`:** `POST`, `export const maxDuration = 60`; compara `Authorization: Bearer …` con
  `AMO_CORREOS_SECRETO` usando `timingSafeEqual` sobre SHA-256; sin secreto configurado responde 404; con el proveedor
  `desactivado` responde 204 sin reclamar; devuelve solo conteos; nada de correos en logs.
- **Variables (opcionales):** `AMO_CORREO_PROVEEDOR` (`desactivado` por defecto, `registro`, `resend`), `RESEND_API_KEY` y
  `AMO_CORREO_REMITENTE` (obligatorias solo con `resend`), `AMO_CORREOS_SECRETO` (≥ `LONGITUD_MINIMA_SECRETO`). Nombres en
  `.env.example`, sin valores.
- **Preferencias:** tarjeta «Avisos por correo» en Cuenta → Preferencias: casillas por categoría (las de
  `CLAVES_CATEGORIA` que apliquen a su tipo de rol), `seguridad` y `privacidad` siempre activas y deshabilitadas con la
  explicación; mientras `correo.habilitado` sea falso (lectura pública no: muéstralo como «El envío por correo se activará
  pronto» si no puedes leerlo), las preferencias se guardan igual. `perfiles.preferencias.correo.silenciadas`.
- **Prueba de paridad:** Vitest que extrae de `supabase/migrations/20261024181218_e3_cierre.sql` la correspondencia de
  `private.categoria_notificacion` y la compara con `CATEGORIAS`.
- **Aviso en vivo:** `src/features/notificaciones/tiempo-real.ts` con `useCanalNotificaciones(usuarioId)`:
  `obtenerClienteNavegador()`, `await supabase.realtime.setAuth()`, canal `usuario:{id}` con `config: { private: true }`,
  evento `notificacion`, payload validado con zod; actualiza el contador (`CLAVES_NOTIFICACIONES.conteo` →
  `{ disponible: true, total: no_leidas }`) e invalida el resto de `["notificaciones", …]` con antirrebote de ~1 s; al
  desmontar, `removeChannel`. Sondeo de respaldo: `useConteoNoLeidas({ enVivo })` cada 60 s sin canal y ~300 s con canal;
  al reconectar, invalida. Ni el socket ni el sondeo cuentan como actividad de la sesión. Región `aria-live="polite"`
  solo para prioridad 2. La campana (`CampanaNotificacionesEnVivo`) lo usa con `useShell().usuario.id`.
- **E2E** `e2e/cierre-tiempo-real.spec.ts`: dos contextos (A y B) con la app abierta; una fábrica genera un aviso para A;
  el contador de A sube en ≤ 5 s y el de B no cambia (criterio NOT-007). El líder levanta la pila local con Realtime.

## Paquete AX — Accesibilidad y navegadores (RNF-ACC-01, RNF-COM-01, DSH-002)

**Propiedad:** `src/components/data-table/**`, `src/components/charts/**`, `src/components/ui/command.tsx` (solo el rótulo
por omisión en español), `src/app/globals.css` (solo movimiento reducido y `scroll-padding`), `e2e/accesibilidad-*.spec.ts`,
`e2e/utilidades/axe.ts`, `e2e/cuenta.spec.ts`, `e2e/terminos.spec.ts`, `e2e/vinculacion.spec.ts` (solo para usar la
utilidad común), `scripts/bootstrap/**` (cuenta de lectura de Finanzas).

- Utilidad `e2e/utilidades/axe.ts` (`NORMAS` WCAG 2.0/2.1/2.2 A y AA, `AJENOS` de Mapbox y los `data-base-ui-focus-guard`,
  `infracciones(page, incluir?)`) y las specs existentes la usan.
- `e2e/accesibilidad-portales.spec.ts`: las pantallas clave por rol, en los dos temas y en escritorio, tablet y móvil (no
  saltes tablet): internas (verificación por cola, moderación y ficha de oferta, validación por cola, disputas y su
  ficha, fichas de medio, anunciante, campaña y asignación, finanzas: liquidaciones y su ficha, facturas y su ficha,
  cartera; administración: usuario, rol, accesos; notificaciones; los 6 reportes), Finanzas (pagos y su ficha, con una
  sesión nueva `finanzas` de solo lectura), anunciante (campañas y ficha con pestañas, asistente sin avanzar, oferta,
  seguimiento, facturas, empresa), medio (ofertas y detalle sin aceptar, mis campañas y sus pantallas, ganancias, mi medio
  completo) y públicas (`/auth/confirm` sin token). Estados abiertos que se auditan aparte: ⌘K, «Crear usuario», «Generar
  corte», un filtro facetado, «Ver datos» de un gráfico, la hoja de validación y «¿Aceptas esta oferta?» (sin confirmar).
  Espera `opacity: 1` antes de auditar un diálogo. Cero infracciones serias o críticas. Las rutas nuevas de la fase 6
  (`/mi-medio/reputacion`, `/cuenta/privacidad`, `/administracion/privacidad`, `/operacion/campanas/nueva`) entran cuando
  existan (el líder las agrega al integrar si no alcanzas).
- Correcciones: `filtro-facetado.tsx` (`aria-checked` y texto oculto «aplicado» porque cmdk pisa `aria-selected`),
  `vista-tarjetas.tsx` (sin `truncate` que oculte valores a 390 px), contenedor desplazable de la tabla con `tabIndex={0}` y
  nombre, una sola región viva al paginar; `tabla-grafico.tsx` (la tabla visible de «Ver datos» desplazable con teclado:
  `tabIndex={0} role="region" aria-label`); `ui/command.tsx` (`CommandList` con `label="Resultados"` por omisión);
  `globals.css` (`.animate-in, .animate-out { animation: none !important }` bajo `prefers-reduced-motion: reduce` y
  `:root[data-movimiento="reducido"]`; `scroll-padding-top` y `scroll-padding-bottom` para que la barra superior, los pies
  fijos y la barra inferior del medio no tapen el foco, WCAG 2.4.11).
- Cuenta E2E nueva `LECTURA_FINANZAS` (rol FINANZAS, TOTP, `E2E_LECTURA_FINANZAS_*`) en `scripts/bootstrap/provision-e2e.ts`;
  la sesión `finanzas` en `e2e/preparacion.setup.ts` y `NombreSesion` (dueño: este paquete).
- Matriz de navegadores: deja lista la lista de specs de humo (`smoke`, `navegacion`, `accesibilidad`) para WebKit
  (iPhone 13) y Firefox; el líder agrega los proyectos a `playwright.config.ts` e instala los navegadores.

## Paquete LM — Limpieza de producción y rendimiento (GEO-010)

**Propiedad:** `scripts/produccion/limpiar-pruebas.ts`, `scripts/produccion/limpiar-pruebas-plan.ts` (+ `.test.ts`),
`scripts/pruebas/rendimiento-geo.ts` (+ prueba si tiene lógica pura), `supabase/seed/demo/06_cierre.sql` (solo el
recálculo de indicadores).

- `pnpm prod:limpiar-pruebas <local|develop|produccion> [--ejecutar] [--confirmar-produccion]` (el líder agrega el
  script). **Simula por defecto** (transacción completa con `rollback`): conteos por tabla (`private.limpiar_pruebas`), los
  usuarios que se borrarían (correos enmascarados), los objetos de Storage y los MB que se liberarían. Conexión
  `postgres` 3.4.9 con `urlDb`/`sslDe` de `scripts/db/entorno-db.ts`, `set local amo.modo_carga = 'on'`, `amo.purga = 'on'`,
  `statement_timeout = '600s'`; comprueba `session_user = 'postgres'`.
- Para ejecutar en producción (sin todas, se detiene): `--ejecutar` y `--confirmar-produccion`; escribir el ref del
  proyecto en la terminal (TTY; se niega con `CI`); respaldo del mismo día `context/respaldos/produccion-<día>-antes-limpieza-*`
  con archivos no vacíos; exactamente 3 SUPERADMIN activos con un factor MFA verificado y `SUPERADMIN_EMAIL` entre ellos;
  para los 4 documentos legales, una versión vigente distinta de `0.1-PRUEBA` salvo `--sin-textos-definitivos`.
- Después del SQL: Storage por la API (`crearClienteServicio` o el cliente admin del script; lista por SQL
  `select bucket_id, name from storage.objects`, borra en lotes, conserva los avatares que los superadministradores
  referencian; reanudable), luego `pnpm prod:config-pruebas --revertir` (lo invoca o lo indica), y verificación (0 filas
  de negocio, 3 perfiles y 3 `auth.users`, Storage solo con lo conservado) e informe en
  `context/respaldos/limpieza-<ref>-<día>.json` (0600). Reglas puras en `limpiar-pruebas-plan.ts` con pruebas.
  **Nunca lo ejecutes contra producción**: pruébalo en local (simulación y, si quieres, ejecución sobre la base local, que
  luego el líder reconstruye).
- GEO-010: `scripts/pruebas/rendimiento-geo.ts`: p95 de `geo_metricas` y `detalle_zona_geo` en los 3 niveles y las métricas,
  N ≥ 20 por combinación, en la base (como un administrador con aal2, en `begin … rollback`) y de extremo a extremo contra
  `/api/geo/metricas` con una sesión de administrador si hay servidor; informe con p50, p95 y máximo; falla si p95 ≥ 300 ms
  en la base. Haz `EXPLAIN ANALYZE` de `detalle_zona_geo('pais','CO',…)` y reporta si conviene un índice (no lo crees: es
  migración del líder).
- `supabase/seed/demo/06_cierre.sql`: `perform private.recalcular_indicadores_medios();` al final del cierre de la demo.

## Revisión adversarial (2026-10-24)

5 revisores (base de datos, seguridad del front, reglas de negocio, experiencia y accesibilidad, correctitud): 34
hallazgos, corregidos en la migración (aún no aplicada en producción) y en 4 paquetes del front. En la base:
supresión con las solicitudes de vinculación, accesos anonimizados, guarda anti-escalada anticipada, bloqueos del medio
solo cuando la supresión lo altera, decisión BORRAR/ANONIMIZAR con perfiles desactivados, archivos pendientes
registrados (`registrar_archivos_supresion_srv`) y logo del medio; `datos_titular` para el equipo solo con una solicitud
abierta y con `REVELAR_DATO`; requerimiento solo de reclamos dentro de los 5 días hábiles; correo `APLAZADO`; aviso
`oferta.cancelada`; serie mensual del explorador en una lectura (GEO-010). En el front: textos de la gestión asistida,
foco y `aria-controls` de los selectores, «Reintentar el borrado de archivos», «Reclamo en trámite» enlazado a la ficha
o a la bandeja filtrada, línea de tiempo por actor, preferencias de correo sin categorías inactivas, aviso en vivo sin
pisadas del sondeo, tarjetas de tabla que envuelven sin desbordar, migas y enlaces de 24 px, «Cerrar» y «Cargando» en
español, y las E2E que comparaban la bitácora por correo enmascarado.
