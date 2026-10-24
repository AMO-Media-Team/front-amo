/**
 * Adaptadores de las RPC de «Ganancias» a sus DTO (módulo puro, sin I/O).
 * Los tipos generados declaran no nulas las columnas de una función SQL: aquí
 * se corrige cada una que puede llegar vacía, y los montos `numeric` (que
 * PostgREST puede entregar como texto) se convierten a número. Las rutas de
 * Storage no salen de aquí: solo si hay archivo.
 */
import { numero } from "@/features/dashboard/insights/adaptadores"
import type { Database, Json } from "@/types/database.types"

import type {
  ArchivoLiquidacion,
  AsignacionPorLiquidar,
  LineaLiquidacionMedio,
  LiquidacionMedio,
  PaginaLiquidaciones,
  ResumenGanancias,
  RetencionAgrupada,
  RetencionAplicada,
} from "./tipos"

type Funciones = Database["public"]["Functions"]
export type FilaLiquidacionRpc =
  Funciones["mis_liquidaciones_medio"]["Returns"][number]
export type FilaLineaRpc =
  Funciones["lineas_liquidacion_medio"]["Returns"][number]
export type FilaAsignacionRpc =
  Funciones["mis_asignaciones_medio"]["Returns"][number]

type Numerico = number | string | null | undefined

const cero = (valor: Numerico) => numero(valor) ?? 0

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null
}

function booleano(valor: unknown): boolean {
  return valor === true
}

// ── Resumen ──────────────────────────────────────────────────────────────────

/**
 * `resumen_ganancias_medio` tiene parámetros OUT: PostgREST entrega un objeto
 * (o una fila, según la versión). Lo que no llegue cuenta como cero.
 */
export function aResumen(datos: unknown): ResumenGanancias {
  const fila = (Array.isArray(datos) ? datos[0] : datos) as
    Record<string, unknown> | null | undefined
  const valor = (clave: string) => fila?.[clave] as Numerico
  return {
    ganadoMes: cero(valor("ganado_mes")),
    porLiquidar: cero(valor("por_liquidar")),
    asignacionesPorLiquidar: cero(valor("asignaciones_por_liquidar")),
    porPagar: cero(valor("por_pagar")),
    liquidacionesPorPagar: cero(valor("liquidaciones_por_pagar")),
    pagadoHistorico: cero(valor("pagado_historico")),
    retencionesHistoricas: cero(valor("retenciones_historicas")),
    proximoPagoEstimado: texto(fila?.proximo_pago_estimado),
    periodicidad: texto(fila?.periodicidad),
    diasPago: numero(valor("dias_pago")),
    comisionVisible: booleano(fila?.comision_visible),
    // Sin fila privada la BD supone que no factura: lleva documento soporte.
    requiereDocumentoSoporte: fila?.requiere_documento_soporte !== false,
    segSocialPendiente: booleano(fila?.seg_social_pendiente),
  }
}

// ── Liquidaciones ────────────────────────────────────────────────────────────

export function aLiquidacion(fila: FilaLiquidacionRpc): LiquidacionMedio {
  const documentoId = texto(fila.documento_id)
  return {
    id: fila.id,
    periodoInicio: fila.periodo_inicio,
    periodoFin: fila.periodo_fin,
    estado: fila.estado,
    cantidadAsignaciones: cero(fila.cantidad_asignaciones),
    montoBruto: numero(fila.monto_bruto as Numerico),
    montoComision: numero(fila.monto_comision as Numerico),
    montoMedio: cero(fila.monto_medio),
    retefuente: cero(fila.retefuente),
    reteica: cero(fila.reteica),
    reteiva: cero(fila.reteiva),
    montoRetenciones: cero(fila.monto_retenciones),
    montoNeto: cero(fila.monto_neto),
    creadaAt: fila.created_at,
    aprobadaAt: texto(fila.aprobada_at),
    enviadaBancoAt: texto(fila.enviada_banco_at),
    fechaPago: texto(fila.fecha_pago),
    fechaPagoEstimada: texto(fila.fecha_pago_estimada),
    referenciaPago: texto(fila.referencia_pago),
    conSoportePago: texto(fila.soporte_pago_path) !== null,
    requiereDocumentoSoporte: fila.requiere_documento_soporte !== false,
    documento: documentoId
      ? {
          numero: texto(fila.documento_numero),
          fecha: texto(fila.documento_fecha),
          estado: fila.documento_estado ?? null,
          cuds: texto(fila.cuds),
          conArchivo: texto(fila.documento_path) !== null,
        }
      : null,
    factura: {
      numero: texto(fila.numero_factura_medio),
      conArchivo: texto(fila.factura_medio_path) !== null,
    },
    alertaSegSocial: booleano(fila.alerta_seg_social),
    bloqueaSegSocial: booleano(fila.bloquea_seg_social),
  }
}

/**
 * Página de pagos: se piden `tamano + 1` filas; si llegó la de más, hay otra
 * página y empieza antes de la última que se muestra.
 */
export function paginaLiquidaciones(
  filas: readonly FilaLiquidacionRpc[],
  tamano: number
): PaginaLiquidaciones {
  const liquidaciones = filas.slice(0, tamano).map(aLiquidacion)
  const hayMas = filas.length > tamano
  return {
    liquidaciones,
    siguiente: hayMas ? (liquidaciones.at(-1)?.id ?? null) : null,
  }
}

/** Ruta del archivo pedido, tomada de la fila que devolvió la RPC (nunca del cliente). */
export function rutaArchivo(
  fila: Pick<
    FilaLiquidacionRpc,
    "soporte_pago_path" | "documento_path" | "factura_medio_path"
  >,
  archivo: ArchivoLiquidacion
): string | null {
  switch (archivo) {
    case "soporte_pago":
      return texto(fila.soporte_pago_path)
    case "documento_soporte":
      return texto(fila.documento_path)
    case "factura":
      return texto(fila.factura_medio_path)
  }
}

// ── Retenciones ──────────────────────────────────────────────────────────────

function esObjeto(valor: Json): valor is Record<string, Json | undefined> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/**
 * `asignacion_montos.retenciones_aplicadas`: `[{tipo, concepto, tarifa, base,
 * valor, municipio_codigo, …}]`. Lo que no tenga tipo o valor se descarta.
 */
export function parsearRetenciones(
  json: Json | null | undefined
): RetencionAplicada[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((elemento) => {
    if (!esObjeto(elemento)) return []
    const tipo = texto(elemento.tipo)
    const valor = numero(elemento.valor as Numerico)
    if (!tipo || valor === null) return []
    return [
      {
        tipo,
        concepto: texto(elemento.concepto),
        tarifa: numero(elemento.tarifa as Numerico) ?? 0,
        base: numero(elemento.base as Numerico) ?? 0,
        valor,
        municipioCodigo: texto(elemento.municipio_codigo),
      },
    ]
  })
}

/** Orden de presentación: como las ordena la factura (fuente, IVA, ICA). */
const ORDEN_TIPOS = ["RETEFUENTE", "RETEIVA", "RETEICA"]

function ordenTipo(tipo: string): number {
  const indice = ORDEN_TIPOS.indexOf(tipo)
  return indice === -1 ? ORDEN_TIPOS.length : indice
}

/**
 * Las retenciones de toda la liquidación: cada publicación trae su parte
 * (prorrateada sobre la base total), así que se suman base y valor por tipo,
 * concepto, tarifa y municipio. `nombreMunicipio` traduce el código (ReteICA).
 */
export function agruparRetenciones(
  porLinea: readonly (readonly RetencionAplicada[])[],
  nombreMunicipio: (codigo: string) => string | null = () => null
): RetencionAgrupada[] {
  const grupos = new Map<string, RetencionAgrupada>()
  for (const retencion of porLinea.flat()) {
    const clave = [
      retencion.tipo,
      retencion.concepto ?? "",
      retencion.tarifa,
      retencion.municipioCodigo ?? "",
    ].join("|")
    const actual = grupos.get(clave)
    if (actual) {
      actual.base += retencion.base
      actual.valor += retencion.valor
      continue
    }
    grupos.set(clave, {
      clave,
      tipo: retencion.tipo,
      concepto: retencion.concepto,
      tarifa: retencion.tarifa,
      base: retencion.base,
      valor: retencion.valor,
      municipioCodigo: retencion.municipioCodigo,
      municipio: retencion.municipioCodigo
        ? nombreMunicipio(retencion.municipioCodigo)
        : null,
    })
  }
  return [...grupos.values()].sort(
    (a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || b.valor - a.valor
  )
}

// ── Publicaciones ────────────────────────────────────────────────────────────

export function aLinea(fila: FilaLineaRpc): LineaLiquidacionMedio {
  return {
    asignacionId: fila.asignacion_id,
    oferta: texto(fila.oferta) ?? "Oferta",
    marca: texto(fila.marca),
    anunciante: texto(fila.anunciante),
    plataforma: fila.plataforma,
    formato: texto(fila.formato),
    publicadaAt: texto(fila.publicada_at),
    verificadaAt: texto(fila.verificada_at),
    montoBruto: numero(fila.monto_bruto as Numerico),
    montoComision: numero(fila.monto_comision as Numerico),
    montoMedio: cero(fila.monto_medio),
    retenciones: parsearRetenciones(fila.retenciones_aplicadas),
    montoRetenciones: cero(fila.monto_retenciones),
    montoNeto: cero(fila.monto_neto),
  }
}

/**
 * Verificadas que aún no entran en una liquidación, de la verificada más
 * reciente a la más antigua.
 */
export function porLiquidar(
  filas: readonly FilaAsignacionRpc[]
): AsignacionPorLiquidar[] {
  return filas
    .filter(
      (fila) => fila.estado === "VERIFICADA" && !texto(fila.liquidacion_id)
    )
    .map((fila) => ({
      id: fila.id,
      oferta: texto(fila.oferta_titulo) ?? "Oferta",
      marca: texto(fila.marca),
      plataforma: fila.plataforma,
      formato: texto(fila.formato_nombre),
      verificadaAt: texto(fila.verificada_at),
      montoMedio: numero(fila.monto_medio as Numerico),
    }))
    .sort((a, b) => (b.verificadaAt ?? "").localeCompare(a.verificadaAt ?? ""))
}
