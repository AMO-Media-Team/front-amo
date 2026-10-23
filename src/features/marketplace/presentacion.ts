/**
 * Presentación del marketplace del medio (módulo puro, cliente y servidor):
 * por qué no ve ofertas y cómo resolverlo, pago y cupos de la tarjeta,
 * condiciones fijas de toda oferta, multiplicadores del precio y si la
 * oferta se puede aceptar ahora. Textos en voz del medio («Recibes…»,
 * «Tienes hasta…»); es la fuente única de estos textos en la interfaz.
 */
import type { Route } from "next"

import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import {
  CORTES,
  type Corte,
  type EstadoOferta,
  PLATAFORMAS,
} from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearFechaHora,
  formatearPorcentaje,
} from "@/lib/format"

import { CHOQUE_EXCLUSIVIDAD } from "./errores"
import type {
  AsignacionEnOferta,
  CuentaCotizada,
  CuentaEnOferta,
  DetalleOfertaMedio,
  EnlaceError,
  MotivoElegibilidad,
  OfertaMarketplace,
} from "./tipos"

/** Bajada del encabezado de «Ofertas» (página y carga). */
export const DESCRIPCION_MARKETPLACE =
  "Pauta que puedes aceptar hoy con tus cuentas verificadas. El pago se calcula con la franja de seguidores de tu cuenta y queda congelado al aceptar."

// ── Elegibilidad (MED-008 c2) ────────────────────────────────────────────────

export interface PresentacionElegibilidad {
  titulo: string
  /** Si la BD no trae el detalle (no debería pasar). */
  detalle: string
  accion: { texto: string; href: Route }
}

export const ELEGIBILIDAD: Readonly<
  Record<Exclude<MotivoElegibilidad, "OK">, PresentacionElegibilidad>
> = {
  SIN_MEDIO: {
    titulo: "Tu cuenta aún no tiene un medio",
    detalle: "Tu cuenta no está vinculada a un medio.",
    accion: { texto: "Ir a Mi medio", href: RUTAS_MI_MEDIO.inicio },
  },
  MEDIO_PENDIENTE: {
    titulo: "Termina la verificación de tu medio",
    detalle:
      "Tu medio aún no está verificado: completa el alta y envíalo a verificación.",
    accion: { texto: "Completar mi alta", href: RUTAS_MI_MEDIO.inicio },
  },
  MEDIO_RECHAZADO: {
    titulo: "La verificación de tu medio necesita cambios",
    detalle:
      "La verificación de tu medio fue rechazada: corrige lo indicado y vuelve a enviarla.",
    accion: { texto: "Corregir y reenviar", href: RUTAS_MI_MEDIO.inicio },
  },
  MEDIO_SUSPENDIDO: {
    titulo: "Tu medio está suspendido",
    detalle: "Mientras tanto no verás ofertas nuevas.",
    accion: { texto: "Ver el estado de mi medio", href: RUTAS_MI_MEDIO.inicio },
  },
  NIVEL_0: {
    titulo: "Tu medio aún no tiene nivel de verificación",
    detalle: "Tu medio aún no tiene un nivel de verificación.",
    accion: { texto: "Ver mi nivel", href: RUTAS_MI_MEDIO.nivel },
  },
  SIN_CUENTA_VIGENTE: {
    titulo: "Reverifica tus cuentas para ver ofertas",
    detalle:
      "Ninguna de tus cuentas tiene la verificación de seguidores al día.",
    accion: { texto: "Ir a mis cuentas", href: RUTAS_MI_MEDIO.cuentas },
  },
  BAJO_UMBRAL: {
    titulo: "Tus cuentas aún no llegan al mínimo de seguidores",
    detalle:
      "Tus cuentas verificadas tienen menos seguidores que el mínimo para recibir ofertas.",
    accion: { texto: "Ver mis cuentas", href: RUTAS_MI_MEDIO.cuentas },
  },
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────

/** «Último cupo en tu franja», «3 cupos en tu franja», «Sin cupos en tu franja». */
export function textoCupos(cupos: number): string {
  if (cupos <= 0) return "Sin cupos en tu franja"
  if (cupos === 1) return "Último cupo en tu franja"
  return `${contar(cupos, "cupo", "cupos")} en tu franja`
}

/**
 * La cuenta que más paga entre las que tienen cupo (la que se muestra en la
 * tarjeta); sin tarifa, la de más cupos.
 */
export function cuentaDestacada<
  C extends Pick<CuentaEnOferta, "cuposRestantes" | "montoMedio">,
>(cuentas: readonly C[]): C | null {
  const conCupo = cuentas.filter((cuenta) => cuenta.cuposRestantes > 0)
  return (
    [...conCupo].sort(
      (a, b) =>
        (b.montoMedio ?? -1) - (a.montoMedio ?? -1) ||
        b.cuposRestantes - a.cuposRestantes
    )[0] ?? null
  )
}

export interface PagoTarjeta {
  /** «Recibes» o, si sus cuentas pagan distinto, «Hasta». */
  etiqueta: string
  valor: string
  /** Para lectores de pantalla: «Recibes hasta $ 200.000». */
  descripcion: string
}

export function pagoTarjeta(
  oferta: Pick<OfertaMarketplace, "pagoMaximo" | "cuentas">
): PagoTarjeta {
  if (oferta.pagoMaximo === null) {
    return {
      etiqueta: "Pago",
      valor: "Por confirmar",
      descripcion: "Pago por confirmar",
    }
  }
  const montos = new Set(oferta.cuentas.map((cuenta) => cuenta.montoMedio))
  const varios = montos.size > 1
  const valor = formatearCOP(oferta.pagoMaximo)
  return {
    etiqueta: varios ? "Hasta" : "Recibes",
    valor,
    descripcion: varios ? `Recibes hasta ${valor}` : `Recibes ${valor}`,
  }
}

/** "1 publicación", "3 publicaciones". */
export function textoPublicaciones(cantidad: number): string {
  return contar(cantidad, "publicación", "publicaciones")
}

/** "Reel de Instagram" a partir del nombre del formato y la plataforma. */
export function formatoDeOferta(oferta: {
  formato: string
  plataforma: keyof typeof PLATAFORMAS
}): string {
  return `${oferta.formato} de ${PLATAFORMAS[oferta.plataforma]}`
}

/** Une con comas y «y»: «24 horas, 72 horas y 7 días». */
export function unirLista(elementos: readonly string[]): string {
  if (elementos.length <= 1) return elementos[0] ?? ""
  return `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`
}

/** Cortes de métricas en su orden: «24 horas, 72 horas y 7 días». */
export function textoCortes(cortes: readonly Corte[]): string {
  return unirLista(
    [...new Set(cortes)]
      .sort((a, b) => CORTES[a].orden - CORTES[b].orden)
      .map((corte) => CORTES[corte].etiqueta)
  )
}

// ── Condiciones y multiplicadores ────────────────────────────────────────────

export interface Condicion {
  clave: string
  titulo: string
  descripcion: string
}

/**
 * Lo que el medio acepta con la oferta: dos condiciones fijas de toda pauta
 * (etiqueta de publicidad y copy sin editar) y las propias de la oferta.
 */
export function condicionesOferta(
  oferta: Pick<
    OfertaMarketplace,
    "permanenciaDias" | "exclusividadDias" | "cortes"
  >
): Condicion[] {
  const condiciones: Condicion[] = [
    {
      clave: "etiqueta",
      titulo: "Etiqueta de publicidad obligatoria",
      descripcion:
        "Indica que es publicidad con la etiqueta de la red (por ejemplo, «Colaboración pagada») o con #Publicidad en el texto. Sin ella, la evidencia no se valida.",
    },
    {
      clave: "copy",
      titulo: "No edites el texto",
      descripcion:
        "Publica el texto, los hashtags, las menciones y el enlace tal como vienen en el contenido.",
    },
    {
      clave: "permanencia",
      titulo: `Mantén la publicación ${contar(oferta.permanenciaDias, "día", "días")}`,
      descripcion:
        "No la borres, ocultes ni archives antes de ese plazo: la verificación lo revisa.",
    },
  ]
  if (oferta.exclusividadDias) {
    condiciones.push({
      clave: "exclusividad",
      titulo: `Exclusividad por ${contar(oferta.exclusividadDias, "día", "días")}`,
      descripcion: `Durante la ventana de publicación y ${contar(oferta.exclusividadDias, "día", "días")} más, no podrás aceptar ofertas de otras marcas del mismo sector.`,
    })
  }
  if (oferta.cortes.length > 0) {
    condiciones.push({
      clave: "metricas",
      titulo: `Métricas a las ${textoCortes(oferta.cortes)}`,
      descripcion:
        "Después de publicar, carga las estadísticas de cada corte con una captura del panel de la red.",
    })
  }
  return condiciones
}

export interface PresentacionMultiplicador {
  clave: "calidad" | "geografico" | "exclusividad"
  etiqueta: string
  ayuda: string
}

export const MULTIPLICADORES: readonly PresentacionMultiplicador[] = [
  {
    clave: "calidad",
    etiqueta: "Calidad de tu cuenta",
    ayuda:
      "Sube o baja según el alcance de tus publicaciones verificadas frente a tu franja. Con pocas publicaciones verificadas vale 1.",
  },
  {
    clave: "geografico",
    etiqueta: "Pertinencia geográfica",
    ayuda: "Premia que tu audiencia esté en el territorio de la oferta.",
  },
  {
    clave: "exclusividad",
    etiqueta: "Exclusividad",
    ayuda:
      "Recargo porque te comprometes a no publicar para la competencia en esas fechas.",
  },
]

/** Motivos frecuentes de «No me interesa» (un toque llena el campo). */
export const SUGERENCIAS_NO_ME_INTERESA: readonly string[] = [
  "El pago no me alcanza para este trabajo.",
  "No encaja con mi audiencia.",
  "No tengo espacio para publicar en esas fechas.",
  "No trabajo con esta marca o este sector.",
]

// ── ¿Se puede aceptar ahora? (MED-010) ───────────────────────────────────────

export type DisponibilidadAceptar =
  | {
      tipo: "disponible"
      /** Cuentas con cupo y pago calculado (al menos una). */
      cuentas: CuentaCotizada[]
      /** Cupos que ya tiene en la oferta (si admite varios). */
      previas: AsignacionEnOferta[]
    }
  | { tipo: "aceptada"; asignacion: AsignacionEnOferta }
  | {
      tipo: "no_disponible"
      titulo: string
      motivo: string
      /** Pantalla donde se resuelve o se entiende (p. ej. Mis campañas). */
      enlace: EnlaceError | null
    }

const ABIERTAS: ReadonlySet<EstadoOferta> = new Set([
  "PUBLICADA",
  "EN_EJECUCION",
])

const MOTIVO_POR_ESTADO: Partial<Record<EstadoOferta, string>> = {
  CUPOS_COMPLETOS: "Se tomaron todos sus cupos.",
  VENCIDA: "Su plazo terminó.",
  CERRADA: "Su plazo terminó.",
  CANCELADA: "El anunciante la canceló.",
}

function noDisponible(
  titulo: string,
  motivo: string,
  enlace: EnlaceError | null = null
): DisponibilidadAceptar {
  return { tipo: "no_disponible", titulo, motivo, enlace }
}

/**
 * Si el medio puede aceptar la oferta en este instante y con qué cuentas.
 * La BD vuelve a comprobarlo todo al reservar; esto evita ofrecer un botón
 * que solo puede fallar y explica por qué.
 */
export function disponibilidadAceptar(
  detalle: Pick<
    DetalleOfertaMedio,
    | "estado"
    | "permiteMultiplesCupos"
    | "fechaLimiteAceptacion"
    | "ventanaFin"
    | "plataforma"
    | "cuentas"
    | "asignaciones"
    | "chocaExclusividad"
  >,
  ahora: Date
): DisponibilidadAceptar {
  const [ultima] = detalle.asignaciones
  if (ultima && !detalle.permiteMultiplesCupos) {
    return { tipo: "aceptada", asignacion: ultima }
  }
  const cerrada = "Esta oferta ya no recibe aceptaciones"
  if (!ABIERTAS.has(detalle.estado)) {
    return noDisponible(
      cerrada,
      MOTIVO_POR_ESTADO[detalle.estado] ?? "Ya no está publicada."
    )
  }
  const instante = ahora.getTime()
  if (instante >= new Date(detalle.fechaLimiteAceptacion).getTime()) {
    return noDisponible(
      "Cerró la aceptación",
      `La fecha límite para aceptar fue el ${formatearFechaHora(detalle.fechaLimiteAceptacion)}.`
    )
  }
  if (instante >= new Date(detalle.ventanaFin).getTime()) {
    return noDisponible(cerrada, "Su ventana de publicación terminó.")
  }
  if (detalle.cuentas.length === 0) {
    return noDisponible(
      "No puedes aceptar esta oferta",
      `Ninguna de tus cuentas de ${PLATAFORMAS[detalle.plataforma]} cumple sus requisitos (verificación vigente y seguidores).`
    )
  }
  const conCupo = detalle.cuentas.filter((cuenta) => cuenta.cuposRestantes > 0)
  if (conCupo.length === 0) {
    return noDisponible(
      "No quedan cupos en tu franja",
      "Otro medio tomó el último cupo de tu franja."
    )
  }
  // Con cualquier cuenta la reserva respondería `AMO_EXCLUSIVIDAD`: se dice
  // igual que ese error. Antes que la tarifa: aunque la configuren, no podría
  // aceptarla.
  if (detalle.chocaExclusividad) {
    return noDisponible(
      CHOQUE_EXCLUSIVIDAD.titulo,
      CHOQUE_EXCLUSIVIDAD.mensaje,
      CHOQUE_EXCLUSIVIDAD.enlace
    )
  }
  const cotizadas = conCupo.filter((cuenta) => cuenta.cotizacion !== null)
  if (cotizadas.length === 0) {
    return noDisponible(
      "Aún no podemos calcular tu pago",
      conCupo[0]?.aviso ??
        "Falta la tarifa de este formato para tu franja. El equipo AMO debe configurarla."
    )
  }
  return {
    tipo: "disponible",
    cuentas: cotizadas,
    previas: detalle.asignaciones,
  }
}

// ── Topes: anual del nivel (MED-007) y del medio en la campaña ───────────────

/**
 * `nivel`: lo que su nivel de verificación permite recibir en el año;
 * `campana`: la participación máxima de un medio en la campaña.
 */
export type Tope = "nivel" | "campana"

export interface ConsumoTopeMedio {
  /** Lo que ya recibe este año en asignaciones que siguen en pie. */
  consumido: number
  /** `null`: su nivel no tiene tope. */
  tope: number | null
  /** Fracciones del tope del nivel (0,8 y 0,95 por defecto). */
  alerta: number
  bloqueo: number
}

export interface AvisoTope {
  /**
   * `bloqueo`: la BD rechazará la aceptación (`AMO_TOPE_NIVEL` o
   * `AMO_TOPE_MEDIO`).
   */
  tipo: "alerta" | "bloqueo"
  tope: Tope
  titulo: string
  mensaje: string
  /**
   * Consumo del tope que tendría si acepta (0,86 = 86 %); `null` si solo se
   * sabe porque la BD ya rechazó ese pago.
   */
  fraccion: number | null
}

const TITULO_BLOQUEO_TOPE = "Superarías el tope anual de tu nivel"

function avisoPorConsumo(
  consumo: ConsumoTopeMedio | null,
  monto: number
): AvisoTope | null {
  if (!consumo || consumo.tope === null || !(consumo.tope > 0)) return null
  const total = Math.max(0, consumo.consumido) + Math.max(0, monto)
  const fraccion = total / consumo.tope
  const porcentaje = formatearPorcentaje(fraccion, 0)
  if (total > consumo.bloqueo * consumo.tope) {
    return {
      tipo: "bloqueo",
      tope: "nivel",
      titulo: TITULO_BLOQUEO_TOPE,
      mensaje: `Con esta oferta llegarías al ${porcentaje} de lo que tu nivel de verificación permite recibir este año. Sube de nivel para poder aceptarla.`,
      fraccion,
    }
  }
  if (fraccion >= consumo.alerta) {
    return {
      tipo: "alerta",
      tope: "nivel",
      titulo: "Cerca del tope",
      mensaje: `Con esta oferta llegarías al ${porcentaje} del tope anual de tu nivel. Puedes aceptarla; para seguir recibiendo ofertas después, sube de nivel.`,
      fraccion,
    }
  }
  return null
}

/**
 * ¿Aceptar con este pago lo acerca al tope anual de su nivel? Mismas reglas
 * que la reserva: bloquea si lo consumido más este pago supera el umbral de
 * bloqueo; avisa «Cerca del tope» desde el umbral de alerta.
 *
 * `rechazadoDesde` es el menor pago que la BD ya rechazó en esta ficha con
 * `AMO_TOPE_NIVEL` (el consumo leído al abrirla puede estar desfasado):
 * cualquier pago igual o mayor también lo supera.
 */
export function avisoTope(
  consumo: ConsumoTopeMedio | null,
  monto: number | null,
  rechazadoDesde: number | null = null
): AvisoTope | null {
  if (monto === null || !Number.isFinite(monto)) return null
  const aviso = avisoPorConsumo(consumo, monto)
  if (aviso?.tipo !== "bloqueo" && rechazadoDesde !== null) {
    if (monto >= rechazadoDesde) {
      return {
        tipo: "bloqueo",
        tope: "nivel",
        titulo: TITULO_BLOQUEO_TOPE,
        mensaje:
          "Con este pago superarías lo que tu nivel de verificación permite recibir este año. Sube de nivel para poder aceptarla.",
        fraccion: aviso?.fraccion ?? null,
      }
    }
  }
  return aviso
}

/**
 * Con el pago de la cuenta superaría la participación máxima de un medio en
 * la campaña (`impedimentos_aceptar`): la reserva respondería
 * `AMO_TOPE_MEDIO`. Solo bloquea; no hay umbral de alerta.
 */
const AVISO_TOPE_CAMPANA: AvisoTope = {
  tipo: "bloqueo",
  tope: "campana",
  titulo: "Superarías la participación máxima de un medio en esta campaña",
  mensaje:
    "Cada medio puede llevarse solo una parte del presupuesto de una campaña, y con el pago de esta cuenta la superarías.",
  fraccion: null,
}

type CuentaConTopes = Pick<CuentaCotizada, "cotizacion" | "superaTopeCampana">

/**
 * El aviso de una cuenta: si con ella superaría la participación máxima del
 * medio en la campaña, ese (la reserva lo comprueba antes que el tope
 * anual); si no, el del tope anual de su nivel con su pago.
 */
export function avisoCuenta(
  cuenta: CuentaConTopes | null,
  consumo: ConsumoTopeMedio | null,
  rechazadoDesde: number | null = null
): AvisoTope | null {
  if (!cuenta) return null
  if (cuenta.superaTopeCampana) return AVISO_TOPE_CAMPANA
  return avisoTope(
    consumo,
    cuenta.cotizacion?.montoMedio ?? null,
    rechazadoDesde
  )
}

/** El tope que superaría con esta cuenta, o `null` si cabe en los dos. */
export function topeSuperado(
  cuenta: CuentaConTopes,
  consumo: ConsumoTopeMedio | null,
  rechazadoDesde: number | null = null
): Tope | null {
  const aviso = avisoCuenta(cuenta, consumo, rechazadoDesde)
  return aviso?.tipo === "bloqueo" ? aviso.tope : null
}

/**
 * ¿Con esta cuenta puede aceptar sin superar la participación máxima del
 * medio en la campaña ni el tope anual de su nivel?
 */
export function cabeEnTope(
  cuenta: CuentaConTopes,
  consumo: ConsumoTopeMedio | null,
  rechazadoDesde: number | null = null
): boolean {
  return topeSuperado(cuenta, consumo, rechazadoDesde) === null
}

/** Lo que dice la opción de una cuenta con la que superaría un tope. */
export const FUERA_DE_TOPE: Readonly<Record<Tope, string>> = {
  nivel: "Con esta cuenta superarías el tope anual de tu nivel.",
  campana:
    "Con esta cuenta superarías la participación máxima de un medio en esta campaña.",
}

/**
 * Cuenta elegida por defecto: la que más paga entre las disponibles que
 * caben en los topes (si ninguna cabe, la que más paga); si el medio ya
 * había elegido una que sigue disponible, esa.
 */
export function cuentaPorDefecto(
  cuentas: readonly CuentaCotizada[],
  elegida?: string | null,
  cabe: (cuenta: CuentaCotizada) => boolean = () => true
): CuentaCotizada | null {
  const previa = cuentas.find((cuenta) => cuenta.cuentaSocialId === elegida)
  if (previa) return previa
  const porPago = [...cuentas].sort(
    (a, b) =>
      (b.cotizacion?.montoMedio ?? -1) - (a.cotizacion?.montoMedio ?? -1)
  )
  return porPago.find(cabe) ?? porPago[0] ?? null
}

/**
 * Otra cuenta con la que sí puede aceptar cuando la elegida superaría un
 * tope (la que más paga entre las que caben en los dos), o `null`.
 */
export function otraCuentaEnTope(
  cuentas: readonly CuentaCotizada[],
  elegida: CuentaCotizada | null,
  cabe: (cuenta: CuentaCotizada) => boolean
): CuentaCotizada | null {
  return cuentaPorDefecto(
    cuentas.filter(
      (cuenta) =>
        cuenta.cuentaSocialId !== elegida?.cuentaSocialId && cabe(cuenta)
    )
  )
}

// ── Aceptación hecha (MED-010) ───────────────────────────────────────────────

export interface AvisoAceptada {
  titulo: string
  descripcion: string
  /** El pago congelado no es el que se mostró al confirmar. */
  cambioElPago: boolean
}

/**
 * Aviso tras aceptar. La reserva recalcula el pago al congelarlo: si cambió
 * desde que se pintó la ficha (un multiplicador programado o una tarifa nueva
 * entraron mientras decidía), lo dice con el monto real y recuerda que puede
 * desistir. Se comparan los montos como los ve el medio (pesos redondeados).
 */
export function avisoAceptada({
  mostrado,
  congelado,
  ventanaFin,
}: {
  mostrado: number | null
  congelado: number | null
  ventanaFin: string
}): AvisoAceptada {
  const plazo = `Descarga el contenido y publícalo antes del ${formatearFechaHora(ventanaFin)}.`
  const cambioElPago =
    mostrado !== null &&
    congelado !== null &&
    formatearCOP(mostrado) !== formatearCOP(congelado)
  if (!cambioElPago) {
    return { titulo: "¡Aceptaste la oferta!", descripcion: plazo, cambioElPago }
  }
  return {
    titulo: "¡Aceptaste la oferta!",
    descripcion: `Tu pago quedó congelado en ${formatearCOP(congelado)}, no en ${formatearCOP(mostrado)}: el cálculo se actualizó mientras decidías. Si ya no te conviene, puedes desistir antes de descargar el contenido. ${plazo}`,
    cambioElPago,
  }
}
