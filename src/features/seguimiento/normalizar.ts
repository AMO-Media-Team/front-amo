/**
 * De las filas de `seguimiento_campana` (y `medios_publico`) a los tipos del
 * seguimiento (módulo puro). Las columnas `jsonb` se validan con zod: un campo
 * inesperado se descarta en lugar de romper la pestaña. Los nombres de
 * municipio y departamento llegan ya resueltos (el diccionario no viaja al
 * navegador).
 */
import { z } from "zod"

import type { Database } from "@/types/database.types"

import type {
  AsignacionSeguimiento,
  CorteAprobado,
  CuentaPublica,
  CuentaSeguimiento,
  EstadoAsignacion,
  PerfilMedio,
  Plataforma,
  PublicacionSeguimiento,
  TipoMedio,
} from "./tipos"

type Funciones = Database["public"]["Functions"]
export type FilaSeguimiento =
  Funciones["seguimiento_campana"]["Returns"][number]
export type FilaMedioPublico = Funciones["medios_publico"]["Returns"][number]

/** Resuelve "Pasto" y "Nariño" (o `null`) desde los códigos DANE. */
export interface ResolverUbicacion {
  municipio: (codigo: string | null) => string | null
  departamento: (codigo: string | null) => string | null
}

const PLATAFORMAS = ["INSTAGRAM", "FACEBOOK", "TIKTOK"] as const
const CORTES = ["H24", "H72", "D7"] as const
const VALIDACIONES = ["PENDIENTE", "APROBADA", "RECHAZADA"] as const

/** Número finito o `null` (jsonb puede traer `numeric` como texto). */
const cifra = z.preprocess((valor) => {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}, z.number().nullable())

const texto = z
  .string()
  .nullish()
  .transform((valor) => valor || null)

const esquemaCorte = z.object({
  corte: z.enum(CORTES),
  fecha_corte: z.string(),
  alcance: cifra,
  impresiones: cifra,
  interacciones: cifra,
  reproducciones: cifra,
  clics: cifra,
})

const esquemaPublicacion = z.object({
  id: z.string(),
  numero: z.number().int(),
  url_post: z.string(),
  fecha_publicacion: z.string(),
  estado_validacion: z.enum(VALIDACIONES),
  con_captura: z.boolean().catch(false),
  cortes: z.array(z.unknown()).catch([]),
})

const esquemaCuenta = z.object({
  plataforma: z.enum(PLATAFORMAS).nullish(),
  handle: texto,
  url: texto,
  seguidores_al_aceptar: cifra.optional(),
  franja_clave: texto,
})

const esquemaCuentaPublica = z.object({
  plataforma: z.enum(PLATAFORMAS),
  handle: texto,
  url: texto,
  seguidores_verificados: cifra.optional(),
  franja_clave: texto,
  alcance_mediano: cifra.optional(),
})

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

function corteDe(valor: unknown): CorteAprobado[] {
  const leido = esquemaCorte.safeParse(valor)
  if (!leido.success) return []
  const c = leido.data
  return [
    {
      corte: c.corte,
      fechaCorte: c.fecha_corte,
      alcance: c.alcance,
      impresiones: c.impresiones,
      interacciones: c.interacciones,
      reproducciones: c.reproducciones,
      clics: c.clics,
    },
  ]
}

function publicacionDe(valor: unknown): PublicacionSeguimiento[] {
  const leida = esquemaPublicacion.safeParse(valor)
  if (!leida.success) return []
  const p = leida.data
  return [
    {
      id: p.id,
      numero: p.numero,
      urlPost: p.url_post,
      fechaPublicacion: p.fecha_publicacion,
      estadoValidacion: p.estado_validacion,
      conCaptura: p.con_captura,
      cortes: p.cortes
        .flatMap(corteDe)
        .sort((a, b) => a.fechaCorte.localeCompare(b.fechaCorte)),
    },
  ]
}

function cuentaDe(valor: unknown, plataforma: Plataforma): CuentaSeguimiento {
  const leida = esquemaCuenta.safeParse(valor)
  const c = leida.success ? leida.data : null
  return {
    plataforma: c?.plataforma ?? plataforma,
    handle: c?.handle ?? null,
    url: c?.url ?? null,
    seguidoresAlAceptar: c?.seguidores_al_aceptar ?? null,
    franja: c?.franja_clave ?? null,
  }
}

function aNumero(valor: unknown, respaldo = 0): number {
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : respaldo
}

/** Una fila de `seguimiento_campana` (las SRF declaran sus columnas no nulas). */
export function asignacionDesdeFila(
  fila: FilaSeguimiento,
  ubicacion: ResolverUbicacion
): AsignacionSeguimiento {
  const nula = <T>(valor: T | null | undefined): T | null => valor ?? null
  return {
    id: fila.asignacion_id,
    ofertaId: fila.oferta_id,
    oferta: fila.oferta_titulo,
    plataforma: fila.plataforma,
    slot: aNumero(fila.slot, 1),
    estado: fila.estado,
    estadoPrevioDisputa: nula<EstadoAsignacion>(fila.estado_previo_disputa),
    aceptadaAt: fila.aceptada_at,
    contenidoDescargadoAt: nula(fila.contenido_descargado_at),
    fechaLimitePublicacion: nula(fila.fecha_limite_publicacion),
    publicadaAt: nula(fila.publicada_at),
    evidenciaValidadaAt: nula(fila.evidencia_validada_at),
    metricasCargadasAt: nula(fila.metricas_cargadas_at),
    verificadaAt: nula(fila.verificada_at),
    vencidaAt: nula(fila.vencida_at),
    enDisputaAt: nula(fila.en_disputa_at),
    canceladaAt: nula(fila.cancelada_at),
    montoBruto: aNumero(fila.monto_bruto),
    medio: {
      id: fila.medio_id,
      nombre: fila.medio_nombre,
      municipio: ubicacion.municipio(nula(fila.municipio_codigo)),
      departamento: ubicacion.departamento(nula(fila.departamento_codigo)),
      nivel: aNumero(fila.nivel_verificacion),
    },
    cuenta: cuentaDe(fila.cuenta, fila.plataforma),
    publicaciones: lista(fila.publicaciones)
      .flatMap(publicacionDe)
      .sort((a, b) => a.numero - b.numero),
  }
}

const TIPOS_MEDIO: readonly TipoMedio[] = [
  "PAGINA_NOTICIAS",
  "CREADOR",
  "EMISORA",
  "PERIODICO",
  "CANAL_TV",
  "COMUNITARIO",
  "OTRO",
]

function cuentaPublicaDe(valor: unknown): CuentaPublica[] {
  const leida = esquemaCuentaPublica.safeParse(valor)
  if (!leida.success) return []
  const c = leida.data
  return [
    {
      plataforma: c.plataforma,
      handle: c.handle,
      url: c.url,
      seguidores: c.seguidores_verificados ?? null,
      franja: c.franja_clave,
      alcanceMediano: c.alcance_mediano ?? null,
    },
  ]
}

/** Una fila de `medios_publico` como ficha pública. */
export function perfilDesdeFila(
  fila: FilaMedioPublico,
  ubicacion: ResolverUbicacion
): PerfilMedio {
  const tipo = (TIPOS_MEDIO as readonly string[]).includes(fila.tipo ?? "")
    ? fila.tipo
    : null
  const tasa =
    fila.tasa_cumplimiento === null || fila.tasa_cumplimiento === undefined
      ? null
      : aNumero(fila.tasa_cumplimiento, Number.NaN)
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo,
    municipio: ubicacion.municipio(fila.municipio_codigo ?? null),
    departamento: ubicacion.departamento(fila.departamento_codigo ?? null),
    nivel: aNumero(fila.nivel_verificacion),
    tasaCumplimiento: tasa === null || Number.isNaN(tasa) ? null : tasa,
    nCumplimiento: aNumero(fila.n_cumplimiento),
    publicacionesVerificadas: aNumero(fila.publicaciones_verificadas),
    cuentas: lista(fila.cuentas).flatMap(cuentaPublicaDe),
  }
}
