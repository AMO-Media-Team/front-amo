/**
 * Filas de las RPC del marketplace → DTO de la interfaz (módulo puro, lo usan
 * las consultas y sus pruebas). Las funciones `returns table` generan tipos
 * con todas las columnas no nulas: aquí se declaran las que sí pueden venir
 * vacías y se valida el `jsonb` de las cuentas, que llega sin tipo.
 */
import { z } from "zod"

import { CORTES, type Corte } from "@/features/operacion/estados"
import type { Database } from "@/types/database.types"

import type {
  AsignacionEnOferta,
  Cotizacion,
  CuentaCotizada,
  CuentaEnOferta,
  Elegibilidad,
  FacetasMarketplace,
  MotivoElegibilidad,
  OfertaBaseMedio,
  OfertaMarketplace,
  OpcionFaceta,
} from "./tipos"
import { MOTIVOS_ELEGIBILIDAD } from "./tipos"

type Funciones = Database["public"]["Functions"]

/** Las columnas indicadas pueden llegar `null` aunque el tipo generado diga lo contrario. */
type ConNulos<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null }

export type FilaMarketplace = ConNulos<
  Funciones["marketplace_medio"]["Returns"][number],
  | "exclusividad_dias"
  | "pago_maximo"
  | "sector_id"
  | "categorias_objetivo"
  | "cortes_requeridos"
  | "marca"
  | "cuentas"
>

export type FilaOfertaParaMedio = ConNulos<
  Funciones["ofertas_para_medio"]["Returns"][number],
  | "exclusividad_dias"
  | "instrucciones"
  | "restricciones"
  | "sector_id"
  | "cortes_requeridos"
  | "marca"
  | "cupos_restantes_mi_franja"
>

export type FilaCotizacion = ConNulos<
  Funciones["cotizar_oferta"]["Returns"][number],
  | "tarifa_base"
  | "tarifa_id"
  | "monto_bruto"
  | "porcentaje_comision"
  | "monto_comision"
  | "comision_origen"
  | "comision_excepcion_id"
>

export type FilaFaceta = Funciones["marketplace_facetas"]["Returns"][number]

export type FilaImpedimento =
  Funciones["impedimentos_aceptar"]["Returns"][number]

export type FilaAsignacionMedio = ConNulos<
  Funciones["mis_asignaciones_medio"]["Returns"][number],
  "handle" | "aceptada_at" | "monto_medio"
>

const numero = z.coerce.number().refine(Number.isFinite)

const esquemaCuentaMarketplace = z.object({
  cuenta_social_id: z.string(),
  handle: z.string(),
  franja_clave: z.string(),
  cupos_restantes: numero,
  monto_medio: numero.nullable().catch(null),
})

const esquemaCuentaFicha = esquemaCuentaMarketplace.omit({ monto_medio: true })

/** Cuentas del medio en la tarjeta (`marketplace_medio.cuentas`). */
export function cuentasDeMarketplace(json: unknown): CuentaEnOferta[] {
  const lectura = z.array(esquemaCuentaMarketplace).safeParse(json ?? [])
  if (!lectura.success) return []
  return lectura.data.map((cuenta) => ({
    cuentaSocialId: cuenta.cuenta_social_id,
    handle: cuenta.handle,
    franjaClave: cuenta.franja_clave,
    cuposRestantes: Math.max(0, Math.trunc(cuenta.cupos_restantes)),
    montoMedio: cuenta.monto_medio,
  }))
}

/** Cuentas del medio en la ficha (`ofertas_para_medio.cupos_restantes_mi_franja`). */
export function cuentasDeFicha(
  json: unknown
): Omit<CuentaCotizada, "cotizacion" | "aviso" | "superaTopeCampana">[] {
  const lectura = z.array(esquemaCuentaFicha).safeParse(json ?? [])
  if (!lectura.success) return []
  return lectura.data.map((cuenta) => ({
    cuentaSocialId: cuenta.cuenta_social_id,
    handle: cuenta.handle,
    franjaClave: cuenta.franja_clave,
    cuposRestantes: Math.max(0, Math.trunc(cuenta.cupos_restantes)),
  }))
}

/** Cortes conocidos, sin repetir y en su orden (24 h, 72 h, 7 d, personalizado). */
export function cortesDe(cortes: readonly string[] | null): Corte[] {
  const conocidos = (cortes ?? []).filter(
    (corte): corte is Corte => corte in CORTES
  )
  return [...new Set(conocidos)].sort(
    (a, b) => CORTES[a].orden - CORTES[b].orden
  )
}

function enteroOpcional(valor: number | null): number | null {
  return valor === null || !Number.isFinite(Number(valor))
    ? null
    : Math.trunc(Number(valor))
}

function base(
  fila: Pick<
    FilaMarketplace,
    | "id"
    | "titulo"
    | "plataforma"
    | "publicaciones_por_medio"
    | "permite_multiples_cupos"
    | "ventana_inicio"
    | "ventana_fin"
    | "fecha_limite_aceptacion"
    | "permanencia_minima_dias"
    | "exclusividad_dias"
    | "cortes_requeridos"
    | "marca"
    | "anunciante_nombre"
  >,
  formato: string
): OfertaBaseMedio {
  const exclusividad = enteroOpcional(fila.exclusividad_dias)
  return {
    id: fila.id,
    titulo: fila.titulo,
    formato,
    plataforma: fila.plataforma,
    publicacionesPorMedio: Math.max(1, Number(fila.publicaciones_por_medio)),
    permiteMultiplesCupos: fila.permite_multiples_cupos,
    ventanaInicio: fila.ventana_inicio,
    ventanaFin: fila.ventana_fin,
    fechaLimiteAceptacion: fila.fecha_limite_aceptacion,
    permanenciaDias: Number(fila.permanencia_minima_dias),
    exclusividadDias: exclusividad && exclusividad > 0 ? exclusividad : null,
    cortes: cortesDe(fila.cortes_requeridos),
    marca: fila.marca?.trim() || fila.titulo,
    anunciante: fila.anunciante_nombre,
  }
}

/** Una tarjeta del marketplace. */
export function ofertaDeFila(fila: FilaMarketplace): OfertaMarketplace {
  const cuentas = cuentasDeMarketplace(fila.cuentas)
  const pago = fila.pago_maximo === null ? null : Number(fila.pago_maximo)
  return {
    ...base(fila, fila.formato_nombre),
    anuncianteId: fila.anunciante_id,
    rechazada: fila.rechazada_por_mi,
    vista: fila.vista,
    pagoMaximo: pago !== null && Number.isFinite(pago) ? pago : null,
    cuentas,
  }
}

const porNombre = (a: OpcionFaceta, b: OpcionFaceta) =>
  a.nombre.localeCompare(b.nombre, "es-CO")

/** Agrega la opción si aún no está (por id), manteniendo el orden por nombre. */
function conOpcion(
  opciones: readonly OpcionFaceta[],
  opcion: OpcionFaceta
): OpcionFaceta[] {
  if (opciones.some(({ id }) => id === opcion.id)) return [...opciones]
  return [...opciones, opcion].sort(porNombre)
}

/**
 * Opciones de los filtros por sector y anunciante (`marketplace_facetas`),
 * cada grupo por nombre. Un tipo desconocido o una fila sin nombre se omite.
 */
export function facetasDeFilas(
  filas: readonly FilaFaceta[]
): FacetasMarketplace {
  const opcion = (fila: FilaFaceta): OpcionFaceta => ({
    id: fila.id,
    nombre: fila.nombre.trim(),
  })
  const validas = filas.filter((fila) => fila.id && fila.nombre?.trim())
  return {
    sectores: validas
      .filter((fila) => fila.tipo === "SECTOR")
      .map(opcion)
      .sort(porNombre),
    anunciantes: validas
      .filter((fila) => fila.tipo === "ANUNCIANTE")
      .map(opcion)
      .sort(porNombre),
  }
}

/**
 * El sector de la URL siempre entre las opciones (con su nombre del
 * catálogo), aunque en esta plataforma ya no tenga ofertas: así el filtro
 * dice qué filtra y se puede quitar.
 */
export function conSectorElegido(
  facetas: FacetasMarketplace,
  sector: OpcionFaceta | null
): FacetasMarketplace {
  const nombre = sector?.nombre.trim()
  if (!sector || !nombre) return facetas
  return {
    ...facetas,
    sectores: conOpcion(facetas.sectores, { id: sector.id, nombre }),
  }
}

/**
 * El anunciante de la URL siempre entre las opciones: si no está (en esta
 * plataforma ya no tiene ofertas, o solo le quedan las que el medio rechazó,
 * que las facetas no cuentan), se agrega con su nombre tomado de `conocidos`
 * (las facetas de todas las plataformas o las ofertas de la página). Así el
 * filtro dice qué filtra.
 */
export function conAnuncianteElegido(
  facetas: FacetasMarketplace,
  anunciante: string | null,
  conocidos: readonly OpcionFaceta[]
): FacetasMarketplace {
  if (!anunciante) return facetas
  const nombre = conocidos.find(({ id }) => id === anunciante)?.nombre.trim()
  if (!nombre) return facetas
  return {
    ...facetas,
    anunciantes: conOpcion(facetas.anunciantes, { id: anunciante, nombre }),
  }
}

/** Anunciantes de las ofertas de una página, como opciones de su filtro. */
export function anunciantesDeOfertas(
  ofertas: readonly Pick<OfertaMarketplace, "anuncianteId" | "anunciante">[]
): OpcionFaceta[] {
  return ofertas.map((oferta) => ({
    id: oferta.anuncianteId,
    nombre: oferta.anunciante,
  }))
}

/** Datos comunes de la ficha (`ofertas_para_medio`) con el nombre del formato. */
export function baseDeFicha(
  fila: FilaOfertaParaMedio,
  formato: string
): OfertaBaseMedio {
  return base(fila, formato)
}

function numeroOpcional(valor: number | null): number | null {
  if (valor === null) return null
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

/**
 * Lo que recibiría el medio con una cuenta. El desglose (tarifa, bruto y
 * comisión) solo llega si la plataforma se lo muestra al medio
 * (`comision.visible_para_medio`); si no, la BD lo devuelve vacío.
 */
export function cotizacionDeFila(fila: FilaCotizacion): Cotizacion {
  const bruto = numeroOpcional(fila.monto_bruto)
  const porcentaje = numeroOpcional(fila.porcentaje_comision)
  const comision = numeroOpcional(fila.monto_comision)
  return {
    franjaClave: fila.franja_clave,
    seguidores: Number(fila.seguidores),
    publicaciones: Math.max(1, Number(fila.publicaciones)),
    multiplicadorCalidad: Number(fila.multiplicador_calidad),
    multiplicadorGeografico: Number(fila.multiplicador_geografico),
    multiplicadorExclusividad: Number(fila.multiplicador_exclusividad),
    montoMedio: Number(fila.monto_medio),
    desglose:
      bruto !== null && porcentaje !== null && comision !== null
        ? {
            tarifaBase: numeroOpcional(fila.tarifa_base),
            montoBruto: bruto,
            porcentajeComision: porcentaje,
            montoComision: comision,
          }
        : null,
  }
}

/** Lo que impediría aceptar la oferta (`impedimentos_aceptar`). */
export interface ImpedimentosAceptar {
  /** Choca con la exclusividad de otra campaña del mismo sector. */
  exclusividad: boolean
  /**
   * Cuentas con las que superaría la participación máxima del medio en la
   * campaña (`tope_medio`).
   */
  topeCampana: ReadonlySet<string>
}

/**
 * Impedimentos para aceptar: una fila por cuenta vigente del medio en la
 * plataforma de la oferta. La exclusividad es la misma en todas; sin filas,
 * ninguno.
 */
export function impedimentosDeFilas(
  filas: readonly FilaImpedimento[]
): ImpedimentosAceptar {
  return {
    exclusividad: filas.some((fila) => fila.exclusividad === true),
    topeCampana: new Set(
      filas
        .filter((fila) => fila.tope_medio === true)
        .map((fila) => fila.cuenta_social_id)
    ),
  }
}

/**
 * Las cuentas cotizadas con su impedimento por la participación máxima en la
 * campaña. Sin impedimentos (no se pudieron leer), ninguna lo marca: la
 * reserva vuelve a comprobarlo.
 */
export function cuentasConImpedimentos(
  cuentas: readonly Omit<CuentaCotizada, "superaTopeCampana">[],
  impedimentos: ImpedimentosAceptar | null
): CuentaCotizada[] {
  return cuentas.map((cuenta) => ({
    ...cuenta,
    superaTopeCampana:
      impedimentos?.topeCampana.has(cuenta.cuentaSocialId) ?? false,
  }))
}

/** Una asignación del medio en la oferta (de `mis_asignaciones_medio`). */
export function asignacionDeFila(
  fila: FilaAsignacionMedio
): AsignacionEnOferta {
  return {
    id: fila.id,
    estado: fila.estado,
    handle: fila.handle,
    aceptadaAt: fila.aceptada_at,
    montoMedio: numeroOpcional(fila.monto_medio),
  }
}

/** Respuesta de `mi_elegibilidad_marketplace` (un motivo desconocido no bloquea). */
export function elegibilidadDeFila(
  fila: { motivo: string | null; detalle: string | null } | undefined
): Elegibilidad {
  const motivo = MOTIVOS_ELEGIBILIDAD.find((valor) => valor === fila?.motivo)
  if (!motivo) return { motivo: "OK", detalle: null }
  return {
    motivo: motivo as MotivoElegibilidad,
    detalle: motivo === "OK" ? null : fila?.detalle?.trim() || null,
  }
}
