/**
 * Línea de tiempo y progreso de una asignación (módulo puro). Une dos
 * fuentes: los instantes de transición que la BD guarda en la propia fila
 * (siempre visibles para quien ve la asignación) y las transiciones de la
 * bitácora (con actor y motivo; solo con `auditoria.ver`). Cuando ambas
 * describen el mismo paso, gana la bitácora, que tiene más contexto.
 */
import {
  CORTES,
  type Corte,
  ESTADOS_ASIGNACION,
  type EstadoAsignacion,
  type EstadoValidacion,
  FLUJO_ASIGNACION,
  MOTIVOS_DISPUTA,
  PARTES_DISPUTA,
  type Tono,
} from "./estados"

/** Instantes de transición de la fila (`asignaciones.*_at`). */
export interface MarcasAsignacion {
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  creadaAt: string
  aceptadaAt: string | null
  contenidoDescargadoAt: string | null
  publicadaAt: string | null
  evidenciaValidadaAt: string | null
  metricasCargadasAt: string | null
  verificadaAt: string | null
  liquidadaAt: string | null
  pagadaAt: string | null
  rechazadaAt: string | null
  vencidaAt: string | null
  enDisputaAt: string | null
  canceladaAt: string | null
}

/** Transición registrada en la bitácora (`accion = 'TRANSICION'`). */
export interface TransicionRegistrada {
  id: number
  at: string
  desde: string | null
  hacia: string | null
  /** Correo enmascarado o nombre del actor; `null` = el sistema. */
  actor: string | null
  actorRol: string | null
  motivo: string | null
}

export interface ValidacionRegistrada {
  id: string
  /** Número de la publicación (1..n). */
  numero: number
  creadaAt: string
  estado: EstadoValidacion
  validadaAt: string | null
  observaciones: string | null
}

export interface MetricaRegistrada extends ValidacionRegistrada {
  corte: Corte
  conAlerta: boolean
}

export interface DisputaRegistrada {
  id: string
  creadaAt: string
  motivo: keyof typeof MOTIVOS_DISPUTA
  parte: keyof typeof PARTES_DISPUTA
  estado: "ABIERTA" | "EN_REVISION" | "RESUELTA" | "DESCARTADA"
  resueltaAt: string | null
  resolucion: string | null
}

export type CategoriaEvento = "estado" | "evidencia" | "metrica" | "disputa"

export interface EventoLineaTiempo {
  id: string
  at: string
  categoria: CategoriaEvento
  titulo: string
  detalle: string | null
  tono: Tono
  /** Estado al que llevó el evento, si es una transición. */
  estado: EstadoAsignacion | null
  actor: string | null
  /** De dónde sale: con actor (bitácora) o solo con la fecha (registro). */
  fuente: "bitacora" | "registro"
}

// ── Textos de cada transición ────────────────────────────────────────────────

const TITULOS_ESTADO: Readonly<Record<EstadoAsignacion, string>> = {
  ACEPTADA: "El medio aceptó el cupo",
  CONTENIDO_ENTREGADO: "El medio descargó el contenido",
  PUBLICADA: "El medio cargó la evidencia de publicación",
  EVIDENCIA_VALIDADA: "AMO validó la evidencia",
  METRICAS_CARGADAS: "Cortes de métricas completos",
  VERIFICADA: "Asignación verificada",
  LIQUIDADA: "Incluida en una liquidación",
  PAGADA: "Pagada al medio",
  RECHAZADA: "El medio rechazó el cupo",
  VENCIDA_SIN_PUBLICAR: "Venció sin publicar",
  EN_DISPUTA: "Se abrió una disputa",
  CANCELADA: "AMO canceló la asignación",
}

/** Retrocesos con nombre propio (docs/modelo-datos.md §4.2). */
function tituloRetroceso(desde: string, hacia: string): string | null {
  if (desde === "PUBLICADA" && hacia === "CONTENIDO_ENTREGADO")
    return "AMO rechazó la evidencia"
  if (desde === "METRICAS_CARGADAS" && hacia === "EVIDENCIA_VALIDADA")
    return "AMO rechazó las métricas"
  if (desde === "LIQUIDADA" && hacia === "VERIFICADA")
    return "Se anuló la liquidación"
  if (desde === "EN_DISPUTA") {
    const destino = esEstado(hacia) ? ESTADOS_ASIGNACION[hacia].etiqueta : hacia
    return `Disputa resuelta: pasa a «${destino.toLocaleLowerCase("es-CO")}»`
  }
  return null
}

function tonoDeTransicion(desde: string | null, hacia: EstadoAsignacion): Tono {
  if (desde && desde !== "EN_DISPUTA" && tituloRetroceso(desde, hacia)) {
    return "peligro"
  }
  return ESTADOS_ASIGNACION[hacia].tono
}

function esEstado(valor: string | null): valor is EstadoAsignacion {
  return valor !== null && valor in ESTADOS_ASIGNACION
}

// ── Eventos de estado ────────────────────────────────────────────────────────

const COLUMNAS_MARCA: readonly [EstadoAsignacion, keyof MarcasAsignacion][] = [
  ["ACEPTADA", "aceptadaAt"],
  ["CONTENIDO_ENTREGADO", "contenidoDescargadoAt"],
  ["PUBLICADA", "publicadaAt"],
  ["EVIDENCIA_VALIDADA", "evidenciaValidadaAt"],
  ["METRICAS_CARGADAS", "metricasCargadasAt"],
  ["VERIFICADA", "verificadaAt"],
  ["LIQUIDADA", "liquidadaAt"],
  ["PAGADA", "pagadaAt"],
  ["RECHAZADA", "rechazadaAt"],
  ["VENCIDA_SIN_PUBLICAR", "vencidaAt"],
  ["EN_DISPUTA", "enDisputaAt"],
  ["CANCELADA", "canceladaAt"],
]

/** Dos registros del mismo paso a menos de 5 minutos son el mismo hecho. */
const TOLERANCIA_MS = 5 * 60_000

function mismoMomento(a: string, b: string): boolean {
  return (
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= TOLERANCIA_MS
  )
}

/** Evento de estado con el estado del que salió (solo para armar la línea). */
type EventoDeEstado = EventoLineaTiempo & { desde: string | null }

function eventosDeBitacora(
  transiciones: readonly TransicionRegistrada[]
): EventoDeEstado[] {
  return transiciones.flatMap((transicion) => {
    if (!esEstado(transicion.hacia)) return []
    const hacia = transicion.hacia
    const retroceso = transicion.desde
      ? tituloRetroceso(transicion.desde, hacia)
      : null
    return [
      {
        desde: transicion.desde,
        id: `bitacora-${transicion.id}`,
        at: transicion.at,
        categoria: "estado" as const,
        titulo: retroceso ?? TITULOS_ESTADO[hacia],
        detalle: transicion.motivo,
        tono: tonoDeTransicion(transicion.desde, hacia),
        estado: hacia,
        actor: transicion.actor
          ? `${transicion.actor}${transicion.actorRol ? ` · ${transicion.actorRol}` : ""}`
          : null,
        fuente: "bitacora" as const,
      },
    ]
  })
}

function eventosDeMarcas(
  marcas: MarcasAsignacion,
  registradas: readonly EventoLineaTiempo[]
): EventoDeEstado[] {
  const eventos: EventoDeEstado[] = []
  for (const [estado, columna] of COLUMNAS_MARCA) {
    const at = marcas[columna]
    if (typeof at !== "string") continue
    const yaRegistrado = registradas.some(
      (evento) => evento.estado === estado && mismoMomento(evento.at, at)
    )
    if (yaRegistrado) continue
    eventos.push({
      desde: null,
      id: `marca-${estado}`,
      at,
      categoria: "estado",
      titulo:
        estado === "RECHAZADA" && !marcas.aceptadaAt
          ? "El medio rechazó la oferta en el marketplace"
          : TITULOS_ESTADO[estado],
      detalle: null,
      tono: tonoDeTransicion(null, estado),
      estado,
      actor: null,
      fuente: "registro",
    })
  }
  // Rechazo desde el marketplace: la fila nace RECHAZADA y no guarda instante propio.
  if (
    marcas.estado === "RECHAZADA" &&
    !marcas.rechazadaAt &&
    !marcas.aceptadaAt &&
    !registradas.some((evento) => evento.estado === "RECHAZADA")
  ) {
    eventos.push({
      desde: null,
      id: "marca-RECHAZADA",
      at: marcas.creadaAt,
      categoria: "estado",
      titulo: "El medio rechazó la oferta en el marketplace",
      detalle: null,
      tono: "neutro",
      estado: "RECHAZADA",
      actor: null,
      fuente: "registro",
    })
  }
  return eventos
}

// ── Evidencias, métricas y disputas ──────────────────────────────────────────

function eventosDeValidaciones(
  publicaciones: readonly ValidacionRegistrada[],
  metricas: readonly MetricaRegistrada[],
  conVariasPublicaciones: boolean
): EventoLineaTiempo[] {
  const eventos: EventoLineaTiempo[] = []
  const sufijo = (numero: number) =>
    conVariasPublicaciones ? ` (publicación ${numero})` : ""

  for (const publicacion of publicaciones) {
    if (publicacion.estado === "RECHAZADA" && publicacion.validadaAt) {
      eventos.push({
        id: `publicacion-${publicacion.id}-rechazo`,
        at: publicacion.validadaAt,
        categoria: "evidencia",
        titulo: `Evidencia rechazada${sufijo(publicacion.numero)}`,
        detalle: publicacion.observaciones,
        tono: "peligro",
        estado: null,
        actor: null,
        fuente: "registro",
      })
    }
  }

  for (const metrica of metricas) {
    const corte = CORTES[metrica.corte].etiqueta
    eventos.push({
      id: `metrica-${metrica.id}`,
      at: metrica.creadaAt,
      categoria: "metrica",
      titulo: `Métricas de ${corte} cargadas${sufijo(metrica.numero)}`,
      detalle: metrica.conAlerta
        ? "Con alerta de integridad: revisar antes de validar."
        : null,
      tono: metrica.conAlerta ? "aviso" : "neutro",
      estado: null,
      actor: null,
      fuente: "registro",
    })
    if (metrica.estado === "RECHAZADA" && metrica.validadaAt) {
      eventos.push({
        id: `metrica-${metrica.id}-rechazo`,
        at: metrica.validadaAt,
        categoria: "metrica",
        titulo: `Métricas de ${corte} rechazadas${sufijo(metrica.numero)}`,
        detalle: metrica.observaciones,
        tono: "peligro",
        estado: null,
        actor: null,
        fuente: "registro",
      })
    }
  }
  return eventos
}

const SUFIJO_CIERRE = "-cierre"

function eventosDeDisputas(
  disputas: readonly DisputaRegistrada[]
): EventoLineaTiempo[] {
  return disputas.flatMap((disputa) => {
    const abierta: EventoLineaTiempo = {
      id: `disputa-${disputa.id}`,
      at: disputa.creadaAt,
      categoria: "disputa",
      titulo: `Disputa por ${MOTIVOS_DISPUTA[disputa.motivo].toLocaleLowerCase("es-CO")}`,
      detalle: `Abierta por ${PARTES_DISPUTA[disputa.parte]}.`,
      tono: "aviso",
      estado: null,
      actor: null,
      fuente: "registro",
    }
    if (!disputa.resueltaAt) return [abierta]
    return [
      abierta,
      {
        id: `disputa-${disputa.id}${SUFIJO_CIERRE}`,
        at: disputa.resueltaAt,
        categoria: "disputa",
        titulo:
          disputa.estado === "DESCARTADA"
            ? "Disputa descartada"
            : "Disputa resuelta",
        detalle: disputa.resolucion,
        tono: disputa.estado === "DESCARTADA" ? "neutro" : "exito",
        estado: null,
        actor: null,
        fuente: "registro",
      },
    ]
  })
}

/**
 * Abrir o cerrar una disputa deja dos registros del mismo hecho: la disputa y
 * el cambio de estado de la asignación. Se cuentan una sola vez: con el texto
 * de la disputa (motivo, parte, resolución) y el actor de la transición.
 */
function fusionarDisputas(
  estados: readonly EventoDeEstado[],
  disputas: readonly EventoLineaTiempo[]
): EventoLineaTiempo[] {
  const absorbidos = new Set<string>()
  const fusionadas = disputas.map((disputa): EventoLineaTiempo => {
    const esCierre = disputa.id.endsWith(SUFIJO_CIERRE)
    const transicion = estados.find(
      (evento) =>
        !absorbidos.has(evento.id) &&
        mismoMomento(evento.at, disputa.at) &&
        (esCierre
          ? evento.desde === "EN_DISPUTA"
          : evento.estado === "EN_DISPUTA")
    )
    if (!transicion) return disputa
    absorbidos.add(transicion.id)
    const destino =
      esCierre && transicion.estado
        ? `: pasa a «${ESTADOS_ASIGNACION[transicion.estado].etiqueta.toLocaleLowerCase("es-CO")}»`
        : ""
    return {
      ...disputa,
      titulo: `${disputa.titulo}${destino}`,
      detalle: disputa.detalle ?? transicion.detalle,
      estado: transicion.estado,
      actor: transicion.actor,
      fuente: transicion.fuente,
    }
  })
  return [
    ...estados
      .filter((evento) => !absorbidos.has(evento.id))
      .map(({ desde: _desde, ...evento }) => evento),
    ...fusionadas,
  ]
}

export interface FuentesLineaTiempo {
  marcas: MarcasAsignacion
  transiciones?: readonly TransicionRegistrada[]
  publicaciones?: readonly ValidacionRegistrada[]
  metricas?: readonly MetricaRegistrada[]
  disputas?: readonly DisputaRegistrada[]
}

/** Eventos de la asignación en orden cronológico (del primero al último). */
export function construirLineaTiempo({
  marcas,
  transiciones = [],
  publicaciones = [],
  metricas = [],
  disputas = [],
}: FuentesLineaTiempo): EventoLineaTiempo[] {
  const deBitacora = eventosDeBitacora(transiciones)
  const variasPublicaciones =
    new Set(publicaciones.map((publicacion) => publicacion.numero)).size > 1
  return [
    ...fusionarDisputas(
      [...deBitacora, ...eventosDeMarcas(marcas, deBitacora)],
      eventosDeDisputas(disputas)
    ),
    ...eventosDeValidaciones(publicaciones, metricas, variasPublicaciones),
  ].sort(
    (a, b) =>
      new Date(a.at).getTime() - new Date(b.at).getTime() ||
      a.id.localeCompare(b.id)
  )
}

// ── Progreso por el camino feliz ─────────────────────────────────────────────

export type SituacionPaso = "hecho" | "actual" | "pendiente" | "omitido"

export interface PasoProgreso {
  estado: EstadoAsignacion
  etiqueta: string
  at: string | null
  situacion: SituacionPaso
}

export interface Desenlace {
  estado: EstadoAsignacion
  etiqueta: string
  at: string | null
  tono: Tono
}

export interface Progreso {
  pasos: PasoProgreso[]
  /** Salida del camino feliz (caída o disputa en curso). */
  desenlace: Desenlace | null
}

const ETIQUETAS_PASO: Readonly<Partial<Record<EstadoAsignacion, string>>> = {
  ACEPTADA: "Aceptada",
  CONTENIDO_ENTREGADO: "Contenido",
  PUBLICADA: "Publicada",
  EVIDENCIA_VALIDADA: "Evidencia",
  METRICAS_CARGADAS: "Métricas",
  VERIFICADA: "Verificada",
  LIQUIDADA: "Liquidada",
  PAGADA: "Pagada",
}

function marcaDe(
  marcas: MarcasAsignacion,
  estado: EstadoAsignacion
): string | null {
  const columna = COLUMNAS_MARCA.find(([e]) => e === estado)?.[1]
  const valor = columna ? marcas[columna] : null
  return typeof valor === "string" ? valor : null
}

/** Último paso del camino feliz que la asignación alcanzó (por sus marcas). */
function ultimoPasoAlcanzado(marcas: MarcasAsignacion): number {
  let ultimo = -1
  FLUJO_ASIGNACION.forEach((estado, indice) => {
    if (marcaDe(marcas, estado)) ultimo = indice
  })
  return ultimo
}

export function calcularProgreso(marcas: MarcasAsignacion): Progreso {
  const enFlujo = FLUJO_ASIGNACION.indexOf(marcas.estado)
  const enDisputa = marcas.estado === "EN_DISPUTA"
  const caida = enFlujo === -1 && !enDisputa
  const previo = marcas.estadoPrevioDisputa
    ? FLUJO_ASIGNACION.indexOf(marcas.estadoPrevioDisputa)
    : -1
  const alcance =
    enFlujo >= 0
      ? enFlujo
      : enDisputa && previo >= 0
        ? previo
        : ultimoPasoAlcanzado(marcas)
  // El último paso del camino feliz (pagada) ya no tiene nada pendiente.
  const enCurso = enFlujo >= 0 && enFlujo < FLUJO_ASIGNACION.length - 1

  const pasos = FLUJO_ASIGNACION.map((estado, indice): PasoProgreso => {
    let situacion: SituacionPaso
    if (indice < alcance) situacion = "hecho"
    else if (indice === alcance) situacion = enCurso ? "actual" : "hecho"
    else situacion = caida ? "omitido" : "pendiente"
    return {
      estado,
      etiqueta: ETIQUETAS_PASO[estado] ?? ESTADOS_ASIGNACION[estado].etiqueta,
      at: indice <= alcance ? marcaDe(marcas, estado) : null,
      situacion,
    }
  })

  const desenlace: Desenlace | null =
    caida || enDisputa
      ? {
          estado: marcas.estado,
          etiqueta: ESTADOS_ASIGNACION[marcas.estado].etiqueta,
          at:
            marcaDe(marcas, marcas.estado) ??
            (marcas.estado === "RECHAZADA" ? marcas.creadaAt : null),
          tono: ESTADOS_ASIGNACION[marcas.estado].tono,
        }
      : null

  return { pasos, desenlace }
}
