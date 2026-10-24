/**
 * Vistas de `/finanzas/liquidaciones` (módulo puro): la vista y el estado de
 * cada tabla en la URL (mismos parsers en servidor y cliente), quién puede
 * hacer qué y la búsqueda, el orden y la página de «Por liquidar», que la RPC
 * entrega completa (un medio por fila). La ruta y los nombres de las vistas
 * son contrato (`rutas.ts`).
 */
import { createLoader, parseAsStringLiteral } from "nuqs/server"

import {
  definirEstadoTabla,
  desplazamiento,
  type EstadoTabla,
  filtroDeOpciones,
  type Orden,
  totalPaginas,
} from "@/components/data-table/estado-url"
import type { EstadoLiquidacion } from "@/features/operacion/estados"
import { normalizarBusqueda } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"

import {
  RUTA_LIQUIDACIONES,
  rutaVistaLiquidaciones,
  VISTAS_LIQUIDACIONES,
  type VistaLiquidaciones,
} from "./rutas"
import type { AlertaPendiente, FilaPendiente, SoportePago } from "./tipos"

export {
  RUTA_LIQUIDACIONES,
  rutaVistaLiquidaciones,
  VISTAS_LIQUIDACIONES,
  type VistaLiquidaciones,
}

export const SOPORTES_PAGO = ["DOCUMENTO_SOPORTE", "FACTURA"] as const
export const ALERTAS_PENDIENTE = ["DATOS_PAGO", "SEG_SOCIAL"] as const

/** Servidor: `await cargarVista(searchParams)`; sin `?vista=` (o con una que no existe), «Por liquidar». */
export const cargarVista = createLoader({
  vista: parseAsStringLiteral(VISTAS_LIQUIDACIONES).withDefault("pendientes"),
})

/** «Por liquidar»: orden, búsqueda por medio y filtros por soporte y avisos. */
export const estadoTablaPendientes = definirEstadoTabla({
  camposOrden: ["valor", "medio", "desde", "asignaciones"] as const,
  ordenPorDefecto: { campo: "valor", descendente: true },
  filtros: {
    soporte: filtroDeOpciones(SOPORTES_PAGO),
    alerta: filtroDeOpciones(ALERTAS_PENDIENTE),
  },
})

export type EstadoTablaPendientes = EstadoTabla<typeof estadoTablaPendientes>

/** Vistas por estado: orden por periodo, valor, generación o pago; filtro por soporte. */
export const estadoTablaLiquidaciones = definirEstadoTabla({
  camposOrden: ["periodo", "neto", "generada", "pago"] as const,
  ordenPorDefecto: { campo: "periodo", descendente: true },
  filtros: { soporte: filtroDeOpciones(SOPORTES_PAGO) },
})

export type EstadoTablaLiquidaciones = EstadoTabla<
  typeof estadoTablaLiquidaciones
>

export type CampoOrdenLiquidaciones = EstadoTablaLiquidaciones["orden"]["campo"]

/** Vistas que listan liquidaciones por su estado. */
export type VistaPorEstado = Exclude<VistaLiquidaciones, "pendientes">

export const ESTADO_DE_VISTA: Readonly<
  Record<VistaPorEstado, EstadoLiquidacion>
> = {
  borrador: "BORRADOR",
  aprobadas: "APROBADA",
  pagadas: "PAGADA",
  anuladas: "ANULADA",
}

/** Vista donde vive una liquidación según su estado (volver desde la ficha). */
export function vistaDeEstado(estado: EstadoLiquidacion): VistaPorEstado {
  switch (estado) {
    case "BORRADOR":
      return "borrador"
    case "APROBADA":
      return "aprobadas"
    case "PAGADA":
      return "pagadas"
    case "ANULADA":
      return "anuladas"
  }
}

export interface PresentacionVista {
  /** Pestaña y título de la sección. */
  titulo: string
  descripcion: string
  /** Título del estado vacío. */
  vacia: string
  ayudaVacia: string
}

export const VISTAS: Readonly<Record<VistaLiquidaciones, PresentacionVista>> = {
  pendientes: {
    titulo: "Por liquidar",
    descripcion:
      "Medios con asignaciones verificadas que aún no entran en una liquidación, el mayor valor primero.",
    vacia: "No hay nada por liquidar",
    ayudaVacia:
      "Cuando el equipo verifique asignaciones, sus medios aparecerán aquí para el próximo corte.",
  },
  borrador: {
    titulo: "Por aprobar",
    descripcion:
      "Liquidaciones generadas que esperan la aprobación de otra persona del equipo: quien genera no aprueba.",
    vacia: "No hay liquidaciones por aprobar",
    ayudaVacia:
      "Al generar un corte, sus liquidaciones quedan aquí en borrador para que otra persona las revise y apruebe.",
  },
  aprobadas: {
    titulo: "Aprobadas",
    descripcion:
      "Listas para pagar en cuanto tengan su documento soporte o la factura del medio.",
    vacia: "No hay liquidaciones aprobadas por pagar",
    ayudaVacia:
      "Las liquidaciones aprobadas esperan aquí su documento soporte o factura y el archivo de pagos.",
  },
  pagadas: {
    titulo: "Pagadas",
    descripcion:
      "Liquidaciones pagadas al medio, con la fecha y el soporte del pago.",
    vacia: "Aún no hay liquidaciones pagadas",
    ayudaVacia:
      "Cuando Finanzas registre el pago de una liquidación aprobada, aparecerá aquí.",
  },
  anuladas: {
    titulo: "Anuladas",
    descripcion:
      "Sus asignaciones volvieron a verificadas y entran en un corte nuevo.",
    vacia: "No hay liquidaciones anuladas",
    ayudaVacia:
      "Si se anula una liquidación (un error en el corte, un pago que no procede), quedará aquí como constancia.",
  },
}

/** Nombre accesible de una pestaña: «Por liquidar: 4 medios», «Anuladas: ninguna». */
export function etiquetaPestana(
  vista: VistaLiquidaciones,
  cantidad: number
): string {
  const { titulo } = VISTAS[vista]
  if (cantidad <= 0) return `${titulo}: ninguna`
  const cifra = formatearNumero(cantidad)
  return vista === "pendientes"
    ? `${titulo}: ${cifra} ${cantidad === 1 ? "medio" : "medios"}`
    : `${titulo}: ${cifra}`
}

// ── Quién puede hacer qué ────────────────────────────────────────────────────

export interface AccesoLiquidaciones {
  /** `liquidaciones.generar`: corte y «Liquidar». */
  generar: boolean
  /** `liquidaciones.aprobar`: aprobar y anular. */
  aprobar: boolean
  /** `liquidaciones.registrar_pago`: factura del medio y pago. */
  registrarPago: boolean
  /** `medios.ver`: enlace a la ficha del medio. */
  verMedios: boolean
  /** `asignaciones.ver`: enlace a la ficha de cada asignación. */
  verAsignaciones: boolean
  /** D17: un SUPERADMIN sí aprueba lo que generó. */
  superadmin: boolean
}

export function accesoLiquidaciones(usuario: {
  permisos: Iterable<string>
  rol: { clave: string }
}): AccesoLiquidaciones {
  const permisos = new Set(usuario.permisos)
  return {
    generar: permisos.has("liquidaciones.generar"),
    aprobar: permisos.has("liquidaciones.aprobar"),
    registrarPago: permisos.has("liquidaciones.registrar_pago"),
    verMedios: permisos.has("medios.ver"),
    verAsignaciones: permisos.has("asignaciones.ver"),
    superadmin: usuario.rol.clave === "SUPERADMIN",
  }
}

// ── «Por liquidar»: búsqueda, filtros, orden y página en el servidor ─────────

function soporteDeFila(fila: FilaPendiente): SoportePago {
  return fila.requiereDocumentoSoporte ? "DOCUMENTO_SOPORTE" : "FACTURA"
}

/** Avisos de un medio pendiente: cuenta sin certificar y seguridad social. */
export function alertasDe(fila: FilaPendiente): AlertaPendiente[] {
  return [
    ...(fila.datosPagoListos ? [] : (["DATOS_PAGO"] as const)),
    ...(fila.segSocialPendiente ? (["SEG_SOCIAL"] as const) : []),
  ]
}

export function filtrarPendientes(
  filas: readonly FilaPendiente[],
  estado: Pick<EstadoTablaPendientes, "q" | "soporte" | "alerta">
): FilaPendiente[] {
  const buscado = normalizarBusqueda(estado.q)
  const palabras = buscado ? buscado.split(/\s+/) : []
  return filas.filter((fila) => {
    if (palabras.length > 0) {
      const nombre = normalizarBusqueda(fila.medio)
      if (!palabras.every((palabra) => nombre.includes(palabra))) return false
    }
    if (
      estado.soporte.length > 0 &&
      !estado.soporte.includes(soporteDeFila(fila))
    ) {
      return false
    }
    if (estado.alerta.length > 0) {
      const alertas = alertasDe(fila)
      if (!estado.alerta.some((alerta) => alertas.includes(alerta)))
        return false
    }
    return true
  })
}

type CampoOrdenPendientes = EstadoTablaPendientes["orden"]["campo"]

const comparadorNombre = new Intl.Collator("es-CO", { sensitivity: "base" })

function comparar(
  a: FilaPendiente,
  b: FilaPendiente,
  campo: CampoOrdenPendientes
): number {
  switch (campo) {
    case "valor":
      return a.montoMedio - b.montoMedio
    case "asignaciones":
      return a.asignaciones - b.asignaciones
    case "desde":
      return Date.parse(a.primeraVerificada) - Date.parse(b.primeraVerificada)
    case "medio":
      return comparadorNombre.compare(a.medio, b.medio)
  }
}

/** Orden estable: ante un empate, el nombre del medio y su id. */
export function ordenarPendientes(
  filas: readonly FilaPendiente[],
  { campo, descendente }: Orden<CampoOrdenPendientes>
): FilaPendiente[] {
  return [...filas].sort((a, b) => {
    const principal = comparar(a, b, campo) * (descendente ? -1 : 1)
    if (principal !== 0) return principal
    return (
      comparadorNombre.compare(a.medio, b.medio) ||
      a.medioId.localeCompare(b.medioId)
    )
  })
}

export interface Pagina<T> {
  filas: T[]
  total: number
}

/** Página pedida (o la última, si la URL pide una que ya no existe). */
export function paginar<T>(
  filas: readonly T[],
  pagina: number,
  tamano: number
): Pagina<T> {
  const total = filas.length
  const real = Math.min(Math.max(1, pagina), totalPaginas(total, tamano))
  const desde = desplazamiento(real, tamano)
  return { filas: filas.slice(desde, desde + tamano), total }
}

/** Lo que muestra la tabla «Por liquidar» con el estado de la URL. */
export function vistaPendientes(
  filas: readonly FilaPendiente[],
  estado: EstadoTablaPendientes
): Pagina<FilaPendiente> {
  return paginar(
    ordenarPendientes(filtrarPendientes(filas, estado), estado.orden),
    estado.pagina,
    estado.tamano
  )
}

/** Id del encabezado de la vista activa (destino del foco tras aprobar o liquidar). */
export const ID_TITULO_VISTA = "titulo-vista-liquidaciones"
