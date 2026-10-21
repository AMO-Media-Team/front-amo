/**
 * Catálogo de presentación de la operación (módulo puro): nombre legible,
 * tono y descripción de cada estado de las máquinas de estado del negocio
 * (docs/modelo-datos.md §4), y etiquetas de los enums que se muestran en
 * listados y fichas. Es la fuente única de estos textos en la interfaz.
 */
import type { Tono } from "@/features/usuarios/presentacion"
import type { Database } from "@/types/database.types"

import type { VigenciaVerificacion } from "./calculos"

export type { Tono }

type Enums = Database["public"]["Enums"]

export type EstadoMedio = Enums["medio_estado"]
export type EstadoAnunciante = Enums["anunciante_estado"]
export type EstadoCampana = Enums["campana_estado"]
export type EstadoOferta = Enums["oferta_estado"]
export type EstadoAsignacion = Enums["asignacion_estado"]
export type EstadoValidacion = Enums["validacion_estado"]
export type EstadoDocumento = Enums["documento_estado"]
export type EstadoDisputa = Enums["disputa_estado"]
export type EstadoFactura = Enums["factura_estado"]
export type EstadoLiquidacion = Enums["liquidacion_estado"]
export type Plataforma = Enums["plataforma"]
export type TipoMedio = Enums["medio_tipo"]
export type Corte = Enums["corte_metrica"]

export interface PresentacionEstado {
  etiqueta: string
  tono: Tono
  /** Qué significa para quien opera (tooltip y ayudas). */
  descripcion: string
}

type Catalogo<E extends string> = Readonly<Record<E, PresentacionEstado>>

function estado(
  etiqueta: string,
  tono: Tono,
  descripcion: string
): PresentacionEstado {
  return { etiqueta, tono, descripcion }
}

export const ESTADOS_MEDIO: Catalogo<EstadoMedio> = {
  PENDIENTE: estado(
    "En verificación",
    "info",
    "Registrado; aún no completa la verificación."
  ),
  VERIFICADO: estado(
    "Verificado",
    "exito",
    "Puede ver y aceptar ofertas de su nivel."
  ),
  RECHAZADO: estado("Rechazado", "peligro", "La verificación no fue aprobada."),
  SUSPENDIDO: estado(
    "Suspendido",
    "aviso",
    "No ve ofertas ni puede aceptar nuevas mientras siga suspendido."
  ),
}

export const ESTADOS_ANUNCIANTE: Catalogo<EstadoAnunciante> = {
  PENDIENTE: estado(
    "En verificación",
    "info",
    "Registrado; falta validar sus documentos."
  ),
  VERIFICADO: estado(
    "Verificado",
    "exito",
    "Puede publicar campañas y ofertas."
  ),
  RECHAZADO: estado("Rechazado", "peligro", "La verificación no fue aprobada."),
  SUSPENDIDO: estado(
    "Suspendido",
    "aviso",
    "No puede publicar ofertas mientras siga suspendido."
  ),
}

export const ESTADOS_CAMPANA: Catalogo<EstadoCampana> = {
  BORRADOR: estado(
    "Borrador",
    "neutro",
    "En preparación; no tiene ofertas publicadas."
  ),
  ACTIVA: estado("Activa", "exito", "Tiene ofertas en curso o por publicar."),
  FINALIZADA: estado("Finalizada", "info", "Terminó su vigencia."),
  CANCELADA: estado("Cancelada", "peligro", "Se canceló antes de terminar."),
}

export const ESTADOS_OFERTA: Catalogo<EstadoOferta> = {
  BORRADOR: estado("Borrador", "neutro", "En preparación por el anunciante."),
  EN_REVISION: estado("En revisión", "aviso", "Espera la moderación de AMO."),
  DEVUELTA: estado(
    "Devuelta",
    "aviso",
    "La moderación pidió ajustes al anunciante."
  ),
  PUBLICADA: estado(
    "Publicada",
    "info",
    "Visible en el marketplace para los medios elegibles."
  ),
  CUPOS_COMPLETOS: estado(
    "Cupos completos",
    "exito",
    "Todos los cupos fueron tomados."
  ),
  EN_EJECUCION: estado(
    "En ejecución",
    "info",
    "Los medios están publicando el contenido."
  ),
  VENCIDA: estado(
    "Vencida",
    "neutro",
    "Pasó la fecha límite de aceptación con cupos libres."
  ),
  CERRADA: estado("Cerrada", "neutro", "Terminó su ejecución."),
  CANCELADA: estado("Cancelada", "peligro", "Se canceló antes de terminar."),
}

export const ESTADOS_ASIGNACION: Catalogo<EstadoAsignacion> = {
  ACEPTADA: estado(
    "Aceptada",
    "info",
    "El medio aceptó el cupo; falta descargar el contenido."
  ),
  CONTENIDO_ENTREGADO: estado(
    "Contenido descargado",
    "info",
    "El medio descargó el creativo; falta publicar."
  ),
  PUBLICADA: estado(
    "Publicada",
    "aviso",
    "Evidencia cargada; espera la validación de AMO."
  ),
  EVIDENCIA_VALIDADA: estado(
    "Evidencia validada",
    "info",
    "Publicación comprobada; faltan los cortes de métricas."
  ),
  METRICAS_CARGADAS: estado(
    "Métricas cargadas",
    "aviso",
    "Todos los cortes cargados; espera la verificación."
  ),
  VERIFICADA: estado(
    "Verificada",
    "exito",
    "Cumplida y lista para liquidar al medio."
  ),
  LIQUIDADA: estado(
    "Liquidada",
    "exito",
    "Incluida en una liquidación pendiente de pago."
  ),
  PAGADA: estado("Pagada", "exito", "El medio ya recibió el pago."),
  RECHAZADA: estado(
    "Rechazada",
    "neutro",
    "El medio rechazó o desistió del cupo."
  ),
  VENCIDA_SIN_PUBLICAR: estado(
    "Vencida sin publicar",
    "peligro",
    "Pasó la fecha límite sin evidencia; el cupo se liberó."
  ),
  EN_DISPUTA: estado(
    "En disputa",
    "aviso",
    "Una de las partes abrió una disputa que AMO debe resolver."
  ),
  CANCELADA: estado(
    "Cancelada",
    "peligro",
    "AMO la canceló con una causa registrada."
  ),
}

export const ESTADOS_VALIDACION: Catalogo<EstadoValidacion> = {
  PENDIENTE: estado("Por validar", "aviso", "Espera la revisión de AMO."),
  APROBADA: estado("Aprobada", "exito", "Revisada y aceptada."),
  RECHAZADA: estado("Rechazada", "peligro", "Revisada y rechazada."),
}

export const ESTADOS_DOCUMENTO: Catalogo<EstadoDocumento> = {
  PENDIENTE: estado("Por revisar", "aviso", "Espera la revisión de AMO."),
  APROBADO: estado("Aprobado", "exito", "Revisado y aceptado."),
  RECHAZADO: estado("Rechazado", "peligro", "Revisado y rechazado."),
  VENCIDO: estado("Vencido", "neutro", "Superó su fecha de vencimiento."),
}

export const ESTADOS_DISPUTA: Catalogo<EstadoDisputa> = {
  ABIERTA: estado("Abierta", "peligro", "Espera la revisión de AMO."),
  EN_REVISION: estado("En revisión", "aviso", "AMO la está revisando."),
  RESUELTA: estado("Resuelta", "exito", "Tiene una resolución."),
  DESCARTADA: estado("Descartada", "neutro", "No prosperó."),
}

export const ESTADOS_FACTURA: Catalogo<EstadoFactura> = {
  BORRADOR: estado("Borrador", "neutro", "Aún no se emite."),
  EMITIDA: estado("Emitida", "info", "Emitida y pendiente de pago."),
  PAGADA_PARCIAL: estado("Pago parcial", "aviso", "Tiene un saldo pendiente."),
  PAGADA: estado("Pagada", "exito", "Sin saldo pendiente."),
  VENCIDA: estado(
    "Vencida",
    "peligro",
    "Pasó su fecha de vencimiento con saldo."
  ),
  ANULADA: estado("Anulada", "neutro", "Anulada; no cuenta en la cartera."),
}

export const ESTADOS_LIQUIDACION: Catalogo<EstadoLiquidacion> = {
  BORRADOR: estado("Borrador", "neutro", "Generada; falta aprobarla."),
  APROBADA: estado("Aprobada", "info", "Aprobada y pendiente de pago."),
  PAGADA: estado("Pagada", "exito", "Pagada al medio."),
  ANULADA: estado(
    "Anulada",
    "neutro",
    "Anulada; sus asignaciones volvieron a verificadas."
  ),
}

/** Vigencia de la verificación de una cuenta social (`private.cuenta_vigente`). */
export const VIGENCIAS_VERIFICACION: Catalogo<VigenciaVerificacion> = {
  sin_verificar: estado(
    "Sin verificar",
    "neutro",
    "AMO aún no comprueba sus seguidores: no es elegible para ofertas."
  ),
  vigente: estado("Vigente", "exito", "Verificación al día."),
  por_vencer: estado(
    "Por vencer",
    "aviso",
    "La verificación vence en pocos días: conviene renovarla."
  ),
  en_gracia: estado(
    "En gracia",
    "aviso",
    "Venció, pero sigue elegible durante el periodo de gracia."
  ),
  vencida: estado(
    "Vencida",
    "peligro",
    "Venció y pasó la gracia: no es elegible hasta reverificarse."
  ),
}

// ── Asignaciones: grupos y flujo ─────────────────────────────────────────────

/** Estados que consumen cupo (docs/kpis.md §0.2, `CON_CUPO`). */
export const ESTADOS_CON_CUPO: readonly EstadoAsignacion[] = [
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

/** `CUMPLIDAS`: la base del GMV verificado. */
export const ESTADOS_CUMPLIDOS: readonly EstadoAsignacion[] = [
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
]

/**
 * Espejo de `private.consume_cupo`: una disputa sobre una vencida no vuelve
 * a ocupar el cupo (se liberó al vencer).
 */
export function consumeCupo(
  estadoActual: EstadoAsignacion,
  estadoPrevioDisputa: EstadoAsignacion | null
): boolean {
  return (
    ESTADOS_CON_CUPO.includes(estadoActual) &&
    !(
      estadoActual === "EN_DISPUTA" &&
      estadoPrevioDisputa === "VENCIDA_SIN_PUBLICAR"
    )
  )
}

export const GRUPOS_ASIGNACION = [
  "en_curso",
  "por_revisar",
  "cumplidas",
  "en_disputa",
  "caidas",
] as const

export type GrupoAsignacion = (typeof GRUPOS_ASIGNACION)[number]

export const ESTADOS_POR_GRUPO: Readonly<
  Record<GrupoAsignacion, readonly EstadoAsignacion[]>
> = {
  en_curso: ["ACEPTADA", "CONTENIDO_ENTREGADO", "EVIDENCIA_VALIDADA"],
  por_revisar: ["PUBLICADA", "METRICAS_CARGADAS"],
  cumplidas: ESTADOS_CUMPLIDOS,
  en_disputa: ["EN_DISPUTA"],
  caidas: ["RECHAZADA", "VENCIDA_SIN_PUBLICAR", "CANCELADA"],
}

export const GRUPOS: Readonly<
  Record<GrupoAsignacion, { etiqueta: string; descripcion: string; tono: Tono }>
> = {
  en_curso: {
    etiqueta: "En curso",
    descripcion:
      "El medio tiene una acción pendiente (descargar, publicar o cargar métricas).",
    tono: "info",
  },
  por_revisar: {
    etiqueta: "Por revisar",
    descripcion: "Evidencia o métricas que esperan la validación de AMO.",
    tono: "aviso",
  },
  cumplidas: {
    etiqueta: "Cumplidas",
    descripcion: "Verificadas, liquidadas o pagadas.",
    tono: "exito",
  },
  en_disputa: {
    etiqueta: "En disputa",
    descripcion: "Con una disputa abierta.",
    tono: "aviso",
  },
  caidas: {
    etiqueta: "Caídas",
    descripcion: "Rechazadas, vencidas sin publicar o canceladas.",
    tono: "peligro",
  },
}

export function grupoDeEstado(estadoActual: EstadoAsignacion): GrupoAsignacion {
  return (
    GRUPOS_ASIGNACION.find((grupo) =>
      ESTADOS_POR_GRUPO[grupo].includes(estadoActual)
    ) ?? "en_curso"
  )
}

/** Camino feliz de una asignación, en orden (pasos de la línea de progreso). */
export const FLUJO_ASIGNACION: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
]

/** Estados que cierran la asignación fuera del camino feliz. */
export const ESTADOS_TERMINALES_CAIDA: readonly EstadoAsignacion[] = [
  "RECHAZADA",
  "VENCIDA_SIN_PUBLICAR",
  "CANCELADA",
]

// ── Enums de catálogo ────────────────────────────────────────────────────────

export const TIPOS_MEDIO: Readonly<Record<TipoMedio, string>> = {
  PAGINA_NOTICIAS: "Página de noticias",
  CREADOR: "Creador de contenido",
  EMISORA: "Emisora",
  PERIODICO: "Periódico",
  CANAL_TV: "Canal de TV",
  COMUNITARIO: "Medio comunitario",
  OTRO: "Otro",
}

export const PLATAFORMAS: Readonly<Record<Plataforma, string>> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
}

export const ORDEN_PLATAFORMAS: readonly Plataforma[] = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
]

export const CORTES: Readonly<
  Record<Corte, { etiqueta: string; corta: string; orden: number }>
> = {
  H24: { etiqueta: "24 horas", corta: "24 h", orden: 1 },
  H72: { etiqueta: "72 horas", corta: "72 h", orden: 2 },
  D7: { etiqueta: "7 días", corta: "7 d", orden: 3 },
  PERSONALIZADO: { etiqueta: "Personalizado", corta: "Pers.", orden: 4 },
}

export const CAUSAS_CANCELACION: Readonly<
  Record<Enums["cancelacion_causa"], string>
> = {
  ADMINISTRATIVA: "Administrativa",
  ACUERDO: "Acuerdo entre las partes",
  INCUMPLIMIENTO_MEDIO: "Incumplimiento del medio",
  FRAUDE: "Fraude",
}

export const METODOS_VERIFICACION: Readonly<
  Record<Enums["metodo_verificacion"], string>
> = {
  MANUAL: "Captura del panel",
  CODIGO_HISTORIA: "Código en historia",
  API: "Integración (API)",
}

export const FUENTES_AUDIENCIA: Readonly<
  Record<Enums["audiencia_fuente"], string>
> = {
  DECLARADA: "Declarada por el medio",
  VERIFICADA_MANUAL: "Verificada por AMO",
  API: "Integración (API)",
}

export const ORIGENES_COMISION: Readonly<
  Record<Enums["comision_origen"], string>
> = {
  GLOBAL: "Comisión global",
  EXCEPCION_ANUNCIANTE: "Excepción del anunciante",
  EXCEPCION_CAMPANA: "Excepción de la campaña",
}

export const MOTIVOS_DISPUTA: Readonly<
  Record<Enums["disputa_motivo"], string>
> = {
  INCUMPLIMIENTO: "Incumplimiento",
  METRICAS: "Métricas",
  CONTENIDO: "Contenido",
  PERMANENCIA: "Permanencia",
  PAGO: "Pago",
  OTRO: "Otro motivo",
}

export const PARTES_DISPUTA: Readonly<Record<Enums["disputa_parte"], string>> =
  {
    ANUNCIANTE: "el anunciante",
    MEDIO: "el medio",
    ADMIN: "AMO",
  }

export const TIPOS_DOCUMENTO_MEDIO: Readonly<
  Record<Enums["documento_medio_tipo"], string>
> = {
  CEDULA_FRENTE: "Cédula (frente)",
  CEDULA_REVERSO: "Cédula (reverso)",
  PRUEBA_VIDA: "Prueba de vida",
  RUT: "RUT",
  RUT_SOCIEDAD: "RUT de la sociedad",
  CAMARA_COMERCIO: "Cámara de comercio",
  CERT_BANCARIA: "Certificación bancaria",
  CERT_BILLETERA: "Certificación de billetera",
  SEG_SOCIAL: "Seguridad social",
}

export const TIPOS_DOCUMENTO_ANUNCIANTE: Readonly<
  Record<Enums["documento_anunciante_tipo"], string>
> = {
  RUT: "RUT",
  CAMARA_COMERCIO: "Cámara de comercio",
  CERT_BANCARIA: "Certificación bancaria",
  OTRO: "Otro documento",
}

export const TIPOS_DOCUMENTO_IDENTIDAD: Readonly<
  Record<Enums["documento_identidad_tipo"], string>
> = {
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  PPT: "Permiso de protección temporal",
  PASAPORTE: "Pasaporte",
  NIT: "NIT",
}

export const METODOS_PAGO: Readonly<Record<Enums["metodo_pago"], string>> = {
  BANCARIO: "Cuenta bancaria",
  BILLETERA: "Billetera digital",
}

/** Niveles de verificación del medio (la BD guarda el nombre largo de cada uno). */
export function etiquetaNivel(nivel: number): string {
  return nivel > 0 ? `Nivel ${nivel}` : "Sin nivel"
}

/** Etiqueta de un valor de enum o, si no está en el catálogo, el valor tal cual. */
export function etiquetaDe<E extends string>(
  catalogo: Readonly<Record<E, string | PresentacionEstado>>,
  valor: string | null | undefined
): string {
  if (!valor) return "—"
  const entrada = (
    catalogo as Readonly<Record<string, string | PresentacionEstado>>
  )[valor]
  if (!entrada) return valor
  return typeof entrada === "string" ? entrada : entrada.etiqueta
}
