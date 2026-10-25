# Progreso de las Entregas 2 y 3

Estados: ⬜ pendiente · 🔧 en curso · 🧪 probado (base local o develop) · ✅ en producción · ⏸ construido apagado (depende de un
servicio externo, ver `context/Servicios-Pendientes-Definir.md`).

| Fase | Contenido                                                                               | Estado |
| ---- | --------------------------------------------------------------------------------------- | ------ |
| P0   | Desbloqueo (registrar anunciante/medio, ROL-008, NIT) y bloques compartidos             | ✅     |
| P1   | Alta y verificación del medio, términos, vinculación pública, notificaciones de negocio | ✅     |
| P2   | Anunciante, campañas, asistente de oferta, creativos, moderación                        | ✅     |
| P3   | Marketplace, ejecución del medio, seguimiento del anunciante (cierra E2)                | ✅     |
| P4   | Validación de evidencias y métricas, disputas, suspensión                               | ✅     |
| P5   | Liquidaciones, documento soporte, pagos, facturas, ganancias                            | ✅     |
| P6   | Gestión asistida, reputación, derechos del titular, correo, tiempo real, cierre         | ✅     |

## Requisitos

| RF               | Nombre                                                     | Fase  | Estado |
| ---------------- | ---------------------------------------------------------- | ----- | ------ |
| —                | Registrar anunciante y medio (equipo AMO)                  | P0    | ✅     |
| ROL-008          | El Administrador gestiona usuarios de anunciantes y medios | P0    | ✅     |
| AUT-012          | Aceptación versionada de términos y política de datos      | P1    | ✅     |
| MED-001          | Solicitud de vinculación del medio                         | P1    | ✅     |
| MED-002          | Perfil del medio                                           | P1    | ✅     |
| MED-003          | Carga de documentos por nivel                              | P1    | ✅     |
| MED-004          | Datos de pago y condición tributaria                       | P1    | ✅     |
| MED-005          | Cuentas sociales y verificación de control                 | P1    | ✅     |
| MED-006          | Reverificación periódica de seguidores                     | P1    | ✅     |
| MED-007          | Tope por nivel y camino para subir de nivel                | P1    | ✅     |
| ADM-001          | Cola de verificación de medios                             | P1    | ✅     |
| ADM-006          | Clasificación de pertinencia geográfica                    | P1    | ✅     |
| NOT-003          | Notificaciones por eventos del negocio                     | P1/P6 | ✅     |
| ANU-001          | Registro y datos de la empresa                             | P0/P2 | ✅     |
| ANU-002          | Varios usuarios por anunciante                             | P2    | ✅     |
| ANU-003          | Creación de campañas                                       | P2    | ✅     |
| ANU-004          | Asistente de oferta · Qué se publica                       | P2    | ✅     |
| ANU-005          | Asistente de oferta · A quién le llega                     | P2    | ✅     |
| ANU-006          | Asistente de oferta · Cuándo                               | P2    | ✅     |
| ANU-007          | Asistente de oferta · Cuánto y estimador                   | P2    | ✅     |
| ANU-008          | Asistente de oferta · Paquete creativo                     | P2    | ✅     |
| ANU-009          | Asistente de oferta · Condiciones, revisión y envío        | P2    | ✅     |
| ANU-010          | Versionado de creativos                                    | P2    | ✅     |
| ANU-014          | Cancelación de ofertas y campañas                          | P2    | ✅     |
| ADM-003          | Verificación de anunciantes                                | P2    | ✅     |
| ADM-005          | Moderación de ofertas                                      | P2    | ✅     |
| MED-008          | Marketplace de ofertas elegibles                           | P3    | ✅     |
| MED-009          | Detalle de la oferta                                       | P3    | ✅     |
| MED-010          | Aceptar o rechazar una oferta                              | P3    | ✅     |
| MED-011          | Mis campañas                                               | P3    | ✅     |
| MED-012          | Entrega de contenido                                       | P3    | ✅     |
| MED-013          | Carga de evidencia de publicación                          | P3    | ✅     |
| MED-014          | Carga de métricas por corte                                | P3    | ✅     |
| ANU-011          | Seguimiento de campaña                                     | P3    | ✅     |
| ANU-012          | Métricas y reportes del anunciante                         | P3    | ✅     |
| INT-001          | Captura obligatoria del panel nativo                       | P3    | ✅     |
| INT-002          | URL del post verificable                                   | P3    | ✅     |
| INT-005          | Validaciones de coherencia                                 | P3    | ✅     |
| NOT-005          | Recordatorios automáticos                                  | P3    | ✅     |
| NOT-006          | Aviso de nueva versión del paquete creativo                | P3    | ✅     |
| PRC-003          | Multiplicador de calidad (visible al medio)                | P3    | ✅     |
| PRC-004          | Recálculo programado con aviso previo                      | P3    | ✅     |
| CUP-004          | Vencimiento y liberación de cupos                          | P3    | ✅     |
| CUP-005          | Transiciones automáticas                                   | P3    | ✅     |
| CUP-006          | Prueba de carrera automatizada                             | P3    | ✅     |
| DSH-006          | Inicio del medio con botones directos                      | P3    | ✅     |
| ADM-002          | Ficha y suspensión de medios                               | P4    | ✅     |
| ADM-007          | Validación de evidencias                                   | P4    | ✅     |
| ADM-008          | Validación de métricas con alertas                         | P4    | ✅     |
| ADM-009          | Verificación de la asignación (puerta a pago)              | P4    | ✅     |
| ADM-010          | Cancelación de asignaciones con causa                      | P4    | ✅     |
| ADM-011          | Apertura de disputas                                       | P4    | ✅     |
| ADM-012          | Bandeja y resolución de disputas                           | P4    | ✅     |
| INT-003          | Alerta de desviación frente al histórico propio            | P4    | ✅     |
| INT-004          | Alerta de alcance excesivo frente a seguidores             | P4    | ✅     |
| INT-006          | Revisión obligatoria y consecuencias                       | P4    | ✅     |
| LIQ-001          | Generación de liquidaciones                                | P5    | ✅     |
| LIQ-002          | Cálculo de retenciones                                     | P5    | ✅     |
| LIQ-003          | Aprobación con segregación y anulación                     | P5    | ✅     |
| LIQ-004          | Documento soporte electrónico                              | P5    | ✅     |
| LIQ-005          | Archivo de dispersión bancaria                             | P5    | ✅     |
| LIQ-006          | Registro de pago con soporte                               | P5    | ✅     |
| LIQ-007          | Control de seguridad social                                | P5    | ✅     |
| LIQ-008          | Facturas al anunciante y cartera                           | P5    | ✅     |
| MED-015          | Ganancias                                                  | P5    | ✅     |
| ANU-013          | Facturación del anunciante                                 | P5    | ✅     |
| ADM-014          | Gestión asistida por cuenta del anunciante                 | P6    | ✅     |
| MED-016          | Indicadores de reputación                                  | P6    | ✅     |
| CTA-007          | Derechos del titular de datos                              | P6    | ✅     |
| NOT-004          | Notificaciones por correo electrónico                      | P6    | ⏸      |
| NOT-007          | Actualización en tiempo real                               | P6    | ✅     |
| CFG-001…009      | Criterios «Verificable en E2/E3» de configuración          | P1–P6 | ✅     |
| DSH-003, GEO-010 | Criterios «Verificable en E3»                              | P6    | ✅     |

## Bitácora de la ejecución

- 2026-10-21 · Plan aprobado. Migración `20261022024336_e2_desbloqueo` escrita (ROL-008 + NIT), herramientas
  `pnpm db:push|db:suites|db:vault`, `media-src` en la CSP, hoja «Crear usuario» con organización fija.
- 2026-10-21/22 · Fase 0 implementada por el workflow (5 paquetes con revisión adversarial) e integrada: botones en
  la cabecera de las fichas, selector de municipios activos, `cargarDatosGestion` sin organizaciones en las fichas,
  enlace de registro según permiso, `--reserva-inferior` para pies fijos, `AMO_CIFRADO_KEY_ANTERIOR` validada,
  resumen enmascarado ≤ 60. Typecheck, lint y 2.787 pruebas Vitest en verde.
- 2026-10-22 · **Base local** (Docker/Colima + `supabase start`) en lugar de esperar a develop: las 48 migraciones
  se aplican limpias; 17 suites SQL en verde (960 comprobaciones) tras corregir: semilla demo frente al CHECK de
  pago (la completitud pasa a `guardar_datos_pago_medio_srv`; «Enviar a verificación» exige la cuenta cifrada), 17
  NIT con DV inválido en suites antiguas, conteos de plantillas/configuración/triggers, términos con vigencia en el
  pasado, idempotencia de recordatorios con volumen. Agregados a las migraciones aún no aplicadas: trigger de
  categorías activas, CHECK de cifrado de `perfiles_privado`, rutas únicas de documentos. `config.toml`: el proveedor
  de correo estaba apagado en local. Tipos regenerados (`pnpm db:types local`). Demo de 15 meses + cuentas E2E en
  local; regresión E2E: 208 pasan, 0 fallan (56 omitidas por diseño en móvil/tablet).
- 2026-10-22 · Integración de la fase 1 (líder): grupo «Mi negocio» (Mi medio), «Verificación» en Operación,
  `/vincular` público, resolvedor `/ir/[entidad]/[id]` y enlaces de notificación por entidad. Comandos nuevos
  `pnpm db:local` y entorno `local` en `db:*`. Workflow de la fase 1 lanzado (7 paquetes + 3 revisores).
- 2026-10-22 · El primer workflow de la fase 1 se cortó por el límite de uso (ningún agente terminó; el trabajo parcial
  quedó en el commit `d9f7857` de Andrés). Correcciones de BD tras la revisión de `docs/modelo-datos.md`: trigger
  `trg_medios_privado_b_pago_completo`, aviso del 80 % deduplicado por nivel según la bitácora, sin
  `solicitudes_vinculacion_invitada_chk`, «Enviar a verificación» con medio borrado; 17 suites en verde (30/30 en
  onboarding). `pnpm db:local` probado (55 s). Workflow de la fase 1 relanzado en modo «retomar».
- 2026-10-22 · Workflow de la fase 1 relanzado («retomar»): 7 paquetes y 3 revisores (19 hallazgos corregidos). Commit
  `f69416b`. Integración del líder: cabecera `x-amo-ruta` en el proxy, `EnlaceVincular` en Ingresar, destino del expediente
  para avisos de medios, búsqueda con «D.C.» y por palabras en orden (nombres con paréntesis), términos pendientes desde el
  ingreso, inicio del medio en alta sin periodo, `datos_pago_cambiados_at` + certificado de la cuenta vigente,
  `tipo_documento` solo por RPC, `quitar_cuenta_social_srv`, aviso de la cola de cuentas al llegar la captura, «Enviar a
  verificación» con cuenta verificada o en revisión; contraste del monograma de plataforma; contador de colas que no se
  corta a 390 px; nombre accesible del selector de nivel. E2E: proyecto `alta-medio` en serie, spec de términos solo en
  local, cuentas externas y demo con términos aceptados, abortos de View Transition tratados como benignos.
  Verificación en local: 17 suites SQL (38/38 en onboarding), 3.684 Vitest, E2E 249 + 13 en verde.
- Explicado (fase 3): tras un ingreso o un `reload()` conviven un instante dos copias del contenido de la página. Es el
  streaming de React: la copia del servidor (`_R_…`) llega oculta en `div#S:n` mientras el cliente ya pintó la suya
  (`_r_…`), y React la descarta al revelar el lote. No se ve ni la anuncian los lectores de pantalla, pero `getByLabel` y
  `getByText` la cuentan. El fixture E2E (`e2e/utilidades/prueba.ts`) hace que `goto`, `reload` y los ingresos esperen a
  que no quede ninguna (`esperarStreaming`); los specs además buscan por rol o dentro de un contenedor visible.
- Pendiente (después de E3): limpieza programada de objetos de Storage sin fila (subidas no confirmadas o reemplazadas). La supresión de datos ya no depende de ella: registra los archivos pendientes y ofrece «Reintentar el borrado de archivos».
- 2026-10-22 · **Fases 0 y 1 en producción** (`oriuuuaczpncmtglfgpv`): respaldo previo de esquema y datos en
  `context/respaldos/` (0600, fuera de git); `pnpm db:push produccion --confirmar-produccion` aplicó
  `20261022024336`, `20261022030524` y `20261022030525`. Verificación por MCP (solo lectura): 48 migraciones iguales a
  los archivos, 55 plantillas, 54 claves, 14 triggers de notificación, 141 transiciones, secreto de Vault, 3
  superadministradores intactos; advisors de seguridad sin ERROR (WARN nuevo esperado: `terminos_pendientes` ejecutable por
  authenticated, solo devuelve lo del propio usuario). Falta que Andrés lleve `feature/andres` a `main` (PR) para que Vercel
  despliegue el front.
- 2026-10-22 · Andrés fusionó los PR #5 y #6 en `main` y Vercel desplegó: `/vincular` responde 200 desde `yul1`, sin
  errores de consola ni de CSP; las rutas privadas redirigen a `/ingresar?next=`. `pnpm prod:config-pruebas`
  (`scripts/produccion/`) probado en la base local (simular, aplicar, reaplicar sin cambios, revertir; bitácora con actor
  SUPERADMIN y origen APP). Simulación contra producción: 3 parámetros (anticipación 24→0 h, cortes → `["H24"]`,
  creativo 50→25 MB) y los 4 textos legales `0.1-PRUEBA`. Andrés lo aplicó en producción; verificado por MCP (solo
  lectura): valores nuevos, 4 versiones publicadas y vigentes, 11 entradas de bitácora (SUPERADMIN, APP) y respaldo en
  `context/respaldos/configuracion-pruebas-oriuuuaczpncmtglfgpv.json` (0600).
- 2026-10-22 · **Fase 2 en curso.** Mapeo de la BD y del código (workflow de 4 lectores). Migración
  `20261022193647_e2_anunciantes_ofertas` (E2d, §3.10 de `docs/modelo-datos.md`, decisiones D41–D49) probada en la base
  local: 17 suites SQL en verde tras ajustar conteos (57 plantillas, 56 claves, 145 transiciones), la regla del NIT antes
  de verificar, los archivos de creativo con SHA-256, medidas y objeto en Storage, y la lectura del medio solo de versiones
  activadas. `pnpm db:transiciones local` respeta el TLS local. Preparación del líder: navegación («Mis campañas», «Mi
  empresa», «Moderación», ficha interna de oferta fuera del menú), destinos `/ir` del anunciante, `transicionar` en
  `src/lib/negocio`, proyecto E2E `anunciante` en serie, stubs de contratos y brief `fase-2.md`. Workflow de
  implementación lanzado con 8 paquetes (EM, VA, CA, AO, CR, OM, E0, SQ).
- 2026-10-22 · **Fase 2 terminada y en producción.** Workflow de implementación (8 paquetes: EM, VA, CA, AO, CR, OM, E0, SQ),
  ronda de integración (archivar con RPC, pasos y rutas con una sola fuente, orden y descarte de versiones) y revisión
  adversarial (4 revisores + verificación): 28 hallazgos confirmados y corregidos, entre ellos el anonimato del estimador
  (comparar estimaciones revelaba seguidores, precio y alcance de un medio), decisiones de moderación sobre el envío
  revisado, identificación que invalida documentos aprobados, empresa suspendida sin activar versiones, bloqueo optimista e
  idempotencia del asistente, y foco y anuncios accesibles. Local: 19 suites SQL (133/133 en la de fase 2), 4.615 Vitest,
  E2E 299 en verde (0 fallas). Auth local admite 500 ingresos cada 5 min para la suite. `pnpm db:respaldo` nuevo; respaldo
  de producción `context/respaldos/produccion-2026-10-22-antes-e2d-*`. Andrés aplicó `20261022193647_e2_anunciantes_ofertas`
  en producción; verificado por MCP: 49 migraciones, 57 plantillas, 56 claves, 145 transiciones, funciones nuevas,
  configuración de prueba intacta, 3 superadministradores, advisors sin ERROR (WARN nuevos esperados:
  `disponible_campana` y `medios_para_exclusion`, definer con permiso y empresa comprobados por dentro).
- 2026-10-22/23 · **Fase 3 en curso.** Mapeo (4 lectores) con un borrador de migración probado. Migración
  `20261023022211_e2_integridad_ejecucion` (E2e, §3.11 de `docs/modelo-datos.md`, D54–D60) aplicada en local; la demo y las
  cuentas E2E se generan con las reglas nuevas. Preparación del líder: navegación del medio (Ofertas, Mis campañas; barra
  inferior Inicio · Ofertas · Campañas · Mi medio), `/ir` de la pauta para medio y anunciante (y relacionados también para los
  portales externos: el aviso de una oferta ya lleva al anunciante a su ficha), errores nuevos, proyecto E2E `pauta-medio`,
  `PieAcciones`, `BotonCopiar`, rutas y brief `fase-3.md`. Workflow de implementación con 7 paquetes (MK, MC, EV, DM, SG, E0,
  SQ).
- 2026-10-23 · **Fase 3 terminada y en producción.** Workflow de implementación (7 paquetes: MK, MC, EV, DM, SG, E0, SQ;
  relanzado en modo «retomar» tras el corte por límite de sesión) e integración del líder (calidad en «Mi medio › Cuentas»,
  ancla «Cómo subir de nivel», scripts `pruebas:carrera` y `pruebas:pauta-e2e`). Revisión adversarial (4 revisores +
  verificación): 27 hallazgos confirmados y corregidos, entre ellos capturas de métricas sin aprobar legibles por el
  anunciante en Storage (D62), evidencia con el post de otra cuenta y URL única evadible con otra forma del enlace (D61),
  fecha de publicación anterior a la descarga (D63, en la acción del servidor), recordatorios por publicación (D64),
  filtros por sector, anunciante y días en el marketplace (`marketplace_facetas`), `impedimentos_aceptar` para no ofrecer
  «Aceptar» cuando la exclusividad o el tope por medio lo impedirán, corrección de un corte personalizado (`metrica_id`),
  foco y accesibilidad. A 390 px el selector de días se salía de la pantalla (también el selector de periodo compartido):
  ahora respeta el alto disponible. Local: 20 suites SQL (104/104 en `humo_e2_ejecucion`), 5.203 Vitest, E2E 354 en verde
  (0 fallas), carrera de cupos 11/11 sin deadlocks, fábricas de pauta «Todo coincide». Respaldo
  `context/respaldos/produccion-2026-10-23-antes-e2e-*`; Andrés aplicó `20261023022211_e2_integridad_ejecucion` en
  producción. Verificado por MCP: 50 migraciones, 58 plantillas, 57 claves, 145 transiciones, funciones nuevas, índice
  parcial por contenido, política de Storage nueva, cron de indicadores a `1 5 * * *`, configuración de prueba intacta, 3
  superadministradores, secreto de Vault; advisors sin ERROR (WARN nuevos esperados: `marketplace_medio`,
  `marketplace_facetas`, `impedimentos_aceptar`, `mi_elegibilidad_marketplace` y `seguimiento_campana`, definer con permiso
  y medio o empresa comprobados por dentro).
- 2026-10-23 · **Fase 4 en curso.** Mapeo (4 lectores) con borrador de migración probado. Migración
  `20261023171316_e3_validacion` (E3a, §3.12 de `docs/modelo-datos.md`, D65–D74) aplicada en local: validación atómica de
  evidencias y métricas, corrección auditada, cancelación con causa y suspensión, alertas por cuenta persistentes y ocultas al
  medio y al anunciante, colas del equipo, puerta a pago sin pendientes, reclamo de vencidas con motivo Otro, mensajes de
  disputa con su parte, métricas durante la disputa, `asignacion.reabierta` y `soporte.correo`; 20 suites en verde tras
  ajustar las expectativas que cambiaron. Preparación del líder: navegación «Validación» y «Disputas», `/ir` de las disputas,
  rutas, configuración de texto libre, proyecto E2E `validacion` y brief `fase-4.md` (commit `e3757d4`). Workflow de
  implementación con 7 paquetes (VA, AS, MS, DI → DX, E0, SQ).
- 2026-10-23 · Fase 4: workflow de implementación (VA, AS, MS, E0, SQ y DI en paralelo; DX después de DI, relanzado en modo
  «retomar» tras el límite de sesión), ronda de integración (una sola fuente para explicar las alertas, la ficha de la
  asignación con las reglas de disputas, decisiones que esperan una disputa, colas con sus columnas nuevas, lectura de las
  disputas con ver las asignaciones) y revisión adversarial (4 revisores + verificación): 21 hallazgos confirmados y
  corregidos, entre ellos la constancia de aprobar una alerta visible para el medio y el anunciante en
  `metricas.observaciones` (ahora solo en la bitácora), decidir sobre una versión que el medio cambió (sello `p_enviada_at`),
  partes sin `disputas.abrir` escribiendo por la API, el medio sin poder cargar cortes durante una disputa, reclamos
  repetidos de una vencida, textos de disputa de más de 1000 caracteres que rompían `asignaciones.motivo`, visor de adjuntos
  sin alto máximo en el celular, regiones vivas vacías, foco tras paginar y pie fijo vacío. `cola_verificacion` pasó de
  ~0,9 s a ~2 ms y `private.notificar` reintenta si un destinatario se borra a mitad del aviso. Local: 21 suites SQL
  (`humo_e3_validacion` 148/148), 5.689 Vitest.
- 2026-10-23 · Fase 4 verificada en local: 21 suites SQL (`humo_e3_validacion` 148/148), 5.689 Vitest y E2E completo con
  412 en verde (0 fallas; proyecto `validacion` incluido). Último arreglo: el foco llega al aviso del estado tras cancelar o
  abrir una disputa (Base UI enfocaba su enlace o lo perdía con el refresco). Respaldo
  `context/respaldos/produccion-2026-10-23-antes-e3a-*`; la simulación contra producción solo aplica
  `20261023171316_e3_validacion`.
- 2026-10-23 · **Fase 4 en producción.** Andrés aplicó `20261023171316_e3_validacion`. Verificado por MCP (solo lectura): 51
  migraciones, 60 plantillas, 59 claves (con `evidencias.plazo_recarga_horas` y `soporte.correo`), 145 transiciones, funciones
  nuevas, columnas de alertas sin lectura para `authenticated`, `disputa_mensajes.autor_parte`, políticas de mensajes y de
  Storage con `disputas.abrir` y capturas en disputa, configuración de prueba intacta, 3 superadministradores, secreto de Vault;
  advisors sin ERROR (WARN nuevos esperados: `alertas_metricas`, `cola_metricas`, `cola_verificacion` y `mensajes_disputa`,
  definer con permiso comprobado por dentro).
- 2026-10-23 · **Fase 5 en curso.** Mapeo (4 lectores) y migración `20261024024312_e3_finanzas` en local: liquidaciones
  con periodo cerrado y corte por lote, seguridad social al aprobar, documento soporte protegido con archivos, CUDS, nota
  de ajuste y numeración de la plataforma o del proveedor, dispersión en dos pasos, pago con soporte cargado, factura del
  medio, lecturas del medio por RPC, facturas desde las asignaciones expedidas en el software de AMO, notas crédito,
  retenciones del anunciante y esquema del IVA. Suite `humo_e3_finanzas` 60/60 y las 22 suites en verde. Preparación:
  navegación, `/ir`, rutas, contratos, `subirComoServicio`, logo para PDF del servidor, rótulos de error, configuración,
  proyecto E2E `finanzas` y brief `fase-5.md`.
- 2026-10-24 · **Fase 5 en producción.** Revisión adversarial (5 dimensiones, 34 hallazgos confirmados) corregida en la BD y el
  front; base local reconstruida desde cero con la migración completa; 22 suites SQL (`humo_e3_finanzas` 67/67), 6.363 Vitest
  y E2E completo en verde (finanzas 31/31). Respaldo `context/respaldos/produccion-2026-10-24-antes-e3b-*`. Andrés aplicó
  `20261024024312_e3_finanzas` y la configuración de prueba de finanzas (retención en la fuente 4 % y 6 % desde 4 UVT, ReteICA
  de Bogotá, Medellín, Cali y Barranquilla, resoluciones «PRUEBA» `PDS` y `PFE`, todo pendiente de validar). Verificado por MCP
  (solo lectura): 52 migraciones, 66 plantillas, 65 claves, 146 transiciones, funciones nuevas, Storage con lectura solo de lo
  referenciado, sin escritura de la sesión en facturas ni liquidaciones, configuración de prueba intacta, 3 superadministradores,
  Vault; advisors sin ERROR (WARN nuevos: las lecturas definer de finanzas, con el permiso comprobado por dentro).
- 2026-10-24 · **Fase 6 (cierre de E3).** Mapeo con 5 lectores. Migración `20261024181218_e3_cierre` (gestión asistida,
  reputación, titular de datos con días hábiles de Colombia, exportación y supresión, correo apagado, aviso en vivo
  mínimo, confirmación de parámetros, medios cerca del tope, limpieza final sin ejecutar, funciones puras integradas
  para GEO-010) con `humo_e3_cierre.sql` 76/76 y 23 suites en verde; permiso `privacidad.gestionar`. Workflow de 6
  paquetes: el primero se cortó por límite de uso y se relanzó en modo relevo sobre el trabajo parcial. Integración del
  líder: filtro y marca de origen asistido, enlace de DSH-003 por permiso, «Reclamo en trámite» en fichas, estado del
  correo en Preferencias, matriz de navegadores (`pnpm test:e2e:navegadores`), pila local con Realtime. 6.714 Vitest,
  typecheck, lint y build en verde. Commits `d32eafc`, `9894c8d`. NOT-004 queda ⏸ (construido apagado; activación en
  `context/Servicios-Pendientes-Definir.md` §5).
- 2026-10-24/25 · **Fase 6 en producción: Entregas 2 y 3 completas.** Revisión adversarial (5 revisores, 34 hallazgos
  corregidos en la migración y en 4 paquetes del front; `humo_e3_cierre` 85/85). Andrés aplicó
  `20261024181218_e3_cierre` tras el respaldo `context/respaldos/produccion-2026-10-24-antes-e3c-*`; verificado por MCP (53
  migraciones, 152 plantillas, 74 claves, 71 permisos, `amo_privacidad` activo, `amo_correos` inactivo, advisors sin
  ERROR). Matriz de navegadores (RNF-COM-01) en verde: 136 pruebas en Firefox, Safari, Safari iOS y Chrome Android, tras
  corregir la hidratación en Safari (mes abreviado y «p.m.» de WebKit: `formatoFecha()` y regla de ESLint) y la cookie de
  sesión `Secure` según el protocolo. Regresión E2E completa 727/727, 6.800 Vitest, typecheck, lint y build en verde.
  GEO-010: peor p95 del explorador 112 ms (serie mensual en una lectura y funciones puras integradas). NOT-004 queda ⏸
  (correo construido y apagado; activación en `context/Servicios-Pendientes-Definir.md` §5).
