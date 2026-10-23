/**
 * La disputa de una asignación vista por una de sus partes (módulo puro, ADM-011,
 * MED-011 c2): qué muestra su página (la disputa abierta con su hilo, el
 * formulario para abrir una, el resultado de la última o por qué no se puede),
 * los motivos que se ofrecen con sus textos, lo que se le advierte antes de
 * abrirla y el enlace que la lleva allí desde su campaña. Lo usan la página
 * del medio (`/mis-campanas/[id]/disputa`) y la del anunciante
 * (`/campanas/[id]/asignaciones/[asignacionId]/disputa`): las dos cuentan lo
 * mismo, cada una en su voz. Los textos de motivos, estados y resultados son
 * los de `features/disputas/presentacion` (paquete DI).
 */
import {
  aperturaPosible,
  type ContextoDisputa,
  efectoResolucion,
  ESTADOS_DISPUTABLES,
  estaAbierta,
  laAbrioQuienMira,
  MOTIVOS,
  PLAZO_RECARGA_POR_DEFECTO,
} from "@/features/disputas/presentacion"
import type {
  CausaCancelacion,
  DisputaDetalle,
  EstadoAsignacion,
  EstadoDisputa,
  MotivoDisputa,
  ParteDisputa,
} from "@/features/disputas/tipos"
import { formatearFechaHora } from "@/lib/format"
import {
  LONGITUD_MAXIMA_URL_POST,
  type PlataformaPost,
  validarUrlPost,
} from "@/lib/redes/url-post"

/** Las partes de una asignación (el equipo AMO usa su propia ficha). */
export type PerspectivaParte = "medio" | "anunciante"

/**
 * `reclamo`: el medio reclama una vencida («sí publiqué»), D70;
 * `problema`: cualquiera de las partes reporta un problema en un estado
 * disputable.
 */
export type ModoApertura = "reclamo" | "problema"

const PARTE: Readonly<Record<PerspectivaParte, ParteDisputa>> = {
  medio: "MEDIO",
  anunciante: "ANUNCIANTE",
}

/** Descripción con que se precarga el reclamo de una vencida (editable). */
export const DESCRIPCION_RECLAMO = "Sí publiqué y no se registró"

// ── Qué muestra la página ────────────────────────────────────────────────────

export type VistaDisputa =
  /** Hay una abierta: su estado y el hilo para escribir. */
  | { tipo: "abierta"; disputa: DisputaDetalle; anteriores: DisputaDetalle[] }
  /** Se puede abrir una (las cerradas, si las hay, van debajo). */
  | {
      tipo: "abrir"
      modo: ModoApertura
      motivos: MotivoDisputa[]
      anteriores: DisputaDetalle[]
    }
  /** No se puede abrir otra: el resultado de la última y por qué. */
  | {
      tipo: "cerrada"
      disputa: DisputaDetalle
      anteriores: DisputaDetalle[]
      bloqueo: string | null
    }
  /** Nunca hubo disputa y ahora no se puede abrir: por qué. */
  | { tipo: "sin_disputa"; bloqueo: string }

/** Por qué la parte no puede abrir una disputa ahora, en su voz. */
export function bloqueoParte(
  perspectiva: PerspectivaParte,
  estado: EstadoAsignacion,
  respaldo: string
): string {
  const medio = perspectiva === "medio"
  switch (estado) {
    case "ACEPTADA":
    case "CONTENIDO_ENTREGADO":
      return medio
        ? "Podrás reportar un problema cuando cargues la evidencia de tu publicación."
        : "El medio aún no publica: podrás reportar un problema cuando cargue la evidencia."
    case "RECHAZADA":
      return medio
        ? "Desististe de esta campaña: no hay nada que disputar."
        : "El medio desistió del cupo: no hay nada que disputar."
    case "CANCELADA":
      return medio
        ? "Tu participación en esta campaña se canceló: ya no admite disputas."
        : "La asignación se canceló: ya no admite disputas y no se te cobra."
    case "LIQUIDADA":
    case "PAGADA":
      return "Esta publicación ya se liquidó: no admite disputas."
    case "VENCIDA_SIN_PUBLICAR":
      return medio
        ? respaldo
        : "El medio no publicó a tiempo: la asignación venció y no se te cobra. Solo el medio puede reclamarla."
    default:
      return respaldo
  }
}

/**
 * Qué muestra la página de la disputa a la parte. `disputas` llega como la
 * entrega `disputasDeAsignacion` (la más reciente primero; la abierta, si la
 * hay, encabeza). Espejo de `abrir_disputa_srv` y de `proximas_acciones_medio`:
 * una vencida se reclama una sola vez y dentro de su plazo; en los estados
 * disputables se abre otra cuando la anterior ya se cerró.
 */
export function vistaDisputa({
  perspectiva,
  estadoAsignacion,
  disputas,
  reclamoHasta = null,
  ahora,
}: {
  perspectiva: PerspectivaParte
  estadoAsignacion: EstadoAsignacion
  disputas: readonly DisputaDetalle[]
  reclamoHasta?: string | null
  ahora: Date
}): VistaDisputa {
  const [ultima, ...anteriores] = disputas
  if (ultima && estaAbierta(ultima.estado)) {
    return { tipo: "abierta", disputa: ultima, anteriores }
  }
  if (estadoAsignacion === "VENCIDA_SIN_PUBLICAR" && ultima) {
    return {
      tipo: "cerrada",
      disputa: ultima,
      anteriores,
      bloqueo:
        perspectiva === "medio"
          ? "Ya reclamaste esta publicación y el equipo AMO lo resolvió: no admite otro reclamo."
          : null,
    }
  }
  const apertura = aperturaPosible({
    parte: PARTE[perspectiva],
    estadoAsignacion,
    hayAbierta: false,
    reclamoHasta,
    ahora,
  })
  if (apertura.motivos.length > 0) {
    return {
      tipo: "abrir",
      modo:
        estadoAsignacion === "VENCIDA_SIN_PUBLICAR" ? "reclamo" : "problema",
      motivos: apertura.motivos,
      anteriores: [...disputas],
    }
  }
  const bloqueo = bloqueoParte(
    perspectiva,
    estadoAsignacion,
    apertura.bloqueo ?? "Esta asignación no admite disputas en su estado."
  )
  return ultima
    ? { tipo: "cerrada", disputa: ultima, anteriores, bloqueo }
    : { tipo: "sin_disputa", bloqueo }
}

/** ¿La disputa fue el reclamo de una vencida? */
export function esReclamo(
  disputa: Pick<DisputaDetalle, "estadoOrigen">
): boolean {
  return disputa.estadoOrigen === "VENCIDA_SIN_PUBLICAR"
}

/** Título de la página para la parte. */
export function tituloDisputa(
  vista: VistaDisputa,
  perspectiva: PerspectivaParte
): string {
  switch (vista.tipo) {
    case "abrir":
      return vista.modo === "reclamo"
        ? "Reclamar: sí publiqué"
        : "Reportar un problema"
    case "abierta":
    case "cerrada":
      if (!esReclamo(vista.disputa)) return "Disputa"
      return perspectiva === "medio" ? "Tu reclamo" : "Reclamo del medio"
    case "sin_disputa":
      return "Disputa"
  }
}

/**
 * Lo que el formulario necesita para abrir una disputa (serializable: viaja
 * del servidor al cliente).
 */
export interface AperturaDisputa {
  perspectiva: PerspectivaParte
  asignacionId: string
  modo: ModoApertura
  motivos: MotivoDisputa[]
  estadoAsignacion: EstadoAsignacion
  /** Reclamo de una vencida: fin del plazo para reclamar. */
  reclamoHasta: string | null
  /** `disputas.plazo_recarga_horas`: plazo para la evidencia si le dan la razón. */
  plazoRecargaHoras: number
  /** Para validar el enlace de la publicación (reclamo). */
  plataforma: PlataformaPost
  /** Cuenta con que aceptó (sin `@`): el enlace debe ser de ella. */
  handle: string | null
}

// ── Motivos ──────────────────────────────────────────────────────────────────

export interface OpcionMotivo {
  motivo: MotivoDisputa
  etiqueta: string
  ayuda: string
  /** Texto con que se precarga la descripción al elegirlo (editable). */
  sugerencia: string
  /** Ejemplo de lo que conviene contar. */
  ejemplo: string
}

/** El reclamo de una vencida: «sí publiqué» (Otro) o «el anunciante falló». */
const OPCIONES_RECLAMO: Readonly<
  Partial<Record<MotivoDisputa, Omit<OpcionMotivo, "motivo">>>
> = {
  OTRO: {
    etiqueta: DESCRIPCION_RECLAMO,
    ayuda:
      "Publicaste dentro del plazo, pero la evidencia no quedó cargada en AMO.",
    sugerencia: DESCRIPCION_RECLAMO,
    ejemplo:
      "Ej.: publiqué el reel el 22 de octubre a las 7 p. m. y la página no me dejó cargar la evidencia.",
  },
  INCUMPLIMIENTO: {
    etiqueta: "No pude publicar por el anunciante",
    ayuda:
      "El contenido no estuvo disponible a tiempo o el anunciante no cumplió lo acordado.",
    sugerencia: "",
    ejemplo:
      "Ej.: el anunciante cambió el contenido el último día y no alcancé a publicar la versión nueva.",
  },
}

const EJEMPLOS: Readonly<
  Record<PerspectivaParte, Readonly<Record<MotivoDisputa, string>>>
> = {
  medio: {
    INCUMPLIMIENTO:
      "Ej.: el anunciante cambió el contenido después de que lo publiqué.",
    METRICAS:
      "Ej.: me rechazaron las métricas de 72 horas, pero la captura muestra las mismas cifras.",
    CONTENIDO:
      "Ej.: el enlace de destino del contenido no abre y el anunciante no lo ha corregido.",
    PERMANENCIA:
      "Ej.: la publicación sigue en línea; adjunto una captura de hoy.",
    PAGO: "Ej.: el valor que veo no corresponde al multiplicador de mi cuenta.",
    OTRO: "Cuenta qué pasó, cuándo y qué pruebas tienes.",
  },
  anunciante: {
    INCUMPLIMIENTO:
      "Ej.: el medio publicó fuera de la ventana pactada y sin la etiqueta de publicidad.",
    METRICAS:
      "Ej.: el alcance del corte de 72 horas no coincide con lo que vemos en la publicación.",
    CONTENIDO:
      "Ej.: el copy publicado no es el aprobado y le quitaron la mención a la marca.",
    PERMANENCIA:
      "Ej.: la publicación ya no está visible en la cuenta desde el 20 de octubre.",
    PAGO: "Ej.: el cobro de esta publicación no corresponde a lo acordado.",
    OTRO: "Cuenta qué pasó, cuándo y qué pruebas tienes.",
  },
}

/** Los motivos que se ofrecen, con su texto en la voz de la parte. */
export function opcionesMotivo(
  perspectiva: PerspectivaParte,
  modo: ModoApertura,
  motivos: readonly MotivoDisputa[]
): OpcionMotivo[] {
  return motivos.map((motivo) => {
    const reclamo = modo === "reclamo" ? OPCIONES_RECLAMO[motivo] : undefined
    if (reclamo) return { motivo, ...reclamo }
    return {
      motivo,
      etiqueta: MOTIVOS[motivo].etiqueta,
      ayuda: MOTIVOS[motivo].ayuda[perspectiva],
      sugerencia: "",
      ejemplo: EJEMPLOS[perspectiva][motivo],
    }
  })
}

/** El motivo con que abre el formulario: «Otro» en el reclamo; ninguno si no. */
export function motivoInicial(
  modo: ModoApertura,
  motivos: readonly MotivoDisputa[]
): MotivoDisputa | null {
  return modo === "reclamo" && motivos.includes("OTRO") ? "OTRO" : null
}

/**
 * La descripción al cambiar de motivo: si la persona no la tocó (vacía o con
 * la sugerencia del motivo anterior), toma la del nuevo; si la escribió, se
 * respeta.
 */
export function descripcionAlCambiar(
  actual: string,
  anterior: OpcionMotivo | null,
  nueva: OpcionMotivo
): string {
  const intacta =
    actual.trim().length === 0 ||
    (anterior !== null && actual === anterior.sugerencia)
  return intacta ? nueva.sugerencia : actual
}

// ── Lo que se advierte antes de abrirla ──────────────────────────────────────

/** Estados en que el medio sigue cargando cortes durante la disputa (D72). */
const CON_CORTES: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
]

/**
 * Qué pasa mientras dure la disputa, dicho a quien la abre: el reclamo de una
 * vencida no le devuelve el cupo y, si le dan la razón, tiene un plazo nuevo
 * para la evidencia; las demás detienen la verificación y la liquidación.
 */
export function efectoApertura({
  perspectiva,
  modo,
  estadoAsignacion,
  plazoRecargaHoras = PLAZO_RECARGA_POR_DEFECTO,
}: {
  perspectiva: PerspectivaParte
  modo: ModoApertura
  estadoAsignacion: EstadoAsignacion
  plazoRecargaHoras?: number
}): string {
  if (modo === "reclamo") {
    return `Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás ${plazoRecargaHoras} horas para cargar la evidencia.`
  }
  const pausa =
    estadoAsignacion === "VERIFICADA"
      ? "Mientras dure la disputa, esta publicación no se liquida."
      : "Mientras dure la disputa, esta publicación no se verifica ni se liquida."
  if (perspectiva === "anunciante") {
    return `${pausa} Lo que escribas lo verán el medio y el equipo AMO.`
  }
  return CON_CORTES.includes(estadoAsignacion)
    ? `${pausa} Si tienes cortes de métricas pendientes, sigue cargándolos.`
    : pausa
}

// ── Pruebas del primer mensaje ───────────────────────────────────────────────

export type EnlaceValidado =
  { ok: true; url: string | null } | { ok: false; mensaje: string }

/**
 * El enlace de la publicación que acompaña un reclamo (opcional): vacío vale;
 * si no, debe ser el de una publicación de la cuenta con que aceptó, en su
 * plataforma (las mismas reglas que la evidencia).
 */
export function validarEnlacePublicacion(
  plataforma: PlataformaPost,
  enlace: string,
  handle: string | null
): EnlaceValidado {
  const texto = enlace.trim()
  if (!texto) return { ok: true, url: null }
  if (texto.length > LONGITUD_MAXIMA_URL_POST) {
    return {
      ok: false,
      mensaje: `El enlace admite hasta ${LONGITUD_MAXIMA_URL_POST} caracteres.`,
    }
  }
  const resultado = validarUrlPost(plataforma, texto, null, handle)
  return resultado.ok
    ? { ok: true, url: resultado.url }
    : {
        ok: false,
        mensaje: `${resultado.mensaje} Por ejemplo: ${resultado.ejemplo}`,
      }
}

/**
 * El primer mensaje del hilo con las pruebas del formulario (el enlace de la
 * publicación y la captura o el documento adjunto); `null` si no hay ninguna.
 */
export function mensajePruebas({
  modo,
  enlace,
  conAdjunto,
}: {
  modo: ModoApertura
  enlace: string | null
  conAdjunto: boolean
}): string | null {
  const lineas: string[] = []
  if (enlace) {
    lineas.push(
      modo === "reclamo"
        ? `Este es el enlace de mi publicación: ${enlace}`
        : `Enlace de referencia: ${enlace}`
    )
  }
  if (conAdjunto) {
    lineas.push(
      modo === "reclamo"
        ? "Adjunto la captura de mi publicación."
        : "Adjunto una prueba."
    )
  }
  return lineas.length > 0 ? lineas.join("\n") : null
}

// ── Lo que acompaña a la disputa en su página ────────────────────────────────

/**
 * Nombre de quien la abrió para la primera entrada del hilo: la empresa o el
 * medio de la otra parte. `undefined` si la abrió quien mira («Tú», «Tu
 * empresa») o el equipo AMO (el hilo ya los nombra).
 */
export function autorAperturaParte({
  perspectiva,
  parte,
  medio = null,
  empresa = null,
}: {
  perspectiva: PerspectivaParte
  parte: ParteDisputa
  medio?: string | null
  empresa?: string | null
}): string | undefined {
  if (parte === "ADMIN" || laAbrioQuienMira(parte, perspectiva)) {
    return undefined
  }
  const nombre = (parte === "MEDIO" ? medio : empresa)?.trim()
  return nombre || undefined
}

/**
 * Lo que `EstadoDisputa` necesita saber de la asignación para contar el
 * resultado: el plazo nuevo de la evidencia solo tras reabrir una vencida (la
 * fecha límite vigente es la que dio la resolución) y la causa de una
 * cancelación.
 */
export function contextoEstadoDisputa(
  disputa: Pick<DisputaDetalle, "estado" | "estadoOrigen" | "estadoResultante">,
  asignacion: {
    fechaLimitePublicacion: string | null
    causaCancelacion: CausaCancelacion | null
  },
  plazoRecargaHoras: number
): ContextoDisputa {
  const efecto = efectoResolucion(disputa)
  return {
    plazoRecargaHoras,
    fechaLimitePublicacion:
      efecto === "reabrir" ? asignacion.fechaLimitePublicacion : null,
    causaCancelacion:
      efecto === "cancelar" ? asignacion.causaCancelacion : null,
  }
}

/**
 * El aviso bajo el título de la página del anunciante mientras dure una
 * disputa sobre la publicación: qué queda en pausa y quién verá lo que
 * escriba. `null` sin una abierta o en el reclamo de una vencida (no se le
 * cobra: su estado ya lo explica).
 */
export function avisoPaginaAnunciante(vista: VistaDisputa): string | null {
  if (vista.tipo !== "abierta" || esReclamo(vista.disputa)) return null
  return efectoApertura({
    perspectiva: "anunciante",
    modo: "problema",
    estadoAsignacion: vista.disputa.estadoOrigen,
  })
}

/** Lo que el medio puede hacer enseguida a raíz de la disputa. */
export interface SiguienteTrasDisputa {
  /** `evidencia`: cargarla tras reabrir; `campana`: seguir con sus cortes. */
  destino: "evidencia" | "campana"
  texto: string
}

/**
 * El paso del medio junto al estado de la disputa: con la razón a su favor en
 * un reclamo, cargar la evidencia mientras siga por publicar; con una abierta
 * y cortes que pueden faltar, seguir cargándolos (D72). `null` si no hay nada
 * que hacer por ahora.
 */
export function siguienteTrasDisputa(
  disputa: Pick<DisputaDetalle, "estado" | "estadoOrigen" | "estadoResultante">,
  estadoAsignacion: EstadoAsignacion
): SiguienteTrasDisputa | null {
  if (estaAbierta(disputa.estado)) {
    return CON_CORTES.includes(disputa.estadoOrigen)
      ? { destino: "campana", texto: "Ver mis cortes de métricas" }
      : null
  }
  return efectoResolucion(disputa) === "reabrir" &&
    estadoAsignacion === "CONTENIDO_ENTREGADO"
    ? { destino: "evidencia", texto: "Cargar la evidencia" }
    : null
}

// ── El enlace desde la campaña ───────────────────────────────────────────────

export interface EnlaceDisputa {
  /** `abrir`: lleva al formulario; `ver`: a la disputa o su resultado. */
  tipo: "abrir" | "ver"
  texto: string
}

/**
 * El enlace a la página de la disputa desde la ficha o la tarjeta de la
 * asignación: «Ver la disputa» si hay una abierta (o su resultado si ya se
 * cerró y no se puede abrir otra), «Reportar un problema» en los estados
 * disputables y, para el medio, «Reclamar: sí publiqué» en una vencida dentro
 * de su plazo. `null` si no hay nada que ver ni abrir. `disputa` es la más
 * reciente (`undefined`: no se consultó; se decide solo por el estado).
 */
export function enlaceDisputa({
  perspectiva,
  estado,
  disputa,
  reclamoHasta = null,
  ahora,
}: {
  perspectiva: PerspectivaParte
  estado: EstadoAsignacion
  disputa?: {
    estado: EstadoDisputa
    estadoOrigen: EstadoAsignacion
  } | null
  reclamoHasta?: string | null
  ahora: Date
}): EnlaceDisputa | null {
  const reclamo = disputa ? esReclamo(disputa) : false
  const ver: EnlaceDisputa = {
    tipo: "ver",
    texto: reclamo
      ? perspectiva === "medio"
        ? "Ver tu reclamo"
        : "Ver el reclamo"
      : "Ver la disputa",
  }
  if (estado === "EN_DISPUTA" || (disputa && estaAbierta(disputa.estado))) {
    return ver
  }
  if (ESTADOS_DISPUTABLES.includes(estado)) {
    return { tipo: "abrir", texto: "Reportar un problema" }
  }
  if (
    perspectiva === "medio" &&
    estado === "VENCIDA_SIN_PUBLICAR" &&
    !disputa &&
    reclamoHasta &&
    ahora.getTime() <= new Date(reclamoHasta).getTime()
  ) {
    return { tipo: "abrir", texto: "Reclamar: sí publiqué" }
  }
  return disputa ? ver : null
}

/** «Tienes hasta el 26 oct 2026, 12:00 a. m. para reclamar». */
export function textoPlazoReclamo(hasta: string): string {
  return `Tienes hasta el ${formatearFechaHora(hasta)} para reclamar.`
}
