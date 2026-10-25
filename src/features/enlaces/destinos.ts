/**
 * Destino de un enlace de notificación según quién lo abre (módulo puro).
 *
 * La BD guarda las notificaciones con `entidad` y `entidad_id` y sin `url`: la
 * misma asignación se ve en `/operacion/asignaciones/…` para el equipo AMO y
 * en el portal propio para el medio o el anunciante. `/ir/[entidad]/[id]`
 * resuelve aquí la ruta; la página de destino vuelve a autorizar.
 *
 * Cada fase que agrega pantallas actualiza este mapa: mientras una pantalla no
 * existe, el destino es la más cercana que sí existe (nunca un 404).
 */
import type { Route } from "next"

import type { TipoRol } from "@/lib/auth/tipos"

export const ENTIDADES_ENLACE = [
  "accesos",
  "perfiles",
  "medios",
  "anunciantes",
  "documentos_medio",
  "documentos_anunciante",
  "cuentas_sociales",
  "verificaciones_cuenta",
  "solicitudes_vinculacion",
  "campanas",
  "ofertas",
  "asignaciones",
  "publicaciones",
  "metricas",
  "disputas",
  "liquidaciones",
  "facturas",
  "solicitudes_titular",
] as const

export type EntidadEnlace = (typeof ENTIDADES_ENLACE)[number]

export function esEntidadEnlace(valor: string): valor is EntidadEnlace {
  return (ENTIDADES_ENLACE as readonly string[]).includes(valor)
}

/** Ids de las filas relacionadas que algunos destinos necesitan (leídas con RLS). */
export interface Relacionados {
  medioId?: string | null
  anuncianteId?: string | null
  campanaId?: string | null
  asignacionId?: string | null
}

/** Qué fila hay que leer para conocer los relacionados de cada entidad. */
export const ENTIDADES_CON_RELACIONADOS: readonly EntidadEnlace[] = [
  "documentos_medio",
  "documentos_anunciante",
  "cuentas_sociales",
  "verificaciones_cuenta",
  "ofertas",
  "asignaciones",
  "publicaciones",
  "metricas",
  "disputas",
  "liquidaciones",
  "facturas",
]

export interface QuienAbre {
  tipoRol: TipoRol
  permisos: readonly string[]
}

const r = (valor: `/${string}`): Route => valor as Route

const SEGURIDAD = r("/cuenta/seguridad")
const INICIO = r("/inicio")

function destinoInterno(
  entidad: EntidadEnlace,
  id: string,
  relacionados: Relacionados,
  permisos: readonly string[]
): Route | null {
  const verifica = permisos.includes("medios.verificar")
  const verificaAnunciantes = permisos.includes("anunciantes.verificar")
  const medio = relacionados.medioId
  const asignacion = entidad === "asignaciones" ? id : relacionados.asignacionId
  switch (entidad) {
    case "accesos":
    case "perfiles":
      return SEGURIDAD
    case "medios":
      // Los avisos de cola del medio abren su expediente a quien verifica.
      return verifica
        ? r(`/operacion/medios/${id}?pestana=verificacion`)
        : r(`/operacion/medios/${id}`)
    case "anunciantes":
      // Los avisos de cola del anunciante abren su expediente a quien verifica.
      return verificaAnunciantes
        ? r(`/operacion/anunciantes/${id}?pestana=verificacion`)
        : r(`/operacion/anunciantes/${id}`)
    case "solicitudes_vinculacion":
      return r("/operacion/verificacion?cola=solicitudes")
    case "documentos_medio":
      if (verifica) return r("/operacion/verificacion?cola=documentos")
      return medio ? r(`/operacion/medios/${medio}?pestana=documentos`) : null
    case "cuentas_sociales":
    case "verificaciones_cuenta":
      if (verifica) return r("/operacion/verificacion?cola=cuentas")
      return medio ? r(`/operacion/medios/${medio}?pestana=cuentas`) : null
    case "documentos_anunciante":
      if (!relacionados.anuncianteId) return null
      return r(
        `/operacion/anunciantes/${relacionados.anuncianteId}?pestana=${verificaAnunciantes ? "verificacion" : "documentos"}`
      )
    case "campanas":
      return r(`/operacion/campanas/${id}`)
    case "ofertas":
      // Ficha completa (moderación, creativos e historial) para quien ve ofertas.
      if (permisos.includes("ofertas.ver")) return r(`/operacion/ofertas/${id}`)
      return relacionados.campanaId
        ? r(`/operacion/campanas/${relacionados.campanaId}`)
        : null
    case "asignaciones":
    case "publicaciones":
    case "metricas":
      return asignacion ? r(`/operacion/asignaciones/${asignacion}`) : null
    case "disputas":
      // La bandeja de disputas para quien la ve; si no, la ficha de la asignación.
      if (permisos.includes("disputas.ver"))
        return r(`/operacion/disputas/${id}`)
      return asignacion ? r(`/operacion/asignaciones/${asignacion}`) : null
    case "liquidaciones":
      // La ficha de Finanzas para quien ve liquidaciones; si no, el medio.
      if (permisos.includes("liquidaciones.ver"))
        return r(`/finanzas/liquidaciones/${id}`)
      return medio ? r(`/operacion/medios/${medio}`) : null
    case "facturas":
      if (permisos.includes("facturas.ver"))
        return r(`/finanzas/facturas/${id}`)
      return relacionados.anuncianteId
        ? r(
            `/operacion/anunciantes/${relacionados.anuncianteId}?pestana=cartera`
          )
        : null
    case "solicitudes_titular":
      // La bandeja de privacidad para quien atiende; si no, la solicitud propia del titular.
      return permisos.includes("privacidad.gestionar")
        ? r(`/administracion/privacidad/${id}`)
        : r(`/cuenta/privacidad?solicitud=${id}`)
  }
}

function destinoMedio(
  entidad: EntidadEnlace,
  id: string,
  relacionados: Relacionados
): Route {
  switch (entidad) {
    case "accesos":
    case "perfiles":
      return SEGURIDAD
    case "medios":
      return r("/mi-medio")
    case "documentos_medio":
      return r("/mi-medio/documentos")
    case "cuentas_sociales":
    case "verificaciones_cuenta":
      return r("/mi-medio/cuentas")
    case "ofertas":
      // El detalle del marketplace lleva a «Mis campañas» si ya la tomó.
      return r(`/ofertas/${id}`)
    case "asignaciones":
      return r(`/mis-campanas/${id}`)
    case "publicaciones":
    case "metricas":
      return relacionados.asignacionId
        ? r(`/mis-campanas/${relacionados.asignacionId}`)
        : r("/mis-campanas")
    case "disputas":
      return relacionados.asignacionId
        ? r(`/mis-campanas/${relacionados.asignacionId}/disputa`)
        : r("/mis-campanas")
    case "liquidaciones":
      // El medio no lee la tabla (la RLS lo impide); la página lo hace por RPC.
      return r(`/ganancias/${id}`)
    case "solicitudes_titular":
      return r(`/cuenta/privacidad?solicitud=${id}`)
    default:
      return INICIO
  }
}

function destinoAnunciante(
  entidad: EntidadEnlace,
  id: string,
  relacionados: Relacionados
): Route {
  switch (entidad) {
    case "accesos":
    case "perfiles":
      return SEGURIDAD
    case "anunciantes":
      return r("/empresa")
    case "documentos_anunciante":
      return r("/empresa/documentos")
    case "campanas":
      return r(`/campanas/${id}`)
    case "ofertas":
      return relacionados.campanaId
        ? r(`/campanas/${relacionados.campanaId}/ofertas/${id}`)
        : r("/campanas")
    case "asignaciones":
    case "publicaciones":
    case "metricas": {
      const asignacion =
        entidad === "asignaciones" ? id : relacionados.asignacionId
      return relacionados.campanaId && asignacion
        ? r(
            `/campanas/${relacionados.campanaId}?pestana=seguimiento&asignacion=${asignacion}`
          )
        : r("/campanas")
    }
    case "disputas":
      return relacionados.campanaId && relacionados.asignacionId
        ? r(
            `/campanas/${relacionados.campanaId}/asignaciones/${relacionados.asignacionId}/disputa`
          )
        : r("/campanas")
    case "facturas":
      return r(`/facturas/${id}`)
    case "solicitudes_titular":
      return r(`/cuenta/privacidad?solicitud=${id}`)
    default:
      return INICIO
  }
}

/** Ruta interna del destino; `null` si faltan los relacionados (la fila no es visible). */
export function destinoDe(
  entidad: EntidadEnlace,
  id: string,
  quien: QuienAbre,
  relacionados: Relacionados = {}
): Route | null {
  switch (quien.tipoRol) {
    case "ADMIN":
      return destinoInterno(entidad, id, relacionados, quien.permisos)
    case "MEDIO":
      return destinoMedio(entidad, id, relacionados)
    case "ANUNCIANTE":
      return destinoAnunciante(entidad, id, relacionados)
  }
}

/**
 * Avisos de lote sin fila propia (`cola.liquidaciones_por_aprobar`: el corte por periodo generó varias
 * liquidaciones): llevan a la vista que los resuelve. Solo los reciben quienes pueden aprobar.
 */
const ENLACES_SIN_FILA: Partial<Record<EntidadEnlace, Route>> = {
  liquidaciones: r("/finanzas/liquidaciones?vista=borrador"),
}

/** Enlace a guardar en la interfaz para una notificación sin `url`. */
export function enlaceNotificacion(
  entidad: string | null,
  entidadId: string | null
): Route | null {
  if (entidad && !entidadId && esEntidadEnlace(entidad)) {
    return ENLACES_SIN_FILA[entidad] ?? null
  }
  if (!entidad || !entidadId || !esEntidadEnlace(entidad)) return null
  return r(`/ir/${entidad}/${encodeURIComponent(entidadId)}`)
}
