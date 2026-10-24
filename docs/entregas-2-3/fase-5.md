# Fase 5 — Finanzas: liquidaciones, documento soporte, pagos, facturas y cartera (E3, parte 2)

Requisitos: LIQ-001…LIQ-008, MED-015, ANU-013 (criterios en `context/requisitos/datos/requisitos.mjs`; léelos, no los
copies). Lee primero [`README.md`](README.md): sus reglas siguen vigentes. Mira también [`fase-4.md`](fase-4.md) (colas,
fichas y decisiones del equipo AMO: el molde de esta fase).

## Lo que ya tiene la base

Migración `20261024024312_e3_finanzas` (aplicada en la base local; tipos regenerados; suite `humo_e3_finanzas.sql`
60/60). Los `*_srv` los ejecuta `service_role` con actor y sesión (`contextoDelActor` + `admin.rpc` + `argumentosRpc`,
como en `src/features/validacion/actions.ts`). Las lecturas sin `_srv` van con la sesión (`crearClienteServidor`). Firmas
y columnas exactas en `src/types/database.types.ts`.

| Objeto                                                                                                                                                         | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pendientes_liquidacion(p_hasta)`                                                                                                                              | LIQ-001. Medios con verificadas sin liquidar: `asignaciones`, `monto_medio`, primera y última verificación, `ultima_liquidacion_fin`, `requiere_documento_soporte` (no factura), `datos_pago_listos`, `seg_social_pendiente`. `liquidaciones.ver`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `periodo_liquidacion_sugerido()` → `{inicio, fin, periodicidad}`                                                                                               | El último periodo cerrado según `liquidaciones.periodicidad` (quincenal: 1–15 y 16–fin de mes). Es lo que se propone al generar el corte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `generar_liquidacion_srv(p_medio_id, p_periodo_inicio, p_periodo_fin, p_actor_id, p_session_id)` → uuid                                                        | Un medio. Rechaza un periodo que no ha cerrado (hint `periodo_abierto`) o que se cruza con otra liquidación vigente. Calcula retenciones (base mínima sobre el total, prorrateo) y la alerta de seguridad social; crea el documento soporte en borrador si el medio no factura. Avisa a quienes aprueban (menos a quien generó) y, si el medio factura, le pide su factura (`liquidacion.factura_requerida`).                                                                                                                                                                                                                                                                                                       |
| `generar_liquidaciones_corte_srv(p_periodo_inicio, p_periodo_fin, p_actor_id, p_session_id)` → filas `{medio_id, medio, liquidacion_id, error}`                | Corte del periodo para todos los medios con verificadas por liquidar. Cada medio en su subtransacción: un error queda en su fila (texto listo para mostrar). Un solo aviso a la cola (`cola.liquidaciones_por_aprobar`, sin fila: enlaza a `?vista=borrador`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Aprobar / anular (`transicionar('liquidaciones', id, 'APROBADA'│'ANULADA', motivo?)`)                                                                          | LIQ-003, LIQ-007. Quien generó no aprueba (salvo SUPERADMIN): `AMO_NO_AUTORIZADO` «Quien genera una liquidación no puede aprobarla.». Al aprobar se reevalúa la seguridad social (la columna `alerta_seg_social` se actualiza); con la política BLOQUEAR falla con `AMO_SEG_SOCIAL_PENDIENTE`. Anular exige motivo; si el documento soporte ya tiene CUDS sin nota de ajuste, hint `requiere_nota_ajuste`.                                                                                                                                                                                                                                                                                                          |
| `emitir_documento_soporte_srv(p_liquidacion_id, …)` → uuid                                                                                                     | LIQ-004 con numeración de la plataforma (consecutivo sin huecos; `AMO_RESOLUCION_AGOTADA`). Con `tributario.numeracion_documento_soporte = PROVEEDOR` falla con hint `numeracion_proveedor`. Repetirlo devuelve el mismo documento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `preparar_documento_soporte_srv(p_liquidacion_id, …)` → uuid                                                                                                   | El borrador del documento de una liquidación aprobada (lo crea si el anterior se anuló). Para subir el PDF del proveedor antes de registrarlo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `registrar_documento_soporte_externo_srv(p_documento_id, p_prefijo, p_consecutivo, p_fecha_emision, p_cuds, p_archivo_path, …)` → `{numero,…}`                 | Numeración del proveedor: número dentro de una resolución DOCUMENTO_SOPORTE vigente, fecha entre la generación y hoy, CUDS (96 hex) y el PDF ya subido a `documento_soporte/{id}/`. Hints `numeracion_plataforma`, `cuds_formato`, `archivo_no_cargado`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `adjuntar_archivos_documento_soporte_srv(p_documento_id, p_pdf_path, p_archivo_proveedor_path, …)`                                                             | Guarda el PDF y el archivo para el proveedor (ambos ya en Storage). Se pueden reemplazar mientras el documento siga emitido (el PDF se regenera al registrar el CUDS).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `registrar_cuds_srv(p_documento_id, p_cuds, …)`                                                                                                                | CUDS de 96 caracteres hexadecimales (se normaliza a minúsculas). Repetir el mismo es inocuo; otro distinto: hint `cuds_registrado` («se corrige con nota de ajuste»).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `registrar_nota_ajuste_srv(p_documento_id, p_numero, p_cude, p_archivo_path, …)`                                                                               | D38 del RF: para un documento transmitido (con CUDS). Después se anula el documento (`transicionar('documentos_soporte', id, 'ANULADO', motivo)`) o la liquidación, y se emite otro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `datos_documento_soporte(p_documento_id)` → jsonb                                                                                                              | Lo que lleva el PDF y el archivo genérico: `documento`, `resolucion`, `liquidacion`, `medio` (nombre y municipio), `adquiriente` (configuración de AMO), `lineas` y `retenciones` agrupadas. Los datos reservados del medio (titular, documento, dirección) se piden con `revelar_privado_srv('medios_privado', …)` y quedan en la bitácora.                                                                                                                                                                                                                                                                                                                                                                        |
| `liquidaciones_por_pagar(p_limite, p_desplazamiento)`                                                                                                          | Aprobadas con `documento_listo`, `datos_pago_listos`, `metodo_pago`, `dispersion_id`, `dispersada_at` y `total`. Sin datos reservados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `datos_dispersion_srv(p_liquidacion_ids, p_actor_id, p_session_id, p_repetir default false)`                                                                   | LIQ-005, paso 1. Exige `liquidaciones.registrar_pago` y `datos_sensibles.ver` (si falta el segundo, hint `datos_sensibles.ver` y un detalle que lo nombra). Todas aprobadas, con documento soporte o factura (`AMO_DOCUMENTO_SOPORTE_REQUERIDO`), datos de pago completos con su certificación aprobada después del último cambio (hint `datos_pago_incompletos`, nombra los medios) y sin otra dispersión salvo `p_repetir` (hint `ya_dispersada`). Registra un `REVELAR_DATO` por medio y devuelve los datos **cifrados**: se descifran en el servidor (`descifrarCuentaPago`, `descifrarNumeroDocumento` de `src/features/mi-medio/cifrado-pago.ts`).                                                            |
| `registrar_dispersion_srv(p_dispersion_id, p_liquidacion_ids, p_archivo_path, …, p_repetir)` → uuid                                                            | LIQ-005, paso 2: con el CSV ya subido a `dispersion/{p_dispersion_id}/x.csv`, registra la dispersión (un `EXPORTAR`). Idempotente con la misma dispersión. Criterio LIQ-005 c1: N liquidaciones de N medios = N + 1 eventos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `registrar_pago_liquidacion_srv(p_liquidacion_id, p_fecha, p_referencia, p_soporte_path, …)`                                                                   | LIQ-006. El soporte ya en `liquidacion/{id}/…` (hint `soporte_no_cargado`) y la fecha entre la generación y hoy (hint `fecha_pago`). Sin documento soporte o factura del medio: `AMO_DOCUMENTO_SOPORTE_REQUERIDO`. Pasa la liquidación y sus asignaciones a PAGADA y avisa al medio («Pagamos tu liquidación…»).                                                                                                                                                                                                                                                                                                                                                                                                    |
| `registrar_factura_medio_srv(p_liquidacion_id, p_numero, p_archivo_path, …)`                                                                                   | LIQ-004: el medio que factura (actor MEDIO dueño) o Finanzas (`liquidaciones.registrar_pago`) registra número y PDF (en `liquidacion/{id}/factura/…`; el medio sube con su sesión).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lecturas del medio: `mis_liquidaciones_medio(p_limite, p_antes_id, p_id)`, `lineas_liquidacion_medio(p_liquidacion_id)`, `resumen_ganancias_medio()`           | MED-015. El medio **ya no lee** las tablas `liquidaciones` ni `documentos_soporte` (RLS): bruto y comisión llegan en `null` si `comision.visible_para_medio` está apagada. `mis_liquidaciones_medio` trae retenciones por tipo, `enviada_banco_at`, `fecha_pago_estimada`, documento (número, fecha, estado, CUDS, ruta) y su factura; no lista las anuladas. `resumen_ganancias_medio`: `ganado_mes`, `por_liquidar` (estimado antes de retenciones), `por_pagar`, `pagado_historico`, `retenciones_historicas`, `proximo_pago_estimado`, `periodicidad`, `dias_pago`, `comision_visible`, `requiere_documento_soporte`, `seg_social_pendiente`. Los archivos siguen por `soy_dueno_soporte` (firma como usuario). |
| `pendientes_facturacion(p_hasta)`                                                                                                                              | LIQ-008. Por anunciante y campaña: asignaciones verificadas, liquidadas o pagadas sin factura, con su bruto. `facturas.ver`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `generar_factura_srv(p_anunciante_id, p_campana_id, p_periodo_desde, p_periodo_hasta, …)` → uuid                                                               | Borrador por campaña (`p_campana_id`) o consolidado (`null`) con lo verificado sin facturar hasta la fecha (arrastra lo anterior). Importes según `facturacion.esquema`: COMPRA_REVENTA (IVA sobre el total) o MANDATO (IVA sobre la comisión; el valor del medio como `valor_terceros`). Hint `sin_asignaciones`. La sesión ya no inserta ni edita facturas.                                                                                                                                                                                                                                                                                                                                                       |
| `registrar_factura_expedida_srv(p_factura_id, p_prefijo, p_consecutivo, p_cufe, p_fecha_emision, p_fecha_vencimiento, p_total, p_archivo_path, …)`             | La factura se expide en el software de AMO y aquí se registra: número dentro de una resolución FACTURA_VENTA vigente (`AMO_RESOLUCION_AGOTADA`), CUFE de 96 hex (hint `cufe_formato`), total igual al del borrador (hint `total_distinto`), PDF ya en `factura/{id}/` (hint `archivo_no_cargado`), vencimiento (por defecto `facturacion.dias_vencimiento`). Si alguna línea ya no está verificada (disputa, cancelación): hint `borrador_desactualizado` (anular el borrador y generar otro). Avisa al anunciante (`factura.emitida`).                                                                                                                                                                             |
| `registrar_pago_anunciante_srv(p_factura_id, p_fecha, p_monto, p_medio_pago, p_referencia, p_soporte_path, p_actor_id, p_session_id, p_retenciones default 0)` | Pago parcial o total con soporte (`pago/{factura_id}/…`, obligatorio) y las retenciones que practicó el anunciante (cuentan para el saldo). Fecha entre la emisión y hoy. `medio_pago`: TRANSFERENCIA, PSE, CONSIGNACION, CHEQUE, OTRO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `registrar_nota_credito_srv(p_factura_id, p_numero, p_cude, p_fecha_emision, p_valor, p_motivo, p_archivo_path, p_asignacion_ids, …)` → uuid                   | D38 del RF: una factura expedida no se anula. Nota que cubre todo el saldo de una factura sin pagos → ANULADA (aviso `factura.anulada`); parcial → rebaja el saldo y libera las asignaciones indicadas (aviso `factura.nota_credito`). CUDE de 96 hex; motivo de 10 a 1000. `transicionar('facturas', id, 'ANULADA')` solo sirve para un **borrador** (libera sus asignaciones).                                                                                                                                                                                                                                                                                                                                    |
| `notas_credito` (tabla)                                                                                                                                        | Lectura con la sesión: equipo con `facturas.ver`; el anunciante, las suyas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Anunciante                                                                                                                                                     | Solo ve sus facturas **expedidas** (`consecutivo` no nulo) y sus archivos; los borradores no. `pagos_anunciante` y `notas_credito` por RLS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reportes                                                                                                                                                       | `reporte_cartera` y `reporte_finanzas` descuentan notas crédito y cuentan las retenciones del anunciante como pagadas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Configuración nueva                                                                                                                                            | `facturacion.esquema`, `tributario.numeracion_documento_soporte`, `tributario.adquiriente_{razon_social,nit,dv,direccion}` (vacíos: el PDF los muestra como «Pendiente de configurar»). Bucket `soportes` admite `application/json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Lo que integró el líder (no lo toques; si necesitas otra cosa ahí, repórtalo)

- Navegación: grupo **Finanzas** (Liquidaciones `liquidaciones.ver`, Pagos a medios `liquidaciones.registrar_pago`, Facturas
  y Cartera `facturas.ver`), **Ganancias** del medio (`liquidaciones.ver_propias`, entra en la barra inferior) y
  **Facturas** del anunciante (`facturas.ver_propias`).
- `/ir`: `liquidaciones` → equipo `/finanzas/liquidaciones/{id}` (con `liquidaciones.ver`), medio `/ganancias/{id}`;
  `facturas` → equipo `/finanzas/facturas/{id}` (con `facturas.ver`), anunciante `/facturas/{id}`. Respeta esas rutas.
- Rutas (contrato): `src/features/liquidaciones/rutas.ts`, `src/features/pagos-medios/rutas.ts`,
  `src/features/facturacion/rutas.ts`, `src/features/ganancias/rutas.ts`, `src/features/facturas-anunciante/rutas.ts`.
- Contratos con stub (cada dueño los implementa **sin cambiar las firmas**): `src/features/documento-soporte/tipos.ts`,
  `queries.ts` (`documentoSoporteDeLiquidacion`, `numeracionDocumentoSoporte`) y
  `components/seccion-documento-soporte.tsx` (`SeccionDocumentoSoporte`), de DS; y
  `src/features/pagos-medios/components/registrar-pago-liquidacion.tsx` (`RegistrarPagoLiquidacion`), de PG.
- Compartidos nuevos: `subirComoServicio` (`src/lib/storage/subidas-servidor.ts`: archivos que genera el servidor, con el
  cliente de servicio después del DAL), `carpetaSoporte(tipo, id, subcarpeta?)` (`liquidacion/{id}/pago` y
  `liquidacion/{id}/factura`), `LOGO_DOCUMENTOS` (`src/lib/export/logo-documentos.generated.ts`: PNG del logotipo para los
  PDF del servidor), rótulos de los criterios en los errores (`Seguridad social pendiente: …`, `Documento soporte
requerido: …`, `Resolución agotada: …`, en `src/lib/errores-bd.ts`) y las fichas de configuración nuevas.
- E2E: proyecto `finanzas` (`SPECS_FINANZAS`: `e2e/finanzas-*.spec.ts`, un worker, 1440 px), después de `validacion`. Las
  pruebas que escriben se saltan fuera de ese proyecto (`test.skip(info.project.name !== PROYECTO_FINANZAS, …)`, como
  `e2e/validacion-colas.spec.ts`).
- El líder enlaza al final la ficha de la asignación (liquidación y factura), la pestaña de cartera del anunciante y el
  inicio del medio.

**Convenciones de la fase:** decisiones con `transicionar`/`*_srv` y el molde de la fase 4 (`DialogoConfirmacion`,
`DialogoMotivo` de `src/features/usuarios/components/dialogo-motivo.tsx`, foco tras el cambio, toast). Listas con la
tabla genérica (`src/components/data-table`) y filtros en la URL (nuqs); paginación acotada. Subidas del navegador con
`prepararSubidaFirmada` + `ZonaArchivos` (la política de Storage decide); archivos que genera el servidor con
`subirComoServicio`. Descargas: el equipo firma **como servicio** (`firmarDescarga` con `firmante: { como: "servicio",
contexto, entidad, entidadId }`, queda `URL_FIRMADA` en la bitácora; el equipo no tiene SELECT en `soportes`); medio y
anunciante, **como usuario**. Dinero con `formatearCOP` y fechas con `src/lib/fechas.ts` (America/Bogota). Errores con
`mensajeErrorBd`; los `hint` nuevos tienen texto o acción propia en la interfaz (p. ej. `ya_dispersada` ofrece «Incluirlas
otra vez»). Interno: escritorio primero, usable a 834 y 390 px; medio y anunciante: móvil primero (390 px). Los RF usan
estos textos literales: «Seguridad social pendiente», «Documento soporte requerido», «Resolución agotada», «Pagamos tu
liquidación», «Estimado antes de retenciones».

## Paquete LQ — Liquidaciones (LIQ-001, LIQ-002, LIQ-003, LIQ-007)

**Propiedad:** `src/features/liquidaciones/**` (conserva `rutas.ts`), `src/app/(app)/finanzas/liquidaciones/**`,
`e2e/finanzas-liquidaciones.spec.ts`.

- `/finanzas/liquidaciones?vista=pendientes|borrador|aprobadas|pagadas|anuladas&pagina=` (`requerirPermiso("liquidaciones.ver")`),
  pestañas con contador (`rutaVistaLiquidaciones`).
  - **Pendientes:** `pendientes_liquidacion`: medio, asignaciones, valor estimado, desde cuándo, si factura o lleva
    documento soporte, «Datos de pago incompletos» y «Seguridad social pendiente» como insignias. «Generar corte»
    (`liquidaciones.generar`): diálogo con el periodo sugerido (`periodo_liquidacion_sugerido`, editable; fin ≤ hoy) y
    cuántos medios entran → `generar_liquidaciones_corte_srv`; el resultado se muestra por medio (creada con enlace, o el
    error). También «Liquidar» por fila (`generar_liquidacion_srv`).
  - **Borrador:** selección múltiple → «Aprobar» (`liquidaciones.aprobar`) con resultado por fila (D17 y seguridad social
    pueden rechazar algunas); las que generó la persona salen deshabilitadas con el porqué.
  - **Aprobadas / pagadas / anuladas:** periodo, medio, neto, documento soporte o factura, dispersión, fecha de pago.
- `/finanzas/liquidaciones/[id]` (`liquidaciones.ver`): cabecera con estado (`ESTADOS_LIQUIDACION`) y acciones; tarjetas de
  montos (bruto, comisión, valor del medio, cada retención con tarifa, base y municipio, neto) y de seguridad social (si
  tiene alerta: la política vigente y qué hacer); asignaciones incluidas (enlace a `/operacion/asignaciones/{id}`);
  **Documento soporte** si `requiere_documento_soporte` (monta `SeccionDocumentoSoporte` de DS con
  `documentoSoporteDeLiquidacion` y `numeracionDocumentoSoporte`) o **Factura del medio** si no (número y PDF; Finanzas
  también puede registrarla: subida a `carpetaSoporte("liquidacion", id, "factura")` + `registrar_factura_medio_srv`);
  **Pago** (monta `RegistrarPagoLiquidacion` de PG si está aprobada; si está pagada, fecha, referencia y soporte
  descargable; dispersión con su fecha).
  - «Aprobar» (deshabilitado con el porqué si la generó la persona y no es SUPERADMIN) y «Anular» (`DialogoMotivo`; si ya
    está en un archivo de pagos, el diálogo lo advierte: «Ya está en el archivo de pagos del {fecha}: confirma con
    tesorería que el banco no la pagó»; `requiere_nota_ajuste` lleva a la sección del documento).
- Acciones en `src/features/liquidaciones/actions.ts` (`generarCorte`, `generarLiquidacion`, `aprobarLiquidaciones`,
  `anularLiquidacion`, `registrarFacturaMedioInterna`, `prepararFacturaMedioInterna`), cada una con `requerirPermiso` y
  `revalidatePath`.

## Paquete DS — Documento soporte (LIQ-004)

**Propiedad:** `src/features/documento-soporte/**` (implementa los stubs sin cambiar firmas),
`src/lib/export/documento-soporte-pdf.ts` (+ prueba), `e2e/finanzas-documento-soporte.spec.ts`.

- `queries.ts`: `documentoSoporteDeLiquidacion` (vigente o el último, con los anulados anteriores) y
  `numeracionDocumentoSoporte` (con la sesión).
- **Emitir (plataforma):** acción `emitirDocumentoSoporte({ liquidacionId })` → `emitir_documento_soporte_srv` y genera los
  archivos: `datos_documento_soporte`; `revelar_privado_srv('medios_privado', medio, …, ['titular_nombre',
'tipo_documento', 'numero_documento_cifrado', 'direccion'])` y `descifrarNumeroDocumento`; PDF (jsPDF en el servidor,
  `construirDocumentoSoportePdf(datos, LOGO_DOCUMENTOS)`) y archivo genérico JSON (`formato: "AMO-DS-1"`: documento,
  resolución, vendedor, adquiriente, ítems, retenciones y totales); `subirComoServicio` a
  `nuevaRuta(carpetaSoporte("documento_soporte", id), mime)`; `adjuntar_archivos_documento_soporte_srv`. Si algo falla
  después de emitir, el documento queda emitido y la sección ofrece «Generar archivos» (idempotente).
- **PDF:** título «Documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura de venta o
  documento equivalente»; número, fecha y resolución (número, fecha, prefijo, rango, vigencia); vendedor (titular, tipo y
  número de documento, dirección, municipio) y adquiriente (AMO desde la configuración; vacíos: «Pendiente de
  configurar»); detalle por publicación (oferta, marca, plataforma y formato, fecha, valor); valor total; retenciones
  practicadas (tipo, tarifa, base, valor) y neto a pagar; CUDS o «Pendiente de transmisión a la DIAN»; si la resolución
  es de prueba (prefijo `DEMO`/`PRUEBA` o número que empieza por `PRUEBA`), marca de agua «VERSIÓN DE PRUEBA — SIN VALIDEZ
  FISCAL». Pruebas Vitest del constructor (entorno node).
- **CUDS:** `registrarCuds({ documentoId, cuds })` → `registrar_cuds_srv` y regenera el PDF con el CUDS.
- **Proveedor:** con `PROVEEDOR`, la sección no ofrece «Emitir» sino «Registrar documento expedido»: prefijo, número, fecha,
  CUDS y el PDF del proveedor (subida firmada a `carpetaSoporte("documento_soporte", id)`; la política lo permite con
  `liquidaciones.aprobar`) → `preparar_documento_soporte_srv` + `registrar_documento_soporte_externo_srv`.
- **Corrección:** con CUDS, «Registrar nota de ajuste» (número, CUDE opcional, PDF) y después «Anular documento»
  (`DialogoMotivo`) para volver a emitir; sin CUDS, «Anular documento» directo. Historial de documentos anteriores.
- `SeccionDocumentoSoporte`: estado, número, fecha, valor, CUDS (copiar), descargas (PDF, archivo para el proveedor, nota de
  ajuste; firma como servicio) y las acciones según estado, numeración y `puedeGestionar`. Los errores con su texto
  (`Resolución agotada: …`).

## Paquete PG — Pagos a medios (LIQ-005, LIQ-006)

**Propiedad:** `src/features/pagos-medios/**` (conserva `rutas.ts`; implementa el stub), `src/app/(app)/finanzas/pagos/**`,
`e2e/finanzas-pagos.spec.ts`.

- `/finanzas/pagos?vista=por-pagar|dispersiones` (`requerirPermiso("liquidaciones.registrar_pago")`).
  - **Por pagar** (`liquidaciones_por_pagar`): medio, periodo, neto, «Documento listo» / «Falta documento soporte o
    factura», «Datos de pago listos» / «Datos de pago incompletos», método, y si ya está en un archivo (fecha). Selección
    → «Generar archivo de pagos»: si la persona no tiene `datos_sensibles.ver`, el botón lo explica antes de llamar
    («Necesitas el permiso Ver datos sensibles: el archivo revela los datos bancarios»). Acción servidor: uuid nuevo →
    `datos_dispersion_srv` → descifrar → CSV genérico (`aCsv` de `src/components/data-table/exportar.ts`: tipo y número de
    documento, titular, método, banco o billetera, tipo y número de cuenta, valor en pesos sin decimales, referencia
    `LIQ-{AAAAMMDD}-{8 primeros del id}`, medio) → `subirComoServicio` a `nuevaRuta(carpetaSoporte("dispersion", uuid),
"text/csv")` → `registrar_dispersion_srv` → URL firmada para descargar. `ya_dispersada` → confirmar «Incluirlas otra
    vez» (`p_repetir`). Nada de los datos descifrados sale en logs ni en la respuesta salvo el archivo.
  - **Dispersiones:** historial (fecha, cantidad, total, quién la generó), descarga firmada como servicio y las
    liquidaciones de cada una.
- `RegistrarPagoLiquidacion` (contrato): botón «Registrar pago» → diálogo con fecha (entre `fechaMinima` y hoy),
  referencia y soporte (`ZonaArchivos`, subida firmada a `carpetaSoporte("liquidacion", id, "pago")`) →
  `registrar_pago_liquidacion_srv`. Si `documentoListo` es falso, el botón queda deshabilitado con «Documento soporte
  requerido: …». Lo usan la fila de «Por pagar» y la ficha de LQ.
- Opcional si cabe: «Registrar el pago de la dispersión» (un comprobante para todas: se sube una vez a la carpeta de pago
  de la primera y el servidor lo copia con el cliente de servicio a las demás antes de registrar cada una).

## Paquete FA — Facturas al anunciante y cartera (LIQ-008, ADM-004)

**Propiedad:** `src/features/facturacion/**` (conserva `rutas.ts`), `src/app/(app)/finanzas/facturas/**`,
`src/app/(app)/finanzas/cartera/**`, `e2e/finanzas-facturas.spec.ts`.

- `/finanzas/facturas?estado=&anunciante=&desde=&hasta=&pagina=` (`facturas.ver`): número, anunciante, campaña o
  «Consolidada», emisión, vencimiento, total, saldo, estado (`ESTADOS_FACTURA`). «Nueva factura» (`facturas.gestionar`):
  lo por facturar (`pendientes_facturacion`) agrupado por anunciante y campaña; se elige consolidada o por campaña y el
  periodo (hasta ≤ hoy) → `generar_factura_srv` → ficha.
- `/finanzas/facturas/[id]`: anunciante (razón social, NIT-DV), periodo, esquema, subtotal, IVA, ingreso para terceros
  (mandato), total, pagado, notas crédito y saldo; líneas (asignación con enlace, campaña, medio, plataforma, bruto,
  estado; una cancelada o en disputa se marca «Requiere nota crédito»).
  - **Borrador:** «Archivo de carga» (JSON y CSV genéricos para el software de facturación de AMO: adquirente con NIT, DV,
    razón social, `datos_facturacion` y dirección revelada con `revelar_privado_srv('anunciantes_privado', …,
['direccion'])`, ítems y totales), «Registrar factura expedida» (prefijo sugerido de la resolución FACTURA_VENTA
    activa, número, fecha, vencimiento, CUFE y PDF subido a `carpetaSoporte("factura", id)`; muestra el total que debe
    coincidir) y «Anular borrador» (`DialogoMotivo`).
  - **Expedida:** PDF y CUFE (copiar); pagos (fecha, monto, retenciones, medio, referencia, soporte); «Registrar pago»
    (`pagos.registrar`: monto, retenciones del anunciante opcionales con ayuda, medio, referencia, fecha y soporte en
    `carpetaSoporte("pago", facturaId)`); notas crédito (número, fecha, valor, motivo, PDF); «Registrar nota crédito»
    (`facturas.gestionar`: número, CUDE, fecha, valor ≤ saldo, motivo, asignaciones que libera y PDF; si cubre todo el
    saldo y no hay pagos, avisa que la factura queda anulada).
- `/finanzas/cartera?corte=` (`facturas.ver`): `reporte_cartera(p_corte)` con los tramos de edad (reutiliza la
  presentación de `src/features/operacion/calculos.ts` sin editarla), total por anunciante con enlace a su cartera, y las
  facturas vencidas con enlace a su ficha; enlace a `/reportes/cartera` para exportar.

## Paquete GM — Ganancias del medio (MED-015 y la factura del medio que factura)

**Propiedad:** `src/features/ganancias/**` (conserva `rutas.ts`), `src/app/(app)/ganancias/**`,
`src/features/dashboard/medio/**`, `e2e/finanzas-ganancias.spec.ts`.

- `/ganancias` (`requerirPermiso("liquidaciones.ver_propias")`, 390 px primero):
  - Resumen (`resumen_ganancias_medio`): «Ganado este mes», «Por liquidar» con el rótulo **«Estimado antes de
    retenciones»**, «Por pagar», «Pagado a la fecha», «Retenciones practicadas», próximo pago estimado y la regla
    («Liquidamos cada quincena y pagamos en hasta 8 días»).
  - Gráfico semana / mes (`GraficoGanancias` y `serie_ganancias_medio`, ya existen en `dashboard/medio`).
  - Pagos (`mis_liquidaciones_medio`, paginado con `p_antes_id`): una tarjeta por liquidación con periodo, estado en voz del
    medio («En revisión», «Aprobada · por pagar», «En proceso de pago» si `enviada_banco_at`, «Pagada el {fecha}»), neto,
    fecha estimada y las descargas «Soporte de pago» y «Documento soporte» (firma como usuario), o «Carga tu factura» si
    factura y falta. Desde 834 px, tabla.
  - Por liquidar: asignaciones verificadas sin liquidación (`mis_asignaciones_medio`), con su valor estimado.
  - Condición tributaria (`medios_privado` propio: declarante, obliga a facturar, responsable de IVA) con enlace a
    `/mi-medio/pago` y el aviso de seguridad social si `seg_social_pendiente` (enlace a `/mi-medio/documentos`).
- `/ganancias/[id]`: desglose (bruto y comisión solo si llegan), cada retención (tipo, tarifa, base, municipio), neto;
  documento soporte (número, fecha, CUDS o «Pendiente de transmisión a la DIAN»); pago (fecha, referencia, soporte);
  publicaciones (`lineas_liquidacion_medio`). Si factura y la liquidación está en borrador o aprobada: «Carga tu factura»
  (número y PDF; subida con la sesión a `carpetaSoporte("liquidacion", id, "factura")` → `registrar_factura_medio_srv`
  como medio). MED-015 c1: una pagada muestra la fecha y deja descargar el soporte y el documento soporte.
- Inicio del medio: «Ver ganancias» en el bloque de ganancias.

## Paquete FX — Facturas del anunciante (ANU-013)

**Propiedad:** `src/features/facturas-anunciante/**` (conserva `rutas.ts`), `src/app/(app)/facturas/**`,
`src/features/dashboard/anunciante/**`, `e2e/finanzas-facturas-anunciante.spec.ts`.

- `/facturas?desde=&hasta=&estado=&campana=` (`requerirPermiso("facturas.ver_propias")`, móvil primero): resumen «Por
  pagar», «Vencido» y «Próximo vencimiento»; lista con número, emisión, vencimiento («Vence en 5 días», «Venció hace 12
  días»), total, saldo, estado, CUFE abreviado con copiar y PDF. El buscador por fechas filtra por emisión (ANU-013 c1).
  El filtro por campaña usa las asignaciones de la factura (las consolidadas cubren varias).
- `/facturas/[id]`: totales (subtotal, IVA, ingreso para terceros si aplica, total, pagado, notas, saldo), pagos con sus
  retenciones y soporte, notas crédito con su PDF, conceptos (campaña, medio por `medios_publico`, plataforma y formato,
  valor) y descargas firmadas como usuario.
- Panel del anunciante: corrige el número duplicado («DEMODEMO1»: `numero` ya trae el prefijo) y enlaza «Facturas por
  pagar» a cada factura y a `/facturas`.

## Paquete E0 — Fábricas E2E y configuración de prueba

**Propiedad:** `scripts/bootstrap/**`, `scripts/pruebas/**`, `scripts/produccion/**`, `e2e/utilidades/**` salvo
`prueba.ts` y `proyectos.ts`, `.env.example`.

- Cuentas: `FINANZAS` («Finanzas E2E», rol FINANZAS, con TOTP: `E2E_FINANZAS_EMAIL`, `E2E_FINANZAS_PASSWORD`,
  `E2E_FINANZAS_TOTP_SECRET`); «Medio Finanzas E2E» (`MEDIO_FINANZAS`: verificado nivel 1, no declarante, no factura,
  datos de pago cifrados con la llave del entorno y su certificación bancaria aprobada después del cambio, Instagram
  vigente) y «Medio Factura E2E» (`MEDIO_FACTURA`: igual pero declarante y obligado a facturar). Genera las credenciales
  sin imprimirlas; documenta los nombres (sin valores) en `.env.example`.
- API en `e2e/utilidades/finanzas.ts` (camino real y guarda de producción): `ingresarComoFinanzas(page)`,
  `campanaFinanzasE2E()` (campaña «Finanzas E2E …» del Anunciante E2E con una oferta para los dos medios),
  `asignacionVerificadaFinanzasE2E({ medio: "MEDIO_FINANZAS" | "MEDIO_FACTURA", campanaId })`,
  `liquidacionFinanzasE2E({ medio, hasta: "BORRADOR" | "APROBADA" | "EMITIDA" | "PAGADA" })` (genera con el ADMIN E2E y
  aprueba con Finanzas: la segregación se respeta), `facturaFinanzasE2E({ campanaId, hasta: "BORRADOR" | "EMITIDA" })` y
  `restablecerFinanzasE2E()`: solo local o develop, nunca producción; borra por la conexión de la base local, en modo
  carga y purga, las notas, pagos y facturas de las campañas «Finanzas E2E», y las liquidaciones, documentos,
  dispersiones y asignaciones de los dos medios de finanzas, para que cada corrida genere su corte sin traslapes. Más
  `resolucionesPruebaE2E()` si la base no tiene resoluciones activas.
- `pnpm bootstrap:e2e` crea las cuentas; `scripts/bootstrap/comprobar-finanzas-e2e.ts` verifica las fábricas (el líder
  agrega el script `pruebas:finanzas-e2e`).
- **Producción de prueba** (`scripts/produccion/configuracion-pruebas*.ts`, con pruebas): `--aplicar` agrega, si no
  existen, retención en la fuente de referencia (servicios 4 % declarante y 6 % no declarante, base 4 UVT), ReteICA de
  referencia de las capitales donde haya medios o una lista corta (Bogotá 9,66 ‰, Medellín, Cali y Barranquilla 10 ‰…)
  y resoluciones «PRUEBA» de documento soporte (`PDS`, `PRUEBA-DS`, 1–5000) y factura (`PFE`, `PRUEBA-FE`, 1–5000), todo
  `pendiente_validacion`; `--revertir` las quita si no se usaron. Simula por defecto.

## Decisiones de la fase (D75–D88, en `docs/modelo-datos.md` §11.1)

D75 un solo sistema numera el documento soporte (plataforma o proveedor) · D76 archivos del documento soporte y CUDS
registrado a mano mientras no haya transmisión · D77 nota de ajuste antes de anular un documento transmitido · D78
seguridad social reevaluada al aprobar · D79 periodo cerrado y corte por lote · D80 dispersión en dos pasos, sin
repetir sin confirmar y con datos de pago certificados · D81 soporte cargado y fecha válida en cada pago · D82 el medio
lee sus liquidaciones solo por RPC · D83 el medio que factura carga su factura · D84 factura expedida en el software de
AMO y registrada aquí · D85 notas crédito (una expedida no se anula) · D86 esquema del IVA configurable · D87
retenciones del anunciante en el pago · D88 una asignación facturada se puede disputar; si se cancela, nota crédito.
