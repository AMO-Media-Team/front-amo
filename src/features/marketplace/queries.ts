import "server-only"

/**
 * Lecturas del marketplace del medio (MED-008, MED-009). Todo va con el
 * cliente del USUARIO: las funciones de la BD (`marketplace_medio`,
 * `marketplace_facetas`, `ofertas_para_medio`, `cotizar_oferta`,
 * `impedimentos_aceptar`, `mis_asignaciones_medio`) toman el medio de la
 * sesión y solo devuelven lo que ese medio puede ver. Un error de lectura se
 * lanza y lo recoge el límite de error de la sección; las opciones de los
 * filtros, el tope y los impedimentos para aceptar son la excepción: sin
 * ellos la página se muestra igual.
 */
import { cache } from "react"

import {
  consumoTope,
  medioPropio,
  nivelesVerificacion,
} from "@/features/mi-medio/queries"
import type { EstadoAsignacion } from "@/features/operacion/estados"
import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import { interpretarErrorBd } from "@/lib/errores-bd"
import { argumentosRpc } from "@/lib/supabase/rpc"

import {
  desplazamientoDe,
  diasPublicacion,
  type FiltrosMarketplace,
  paginaValida,
  plataformaDeUrl,
  TAMANO_PAGINA_MARKETPLACE,
} from "./filtros"
import {
  asignacionDeFila,
  baseDeFicha,
  conAnuncianteElegido,
  conSectorElegido,
  cotizacionDeFila,
  cuentasConImpedimentos,
  cuentasDeFicha,
  elegibilidadDeFila,
  facetasDeFilas,
  type FilaAsignacionMedio,
  type FilaCotizacion,
  type FilaFaceta,
  type FilaMarketplace,
  type FilaOfertaParaMedio,
  impedimentosDeFilas,
  type ImpedimentosAceptar,
  ofertaDeFila,
} from "./mapeo"
import type { ConsumoTopeMedio } from "./presentacion"
import type {
  AsignacionEnOferta,
  CuentaCotizada,
  DetalleOfertaMedio,
  Elegibilidad,
  FacetasMarketplace,
  PaginaMarketplace,
} from "./tipos"

/** Por qué el medio no ve ofertas, u `OK` (MED-008 c2). */
export const elegibilidadMarketplace = cache(
  async (): Promise<Elegibilidad> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("mi_elegibilidad_marketplace")
    if (error) fallar("revisar si puedes ver ofertas", error)
    return elegibilidadDeFila(data[0])
  }
)

/**
 * Una página del marketplace con los filtros de la URL (plataforma, sector y
 * anunciante, días de publicación, rechazadas y orden). `total` viene en cada
 * fila (`count(*) over ()`): una página más allá de la última llega vacía y
 * sin total.
 */
export async function paginaMarketplace(
  filtros: FiltrosMarketplace
): Promise<PaginaMarketplace> {
  const pagina = paginaValida(filtros.pagina)
  const supabase = await clienteSolicitud()
  const dias = diasPublicacion(filtros)
  const { data, error } = await supabase.rpc(
    "marketplace_medio",
    argumentosRpc<"marketplace_medio">({
      p_plataforma: plataformaDeUrl(filtros.plataforma),
      p_sector: filtros.sector,
      p_anunciante: filtros.anunciante,
      p_publica_desde: dias.desde,
      p_publica_hasta: dias.hasta,
      p_incluir_rechazadas: filtros.rechazadas,
      p_orden: filtros.orden,
      p_limite: TAMANO_PAGINA_MARKETPLACE,
      p_desplazamiento: desplazamientoDe(pagina),
    })
  )
  if (error) fallar("leer las ofertas", error)
  const filas = data as FilaMarketplace[]
  return {
    filas: filas.map(ofertaDeFila),
    total: Number(filas[0]?.total ?? 0),
    pagina,
  }
}

/** Nombre del sector de la URL (catálogo; RLS: los activos). */
async function sectorElegido(
  sector: string | null
): Promise<{ id: string; nombre: string } | null> {
  if (!sector) return null
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("sectores")
    .select("id, nombre")
    .eq("id", sector)
    .maybeSingle()
  if (error) throw error
  return data
}

/** `marketplace_facetas` de una plataforma (o de todas). */
async function leerFacetas(
  plataforma: FiltrosMarketplace["plataforma"]
): Promise<FacetasMarketplace> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc(
    "marketplace_facetas",
    argumentosRpc<"marketplace_facetas">({
      p_plataforma: plataformaDeUrl(plataforma),
    })
  )
  if (error) throw error
  return facetasDeFilas(data as FilaFaceta[])
}

/**
 * Opciones de los filtros por sector y anunciante (MED-008): los que tienen
 * ofertas que el medio puede aceptar hoy en la plataforma elegida. El sector
 * y el anunciante de la URL siempre están entre ellas aunque en esta
 * plataforma ya no tengan ofertas (el sector con su nombre del catálogo; el
 * anunciante, con el de las facetas de todas las plataformas): así el filtro
 * dice qué filtra. `null` si no se pudieron leer: el listado se muestra
 * igual, sin esos dos filtros.
 */
export async function facetasMarketplace(
  filtros: Pick<FiltrosMarketplace, "plataforma" | "sector" | "anunciante">
): Promise<FacetasMarketplace | null> {
  try {
    const [facetas, sector, todas] = await Promise.all([
      leerFacetas(filtros.plataforma),
      sectorElegido(filtros.sector),
      filtros.anunciante && filtros.plataforma ? leerFacetas(null) : null,
    ])
    return conAnuncianteElegido(
      conSectorElegido(facetas, sector),
      filtros.anunciante,
      todas?.anunciantes ?? []
    )
  } catch (error) {
    const codigo =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : error instanceof Error
          ? error.name
          : "desconocido"
    console.error(`[marketplace] opciones de los filtros fallaron (${codigo})`)
    return null
  }
}

/** Estados en los que una asignación sigue en pie (la reserva los cuenta). */
const EN_PIE: EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
  "EN_DISPUTA",
]

/** Las asignaciones en pie del medio en esta oferta, la más reciente primero. */
async function asignacionesEnOferta(
  ofertaId: string
): Promise<AsignacionEnOferta[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("mis_asignaciones_medio", {
    p_estados: EN_PIE,
    p_limite: 200,
  })
  if (error) fallar("leer tus campañas en esta oferta", error)
  return (data as FilaAsignacionMedio[])
    .filter((fila) => fila.oferta_id === ofertaId)
    .map(asignacionDeFila)
    .sort((a, b) => (b.aceptadaAt ?? "").localeCompare(a.aceptadaAt ?? ""))
}

const AVISO_SIN_COTIZACION =
  "No pudimos calcular tu pago con esta cuenta. Actualiza la página en unos minutos."

/** Lo que recibiría con cada cuenta; si una no se puede cotizar, el porqué. */
async function cotizarCuentas(
  ofertaId: string,
  cuentas: Omit<CuentaCotizada, "cotizacion" | "aviso" | "superaTopeCampana">[]
): Promise<Omit<CuentaCotizada, "superaTopeCampana">[]> {
  const supabase = await clienteSolicitud()
  return Promise.all(
    cuentas.map(async (cuenta) => {
      const { data, error } = await supabase.rpc("cotizar_oferta", {
        p_oferta_id: ofertaId,
        p_cuenta_social_id: cuenta.cuentaSocialId,
      })
      const fila = (data as FilaCotizacion[] | null)?.[0]
      if (error || !fila) {
        const interpretado = error ? interpretarErrorBd(error) : null
        if (!interpretado?.esperado) {
          console.error(
            `[marketplace] cotizar_oferta falló (${error?.code ?? "sin fila"})`
          )
        }
        return {
          ...cuenta,
          cotizacion: null,
          aviso: interpretado?.esperado
            ? interpretado.mensaje
            : AVISO_SIN_COTIZACION,
        }
      }
      return { ...cuenta, cotizacion: cotizacionDeFila(fila), aviso: null }
    })
  )
}

/**
 * Lo que impediría aceptar la oferta con cada cuenta, con las mismas reglas
 * que la reserva: exclusividad por sector y participación máxima del medio
 * en la campaña. `null` si no se pudo leer: la ficha se muestra igual y la
 * reserva vuelve a comprobarlo.
 */
async function impedimentosAceptar(
  ofertaId: string
): Promise<ImpedimentosAceptar | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("impedimentos_aceptar", {
    p_oferta_id: ofertaId,
  })
  if (error) {
    console.error(`[marketplace] impedimentos_aceptar falló (${error.code})`)
    return null
  }
  return impedimentosDeFilas(data)
}

/**
 * Detalle de una oferta para el medio (MED-009): la oferta, el pago con cada
 * una de sus cuentas que caben en ella, lo que le impediría aceptarla y sus
 * asignaciones en pie. `null` si no existe o el medio ya no puede verla (no
 * le está dirigida, venció sin que la aceptara o la archivaron).
 */
export const detalleOfertaMedio = cache(
  async (ofertaId: string): Promise<DetalleOfertaMedio | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("ofertas_para_medio", {
      p_oferta_id: ofertaId,
    })
    if (error) fallar("leer la oferta", error)
    const fila = (data as FilaOfertaParaMedio[])[0]
    if (!fila) return null

    const [formato, cotizadas, asignaciones, impedimentos] = await Promise.all([
      supabase
        .from("formatos")
        .select("nombre")
        .eq("id", fila.formato_id)
        .maybeSingle(),
      cotizarCuentas(ofertaId, cuentasDeFicha(fila.cupos_restantes_mi_franja)),
      asignacionesEnOferta(ofertaId),
      impedimentosAceptar(ofertaId),
    ])
    if (formato.error) fallar("leer el formato de la oferta", formato.error)

    return {
      ...baseDeFicha(fila, formato.data?.nombre ?? "Publicación"),
      estado: fila.estado,
      instrucciones: fila.instrucciones?.trim() || null,
      restricciones: fila.restricciones?.trim() || null,
      cuentas: cuentasConImpedimentos(cotizadas, impedimentos),
      asignaciones,
      chocaExclusividad: impedimentos?.exclusividad ?? false,
    }
  }
)

/**
 * Tope anual del nivel del medio y lo que ya consumió este año (MED-007),
 * para avisar antes de aceptar. `null` si no se pudo leer: la ficha se
 * muestra igual y la reserva vuelve a comprobarlo.
 */
export const consumoTopeMedio = cache(
  async (medioId: string): Promise<ConsumoTopeMedio | null> => {
    try {
      const [medio, niveles, consumo] = await Promise.all([
        medioPropio(medioId),
        nivelesVerificacion(),
        consumoTope(),
      ])
      if (!medio || !consumo) return null
      const nivel = niveles.find((fila) => fila.nivel === medio.nivel)
      return {
        consumido: consumo.consumido,
        tope: nivel?.topeAnual ?? consumo.tope,
        alerta: nivel?.porcentajeAlerta ?? 0.8,
        bloqueo: nivel?.porcentajeBloqueo ?? 0.95,
      }
    } catch (error) {
      console.error(
        `[marketplace] consumo del tope falló (${error instanceof Error ? error.name : "desconocido"})`
      )
      return null
    }
  }
)
