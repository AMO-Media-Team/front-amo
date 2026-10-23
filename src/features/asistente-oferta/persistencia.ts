/**
 * Del formulario a la BD y de vuelta (módulo puro, cliente y servidor).
 *
 * - Valores iniciales de una oferta nueva (configuración y fechas de la
 *   campaña) o de las ya guardadas (continuar un borrador o editar).
 * - Filas de `ofertas` (una por formato) y la diferencia de `oferta_cupos`
 *   para guardar solo lo que cambió (la BD no deja reemplazar las claves de
 *   un cupo: se insertan, actualizan o borran filas).
 * - Lo que cambió de estado entre lo que conocía el asistente y lo que
 *   devolvió el servidor al guardar o enviar.
 */
import { numeroAEntrada } from "@/features/configuracion/numeros"
import type { Database } from "@/types/database.types"

import { instantesPorDefecto } from "./instantes"
import type {
  CupoFranjaEntrada,
  DatosOferta,
  FormatoElegidoEntrada,
  ValoresOferta,
} from "./schemas"
import type {
  CampanaAsistente,
  CatalogoAsistente,
  ConfiguracionAsistente,
  EstadoOferta,
  FranjaAsistente,
  MedioExcluido,
  OfertaEnCurso,
  OfertaGuardadaBd,
} from "./tipos"

/** Permanencia mínima que sugiere el asistente (la BD usa la misma). */
export const PERMANENCIA_POR_DEFECTO = 7

// ── Formatos elegidos ────────────────────────────────────────────────────────

export function cuposVacios(
  franjas: readonly Pick<FranjaAsistente, "id">[]
): CupoFranjaEntrada[] {
  return franjas.map((franja) => ({ franjaId: franja.id, cantidad: "" }))
}

/**
 * Mantiene una entrada de presupuesto y cupos por formato elegido, en el
 * orden de la elección: conserva lo escrito de los que siguen, agrega los
 * nuevos vacíos y quita los que se desmarcaron.
 */
export function sincronizarFormatos(
  actuales: readonly FormatoElegidoEntrada[],
  formatoIds: readonly string[],
  franjas: readonly Pick<FranjaAsistente, "id">[]
): FormatoElegidoEntrada[] {
  return formatoIds.map(
    (formatoId) =>
      actuales.find((formato) => formato.formatoId === formatoId) ?? {
        formatoId,
        presupuestoMaximo: "",
        cupos: cuposVacios(franjas),
      }
  )
}

// ── Valores iniciales ────────────────────────────────────────────────────────

/** Oferta nueva: lo que la plataforma sugiere (cortes, tope, permanencia y fechas). */
export function valoresNuevos({
  campana,
  configuracion,
  ahora,
}: {
  campana: Pick<CampanaAsistente, "fechaInicio" | "fechaFin">
  configuracion: ConfiguracionAsistente
  ahora: Date
}): ValoresOferta {
  const instantes = instantesPorDefecto({
    fechaInicio: campana.fechaInicio,
    fechaFin: campana.fechaFin,
    anticipacionHoras: configuracion.anticipacionHoras,
    ahora,
  })
  return {
    que: {
      formatoIds: [],
      titulo: "",
      publicacionesPorMedio: "1",
    },
    quien: {
      segmentacion: { departamentos: [], municipios: [] },
      categorias: [],
      seguidoresMinimos: "",
      mediosExcluidos: [],
    },
    cuando: {
      ...instantes,
      permanenciaDias: String(PERMANENCIA_POR_DEFECTO),
      cortes: [...configuracion.cortesPorDefecto],
      exclusividad: false,
      exclusividadDias: "",
    },
    cuanto: {
      formatos: [],
      topePorcentaje: numeroAEntrada(configuracion.topePorcentaje * 100),
    },
    envio: { instrucciones: "", restricciones: "" },
  }
}

/**
 * Valores de ofertas ya guardadas (un borrador por formato del mismo
 * asistente, o la oferta que se edita): lo común sale de la primera; el
 * presupuesto y los cupos, de cada una. Los medios excluidos llegan con su
 * nombre público (`medios_para_exclusion`).
 */
export function valoresDesdeOfertas({
  ofertas,
  catalogo,
  excluidos,
}: {
  ofertas: readonly OfertaGuardadaBd[]
  catalogo: CatalogoAsistente
  excluidos: readonly MedioExcluido[]
}): ValoresOferta | null {
  const [base] = ofertas
  if (!base) return null
  const formatoIds = ofertas.map((oferta) => oferta.formatoId)
  return {
    que: {
      formatoIds,
      titulo: base.titulo,
      publicacionesPorMedio: String(base.publicacionesPorMedio),
    },
    quien: {
      segmentacion: {
        departamentos: [...base.departamentos],
        municipios: [...base.municipios],
      },
      categorias: [...base.categorias],
      seguidoresMinimos: numeroAEntrada(base.seguidoresMinimos),
      // Se conservan en el orden guardado; un medio que ya no exista se omite.
      mediosExcluidos: base.mediosExcluidos
        .map((medioId) => excluidos.find((medio) => medio.id === medioId))
        .filter((medio) => medio !== undefined),
    },
    cuando: {
      ventanaInicio: base.ventanaInicio,
      ventanaFin: base.ventanaFin,
      fechaLimite: base.fechaLimite,
      permanenciaDias: String(base.permanenciaDias),
      cortes: [...base.cortes],
      exclusividad: base.exclusividadDias !== null,
      exclusividadDias:
        base.exclusividadDias === null ? "" : String(base.exclusividadDias),
    },
    cuanto: {
      formatos: ofertas.map((oferta) => ({
        formatoId: oferta.formatoId,
        presupuestoMaximo: numeroAEntrada(oferta.presupuestoMaximo),
        cupos: catalogo.franjas.map((franja) => {
          const cupo = oferta.cupos.find((c) => c.franjaId === franja.id)
          return {
            franjaId: franja.id,
            cantidad: cupo ? String(cupo.cantidad) : "",
          }
        }),
      })),
      topePorcentaje: numeroAEntrada(base.topePorcentaje * 100),
    },
    envio: {
      instrucciones: base.instrucciones ?? "",
      restricciones: base.restricciones ?? "",
    },
  }
}

// ── Filas de la BD ───────────────────────────────────────────────────────────

type InsercionOferta = Database["public"]["Tables"]["ofertas"]["Insert"]

/** Columnas que el asistente escribe en una oferta (las demás las deriva la BD). */
export type FilaOferta = Required<
  Pick<
    InsercionOferta,
    | "titulo"
    | "publicaciones_por_medio"
    | "presupuesto_maximo"
    | "tope_porcentaje_por_medio"
    | "departamentos_objetivo"
    | "municipios_objetivo"
    | "categorias_objetivo"
    | "seguidores_minimos"
    | "medios_excluidos"
    | "ventana_inicio"
    | "ventana_fin"
    | "fecha_limite_aceptacion"
    | "permanencia_minima_dias"
    | "exclusividad_dias"
    | "cortes_requeridos"
    | "instrucciones"
    | "restricciones"
  >
>

/** Fila de la oferta de un formato: lo común del asistente y su presupuesto. */
export function filaOferta(
  datos: DatosOferta,
  formato: DatosOferta["cuanto"]["formatos"][number]
): FilaOferta {
  return {
    titulo: datos.que.titulo,
    publicaciones_por_medio: datos.que.publicacionesPorMedio,
    presupuesto_maximo: formato.presupuestoMaximo,
    tope_porcentaje_por_medio: datos.cuanto.topePorcentaje,
    departamentos_objetivo: [...datos.quien.segmentacion.departamentos],
    municipios_objetivo: [...datos.quien.segmentacion.municipios],
    categorias_objetivo: datos.quien.categorias,
    seguidores_minimos: datos.quien.seguidoresMinimos,
    medios_excluidos: datos.quien.mediosExcluidos.map((medio) => medio.id),
    ventana_inicio: new Date(datos.cuando.ventanaInicio).toISOString(),
    ventana_fin: new Date(datos.cuando.ventanaFin).toISOString(),
    fecha_limite_aceptacion: new Date(datos.cuando.fechaLimite).toISOString(),
    permanencia_minima_dias: datos.cuando.permanenciaDias,
    exclusividad_dias: datos.cuando.exclusividadDias,
    cortes_requeridos: [...datos.cuando.cortes],
    instrucciones: datos.envio.instrucciones,
    restricciones: datos.envio.restricciones,
  }
}

export interface Cupo {
  franjaId: string
  cantidad: number
}

/** Cupos con cantidad (las franjas en 0 no llevan fila: la BD exige de 1 a 500). */
export function cuposConCantidad(cupos: readonly Cupo[]): Cupo[] {
  return cupos.filter((cupo) => cupo.cantidad > 0)
}

export interface DiferenciaCupos {
  insertar: Cupo[]
  actualizar: Cupo[]
  /** Franjas cuyo cupo se quita. */
  borrar: string[]
}

/** Lo que hay que escribir para pasar de los cupos guardados a los deseados. */
export function diferenciaCupos(
  guardados: readonly Cupo[],
  deseados: readonly Cupo[]
): DiferenciaCupos {
  const objetivo = cuposConCantidad(deseados)
  const previos = new Map(guardados.map((c) => [c.franjaId, c.cantidad]))
  const quedan = new Set(objetivo.map((c) => c.franjaId))
  return {
    insertar: objetivo.filter((cupo) => !previos.has(cupo.franjaId)),
    actualizar: objetivo.filter(
      (cupo) =>
        previos.has(cupo.franjaId) &&
        previos.get(cupo.franjaId) !== cupo.cantidad
    ),
    borrar: guardados
      .map((cupo) => cupo.franjaId)
      .filter((franjaId) => !quedan.has(franjaId)),
  }
}

export function sinCambiosCupos(diferencia: DiferenciaCupos): boolean {
  return (
    diferencia.insertar.length === 0 &&
    diferencia.actualizar.length === 0 &&
    diferencia.borrar.length === 0
  )
}

// ── Estado tras guardar o enviar ─────────────────────────────────────────────

const EDITABLES: ReadonlySet<EstadoOferta> = new Set(["BORRADOR", "DEVUELTA"])

export interface CambiosDeEstado {
  /** Quedaron en revisión con este envío (o con uno anterior sin respuesta). */
  enviadas: string[]
  /** Eran editables y otra persona las cambió: no se guardó nada en ellas. */
  cambiadas: OfertaEnCurso[]
}

/**
 * Compara las ofertas que conocía el asistente con las que devolvió el
 * servidor (que no toca las que ya no son editables). Una que era editable y
 * vuelve en otro estado sin que este envío la mandara la cambió alguien más
 * (la envió un compañero, se canceló o venció): lo escrito no se guardó en
 * ella. Una que el asistente no conocía y ya no es editable la envió un
 * intento anterior que se quedó sin respuesta (el servidor la adoptó).
 */
export function cambiosDeEstado(
  antes: readonly OfertaEnCurso[],
  despues: readonly OfertaEnCurso[],
  enviadasAhora: readonly string[] = []
): CambiosDeEstado {
  const previas = new Map(antes.map((oferta) => [oferta.ofertaId, oferta]))
  const enviadas = new Set(enviadasAhora)
  const cambiadas: OfertaEnCurso[] = []
  for (const oferta of despues) {
    if (EDITABLES.has(oferta.estado) || enviadas.has(oferta.ofertaId)) continue
    const previa = previas.get(oferta.ofertaId)
    if (!previa) {
      if (oferta.estado !== "CANCELADA") enviadas.add(oferta.ofertaId)
    } else if (EDITABLES.has(previa.estado)) {
      cambiadas.push(oferta)
    }
  }
  return {
    enviadas: despues
      .map((oferta) => oferta.ofertaId)
      .filter((ofertaId) => enviadas.has(ofertaId)),
    cambiadas,
  }
}
