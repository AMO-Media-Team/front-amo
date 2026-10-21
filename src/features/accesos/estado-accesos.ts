/**
 * Estado del registro de accesos en la URL y su traducción a filtros de
 * PostgREST sobre `public.accesos` (compartido por la tabla y la exportación).
 */
import { createParser, parseAsArrayOf } from "nuqs/server"
import { z } from "zod"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import {
  condicionesBusqueda,
  type FiltroPostgrest,
  filtrosVentana,
  lista,
  patronBusqueda,
  type VentanaFiltro,
} from "@/features/auditoria/filtros-postgrest"

import {
  DISPOSITIVOS,
  EVENTOS,
  EVENTOS_ACCESO,
  MOTIVOS_SOSPECHA,
  type ResultadoAcceso,
} from "./catalogo"

/** Id del registro en la página: destino de los atajos de indicadores y alertas. */
export const ID_REGISTRO_ACCESOS = "registro-accesos"

const ISO2 = /^[A-Z]{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const parseAsPais = createParser<string>({
  parse: (valor) => {
    const codigo = valor.trim().toUpperCase()
    return ISO2.test(codigo) ? codigo : null
  },
  serialize: (valor) => valor,
})

export const RESULTADOS_FILTRO = ["EXITO", "FALLO", "BLOQUEO", "INFO"] as const
export const OPCIONES_SOSPECHA = ["SI"] as const

export const CAMPOS_ORDEN_ACCESOS = ["fecha", "evento", "pais"] as const

export const estadoTablaAccesos = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_ACCESOS,
  ordenPorDefecto: { campo: "fecha", descendente: true },
  filtros: {
    resultado: filtroDeOpciones(RESULTADOS_FILTRO),
    evento: filtroDeOpciones(EVENTOS_ACCESO),
    pais: parseAsArrayOf(parseAsPais, ",").withDefault([]),
    dispositivo: filtroDeOpciones(DISPOSITIVOS),
    sospechoso: filtroDeOpciones(OPCIONES_SOSPECHA),
    motivo: filtroDeOpciones(MOTIVOS_SOSPECHA),
  },
})

export type EstadoTablaAccesos = EstadoTabla<typeof estadoTablaAccesos>

export const esquemaFiltrosAccesos = z.object({
  q: z.string().max(100),
  resultado: z.array(z.enum(RESULTADOS_FILTRO)).max(RESULTADOS_FILTRO.length),
  evento: z.array(z.enum(EVENTOS_ACCESO)).max(EVENTOS_ACCESO.length),
  pais: z.array(z.string().regex(ISO2)).max(250),
  dispositivo: z.array(z.enum(DISPOSITIVOS)).max(DISPOSITIVOS.length),
  sospechoso: z.array(z.enum(OPCIONES_SOSPECHA)).max(1),
  motivo: z.array(z.enum(MOTIVOS_SOSPECHA)).max(MOTIVOS_SOSPECHA.length),
})

export type FiltrosAccesos = z.infer<typeof esquemaFiltrosAccesos>

export function filtrosDeEstado(estado: EstadoTablaAccesos): FiltrosAccesos {
  return {
    q: estado.q,
    resultado: [...estado.resultado],
    evento: [...estado.evento],
    pais: [...estado.pais],
    dispositivo: [...estado.dispositivo],
    sospechoso: [...estado.sospechoso],
    motivo: [...estado.motivo],
  }
}

/** Eventos que corresponden a los resultados elegidos. */
export function eventosDeResultados(
  resultados: readonly ResultadoAcceso[]
): string[] {
  return EVENTOS_ACCESO.filter((evento) =>
    resultados.includes(EVENTOS[evento].resultado)
  )
}

const COLUMNAS_BUSQUEDA = ["ciudad", "navegador", "sistema_operativo"]

/**
 * Filtros de PostgREST para `accesos`. La búsqueda cubre ciudad, navegador y
 * sistema, y a las personas cuyo nombre o correo coincide (`usuariosCoincidentes`,
 * resueltos antes en `perfiles` con la RLS de quien consulta).
 */
export function filtrosPostgrestAccesos(
  filtros: FiltrosAccesos,
  ventana: VentanaFiltro,
  usuariosCoincidentes: readonly string[] = []
): FiltroPostgrest[] {
  const resultado: FiltroPostgrest[] = [...filtrosVentana(ventana)]
  if (filtros.resultado.length > 0) {
    resultado.push({
      columna: "evento",
      operador: "in",
      valor: lista(eventosDeResultados(filtros.resultado)),
    })
  }
  if (filtros.evento.length > 0) {
    resultado.push({
      columna: "evento",
      operador: "in",
      valor: lista(filtros.evento),
    })
  }
  if (filtros.pais.length > 0) {
    resultado.push({
      columna: "pais_iso2",
      operador: "in",
      valor: lista(filtros.pais),
    })
  }
  if (filtros.dispositivo.length > 0) {
    resultado.push({
      columna: "dispositivo",
      operador: "in",
      valor: lista(filtros.dispositivo),
    })
  }
  if (filtros.sospechoso.includes("SI")) {
    resultado.push({ columna: "es_sospechoso", operador: "is", valor: "true" })
  }
  if (filtros.motivo.length > 0) {
    resultado.push({
      columna: "motivo_sospecha",
      operador: "in",
      valor: lista(filtros.motivo),
    })
  }
  const patron = patronBusqueda(filtros.q)
  if (patron) {
    const condiciones = condicionesBusqueda(COLUMNAS_BUSQUEDA, patron)
    const usuarios = usuariosCoincidentes.filter((id) => UUID.test(id))
    if (usuarios.length > 0)
      condiciones.push(`usuario_id.in.${lista(usuarios)}`)
    resultado.push({ o: condiciones.join(",") })
  }
  return resultado
}

/** Orden de la tabla → columnas de PostgREST. */
export function ordenAccesos(
  orden: EstadoTablaAccesos["orden"]
): { columna: "created_at" | "evento" | "pais_iso2"; ascendente: boolean }[] {
  const ascendente = !orden.descendente
  switch (orden.campo) {
    case "evento":
      return [
        { columna: "evento", ascendente },
        { columna: "created_at", ascendente: false },
      ]
    case "pais":
      return [
        { columna: "pais_iso2", ascendente },
        { columna: "created_at", ascendente: false },
      ]
    case "fecha":
      return [{ columna: "created_at", ascendente }]
  }
}
