# Progreso de las Entregas 2 y 3

Estados: ⬜ pendiente · 🔧 en curso · 🧪 probado (base local o develop) · ✅ en producción · ⏸ construido apagado (depende de un
servicio externo, ver `context/Servicios-Pendientes-Definir.md`).

| Fase | Contenido | Estado |
|---|---|---|
| P0 | Desbloqueo (registrar anunciante/medio, ROL-008, NIT) y bloques compartidos | 🧪 |
| P1 | Alta y verificación del medio, términos, vinculación pública, notificaciones de negocio | 🔧 |
| P2 | Anunciante, campañas, asistente de oferta, creativos, moderación | ⬜ |
| P3 | Marketplace, ejecución del medio, seguimiento del anunciante (cierra E2) | ⬜ |
| P4 | Validación de evidencias y métricas, disputas, suspensión | ⬜ |
| P5 | Liquidaciones, documento soporte, pagos, facturas, ganancias | ⬜ |
| P6 | Gestión asistida, reputación, derechos del titular, correo, tiempo real, cierre | ⬜ |

## Requisitos

| RF | Nombre | Fase | Estado |
|---|---|---|---|
| — | Registrar anunciante y medio (equipo AMO) | P0 | 🧪 |
| ROL-008 | El Administrador gestiona usuarios de anunciantes y medios | P0 | 🧪 |
| AUT-012 | Aceptación versionada de términos y política de datos | P1 | 🔧 |
| MED-001 | Solicitud de vinculación del medio | P1 | 🔧 |
| MED-002 | Perfil del medio | P1 | 🔧 |
| MED-003 | Carga de documentos por nivel | P1 | 🔧 |
| MED-004 | Datos de pago y condición tributaria | P1 | 🔧 |
| MED-005 | Cuentas sociales y verificación de control | P1 | 🔧 |
| MED-006 | Reverificación periódica de seguidores | P1 | 🔧 |
| MED-007 | Tope por nivel y camino para subir de nivel | P1 | 🔧 |
| ADM-001 | Cola de verificación de medios | P1 | 🔧 |
| ADM-006 | Clasificación de pertinencia geográfica | P1 | 🔧 |
| NOT-003 | Notificaciones por eventos del negocio | P1 | ⬜ |
| ANU-001 | Registro y datos de la empresa | P0/P2 | 🔧 |
| ANU-002 | Varios usuarios por anunciante | P2 | ⬜ |
| ANU-003 | Creación de campañas | P2 | ⬜ |
| ANU-004 | Asistente de oferta · Qué se publica | P2 | ⬜ |
| ANU-005 | Asistente de oferta · A quién le llega | P2 | ⬜ |
| ANU-006 | Asistente de oferta · Cuándo | P2 | ⬜ |
| ANU-007 | Asistente de oferta · Cuánto y estimador | P2 | ⬜ |
| ANU-008 | Asistente de oferta · Paquete creativo | P2 | ⬜ |
| ANU-009 | Asistente de oferta · Condiciones, revisión y envío | P2 | ⬜ |
| ANU-010 | Versionado de creativos | P2 | ⬜ |
| ANU-014 | Cancelación de ofertas y campañas | P2 | ⬜ |
| ADM-003 | Verificación de anunciantes | P2 | ⬜ |
| ADM-005 | Moderación de ofertas | P2 | ⬜ |
| MED-008 | Marketplace de ofertas elegibles | P3 | ⬜ |
| MED-009 | Detalle de la oferta | P3 | ⬜ |
| MED-010 | Aceptar o rechazar una oferta | P3 | ⬜ |
| MED-011 | Mis campañas | P3 | ⬜ |
| MED-012 | Entrega de contenido | P3 | ⬜ |
| MED-013 | Carga de evidencia de publicación | P3 | ⬜ |
| MED-014 | Carga de métricas por corte | P3 | ⬜ |
| ANU-011 | Seguimiento de campaña | P3 | ⬜ |
| ANU-012 | Métricas y reportes del anunciante | P3 | ⬜ |
| INT-001 | Captura obligatoria del panel nativo | P3 | ⬜ |
| INT-002 | URL del post verificable | P3 | ⬜ |
| INT-005 | Validaciones de coherencia | P3 | ⬜ |
| NOT-005 | Recordatorios automáticos | P3 | ⬜ |
| NOT-006 | Aviso de nueva versión del paquete creativo | P3 | ⬜ |
| PRC-003 | Multiplicador de calidad (visible al medio) | P3 | ⬜ |
| PRC-004 | Recálculo programado con aviso previo | P3 | ⬜ |
| CUP-004 | Vencimiento y liberación de cupos | P3 | ⬜ |
| CUP-005 | Transiciones automáticas | P3 | ⬜ |
| CUP-006 | Prueba de carrera automatizada | P3 | ⬜ |
| DSH-006 | Inicio del medio con botones directos | P3 | ⬜ |
| ADM-002 | Ficha y suspensión de medios | P4 | ⬜ |
| ADM-007 | Validación de evidencias | P4 | ⬜ |
| ADM-008 | Validación de métricas con alertas | P4 | ⬜ |
| ADM-009 | Verificación de la asignación (puerta a pago) | P4 | ⬜ |
| ADM-010 | Cancelación de asignaciones con causa | P4 | ⬜ |
| ADM-011 | Apertura de disputas | P4 | ⬜ |
| ADM-012 | Bandeja y resolución de disputas | P4 | ⬜ |
| INT-003 | Alerta de desviación frente al histórico propio | P4 | ⬜ |
| INT-004 | Alerta de alcance excesivo frente a seguidores | P4 | ⬜ |
| INT-006 | Revisión obligatoria y consecuencias | P4 | ⬜ |
| LIQ-001 | Generación de liquidaciones | P5 | ⬜ |
| LIQ-002 | Cálculo de retenciones | P5 | ⬜ |
| LIQ-003 | Aprobación con segregación y anulación | P5 | ⬜ |
| LIQ-004 | Documento soporte electrónico | P5 | ⬜ |
| LIQ-005 | Archivo de dispersión bancaria | P5 | ⬜ |
| LIQ-006 | Registro de pago con soporte | P5 | ⬜ |
| LIQ-007 | Control de seguridad social | P5 | ⬜ |
| LIQ-008 | Facturas al anunciante y cartera | P5 | ⬜ |
| MED-015 | Ganancias | P5 | ⬜ |
| ANU-013 | Facturación del anunciante | P5 | ⬜ |
| ADM-014 | Gestión asistida por cuenta del anunciante | P6 | ⬜ |
| MED-016 | Indicadores de reputación | P6 | ⬜ |
| CTA-007 | Derechos del titular de datos | P6 | ⬜ |
| NOT-004 | Notificaciones por correo electrónico | P6 | ⬜ |
| NOT-007 | Actualización en tiempo real | P6 | ⬜ |
| CFG-001…009 | Criterios «Verificable en E2/E3» de configuración | P1–P5 | ⬜ |
| DSH-003, GEO-010 | Criterios «Verificable en E3» | P6 | ⬜ |

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
