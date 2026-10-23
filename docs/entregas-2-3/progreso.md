# Progreso de las Entregas 2 y 3

Estados: ⬜ pendiente · 🔧 en curso · 🧪 probado (base local o develop) · ✅ en producción · ⏸ construido apagado (depende de un
servicio externo, ver `context/Servicios-Pendientes-Definir.md`).

| Fase | Contenido                                                                               | Estado |
| ---- | --------------------------------------------------------------------------------------- | ------ |
| P0   | Desbloqueo (registrar anunciante/medio, ROL-008, NIT) y bloques compartidos             | ✅     |
| P1   | Alta y verificación del medio, términos, vinculación pública, notificaciones de negocio | ✅     |
| P2   | Anunciante, campañas, asistente de oferta, creativos, moderación                        | ✅     |
| P3   | Marketplace, ejecución del medio, seguimiento del anunciante (cierra E2)                | ⬜     |
| P4   | Validación de evidencias y métricas, disputas, suspensión                               | ⬜     |
| P5   | Liquidaciones, documento soporte, pagos, facturas, ganancias                            | ⬜     |
| P6   | Gestión asistida, reputación, derechos del titular, correo, tiempo real, cierre         | ⬜     |

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
| NOT-003          | Notificaciones por eventos del negocio                     | P1    | 🔧     |
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
| MED-008          | Marketplace de ofertas elegibles                           | P3    | ⬜     |
| MED-009          | Detalle de la oferta                                       | P3    | ⬜     |
| MED-010          | Aceptar o rechazar una oferta                              | P3    | ⬜     |
| MED-011          | Mis campañas                                               | P3    | ⬜     |
| MED-012          | Entrega de contenido                                       | P3    | ⬜     |
| MED-013          | Carga de evidencia de publicación                          | P3    | ⬜     |
| MED-014          | Carga de métricas por corte                                | P3    | ⬜     |
| ANU-011          | Seguimiento de campaña                                     | P3    | ⬜     |
| ANU-012          | Métricas y reportes del anunciante                         | P3    | ⬜     |
| INT-001          | Captura obligatoria del panel nativo                       | P3    | ⬜     |
| INT-002          | URL del post verificable                                   | P3    | ⬜     |
| INT-005          | Validaciones de coherencia                                 | P3    | ⬜     |
| NOT-005          | Recordatorios automáticos                                  | P3    | ⬜     |
| NOT-006          | Aviso de nueva versión del paquete creativo                | P3    | ⬜     |
| PRC-003          | Multiplicador de calidad (visible al medio)                | P3    | ⬜     |
| PRC-004          | Recálculo programado con aviso previo                      | P3    | ⬜     |
| CUP-004          | Vencimiento y liberación de cupos                          | P3    | ⬜     |
| CUP-005          | Transiciones automáticas                                   | P3    | ⬜     |
| CUP-006          | Prueba de carrera automatizada                             | P3    | ⬜     |
| DSH-006          | Inicio del medio con botones directos                      | P3    | ⬜     |
| ADM-002          | Ficha y suspensión de medios                               | P4    | ⬜     |
| ADM-007          | Validación de evidencias                                   | P4    | ⬜     |
| ADM-008          | Validación de métricas con alertas                         | P4    | ⬜     |
| ADM-009          | Verificación de la asignación (puerta a pago)              | P4    | ⬜     |
| ADM-010          | Cancelación de asignaciones con causa                      | P4    | ⬜     |
| ADM-011          | Apertura de disputas                                       | P4    | ⬜     |
| ADM-012          | Bandeja y resolución de disputas                           | P4    | ⬜     |
| INT-003          | Alerta de desviación frente al histórico propio            | P4    | ⬜     |
| INT-004          | Alerta de alcance excesivo frente a seguidores             | P4    | ⬜     |
| INT-006          | Revisión obligatoria y consecuencias                       | P4    | ⬜     |
| LIQ-001          | Generación de liquidaciones                                | P5    | ⬜     |
| LIQ-002          | Cálculo de retenciones                                     | P5    | ⬜     |
| LIQ-003          | Aprobación con segregación y anulación                     | P5    | ⬜     |
| LIQ-004          | Documento soporte electrónico                              | P5    | ⬜     |
| LIQ-005          | Archivo de dispersión bancaria                             | P5    | ⬜     |
| LIQ-006          | Registro de pago con soporte                               | P5    | ⬜     |
| LIQ-007          | Control de seguridad social                                | P5    | ⬜     |
| LIQ-008          | Facturas al anunciante y cartera                           | P5    | ⬜     |
| MED-015          | Ganancias                                                  | P5    | ⬜     |
| ANU-013          | Facturación del anunciante                                 | P5    | ⬜     |
| ADM-014          | Gestión asistida por cuenta del anunciante                 | P6    | ⬜     |
| MED-016          | Indicadores de reputación                                  | P6    | ⬜     |
| CTA-007          | Derechos del titular de datos                              | P6    | ⬜     |
| NOT-004          | Notificaciones por correo electrónico                      | P6    | ⬜     |
| NOT-007          | Actualización en tiempo real                               | P6    | ⬜     |
| CFG-001…009      | Criterios «Verificable en E2/E3» de configuración          | P1–P5 | ⬜     |
| DSH-003, GEO-010 | Criterios «Verificable en E3»                              | P6    | ⬜     |

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
- Pendiente para investigar: tras un ingreso o un `reload()` dentro del runner E2E conviven un instante dos copias del
  contenido de la página (`_R_…` del servidor y `_r_…` del cliente); no se reproduce fuera del runner ni en desarrollo.
  Los specs afectados esperan a que quede una sola copia.
- Pendiente (P6): limpieza programada de objetos de Storage sin fila (subidas no confirmadas o reemplazadas).
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
