/**
 * Lógica pura de la prueba de carrera de cupos (docs/modelo-datos.md §5.7):
 * clasificación de los resultados de una ráfaga de `reservar_cupo_srv` y los
 * invariantes que deben cumplir contadores, presupuestos y topes después.
 */

/** Estados de asignación que ocupan cupo (`private.estados_con_cupo()`). */
const ESTADOS_CON_CUPO = new Set([
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
  "EN_DISPUTA",
])

/** Réplica de `private.consume_cupo(estado, previo)`. */
export function consumeCupo(estado: string, previo: string | null): boolean {
  return (
    ESTADOS_CON_CUPO.has(estado) &&
    !(estado === "EN_DISPUTA" && previo === "VENCIDA_SIN_PUBLICAR")
  )
}

/** Error de PostgREST tal como lo entrega supabase-js. */
export interface ErrorRpc {
  code: string
  message: string
}

/** `AMO_*` para los errores de negocio (P0001) y el SQLSTATE para el resto. */
export function codigoDeError(error: ErrorRpc): string {
  return error.code === "P0001" ? error.message : `SQLSTATE_${error.code}`
}

export const CODIGO_DEADLOCK = "SQLSTATE_40P01"

export interface IntentoReserva {
  asignacionId: string | null
  error: ErrorRpc | null
}

export interface ResumenRafaga {
  exitos: number
  /** Asignaciones distintas devueltas (una reserva idempotente repite id). */
  asignaciones: string[]
  errores: Record<string, number>
  deadlocks: number
}

export function resumirRafaga(
  intentos: readonly IntentoReserva[]
): ResumenRafaga {
  const errores: Record<string, number> = {}
  const asignaciones = new Set<string>()
  let exitos = 0
  for (const intento of intentos) {
    if (intento.error) {
      const codigo = codigoDeError(intento.error)
      errores[codigo] = (errores[codigo] ?? 0) + 1
    } else if (intento.asignacionId) {
      exitos += 1
      asignaciones.add(intento.asignacionId)
    }
  }
  return {
    exitos,
    asignaciones: [...asignaciones],
    errores,
    deadlocks: errores[CODIGO_DEADLOCK] ?? 0,
  }
}

/** Errores que no son ni éxito ni uno de los rechazos esperados del escenario. */
export function erroresInesperados(
  resumen: ResumenRafaga,
  esperados: readonly string[]
): string[] {
  return Object.keys(resumen.errores).filter(
    (codigo) => !esperados.includes(codigo)
  )
}

export interface CampanaFila {
  id: string
  presupuesto_total: number
  presupuesto_comprometido: number
}

export interface OfertaFila {
  id: string
  estado: string
  presupuesto_maximo: number
  presupuesto_comprometido: number
  cupos_totales: number
  cupos_ocupados: number
  tope_porcentaje_por_medio: number
  ventana_inicio: string
  fecha_limite_aceptacion: string
}

export interface CupoFila {
  oferta_id: string
  franja_id: string
  cupos_totales: number
  cupos_ocupados: number
}

export interface AsignacionFila {
  id: string
  oferta_id: string
  medio_id: string
  franja_id: string | null
  estado: string
  estado_previo_disputa: string | null
  monto_bruto: number | null
  aceptada_at: string | null
}

/** Estado de la campaña tras una ráfaga (lo lee el script con la secret key). */
export interface Instantanea {
  campana: CampanaFila
  ofertas: OfertaFila[]
  cupos: CupoFila[]
  asignaciones: AsignacionFila[]
  /** `asignacion_id` de las filas de `asignacion_montos`. */
  montos: string[]
  /** Instante de la lectura (ms), para el estado esperado de la oferta. */
  leidaEn: number
}

/** Dinero en centavos enteros: evita comparar sumas de decimales binarios. */
function centavos(valor: number | null): number {
  return Math.round((valor ?? 0) * 100)
}

function sumaCentavos(filas: readonly AsignacionFila[]): number {
  return filas.reduce((total, fila) => total + centavos(fila.monto_bruto), 0)
}

function consumen(filas: readonly AsignacionFila[]): AsignacionFila[] {
  return filas.filter((fila) =>
    consumeCupo(fila.estado, fila.estado_previo_disputa)
  )
}

function violacionesCupos(inst: Instantanea): string[] {
  const activas = consumen(inst.asignaciones)
  return inst.cupos.flatMap((cupo) => {
    const ocupados = activas.filter(
      (a) => a.oferta_id === cupo.oferta_id && a.franja_id === cupo.franja_id
    ).length
    const etiqueta = `oferta_cupos(${cupo.oferta_id}, ${cupo.franja_id})`
    const fallas: string[] = []
    if (cupo.cupos_ocupados !== ocupados) {
      fallas.push(
        `${etiqueta}.cupos_ocupados = ${cupo.cupos_ocupados}, asignaciones con cupo = ${ocupados}`
      )
    }
    if (cupo.cupos_ocupados > cupo.cupos_totales) {
      fallas.push(
        `${etiqueta} supera sus cupos (${cupo.cupos_ocupados}/${cupo.cupos_totales})`
      )
    }
    return fallas
  })
}

/** Una oferta llena antes de su ventana queda en CUPOS_COMPLETOS; si se libera un cupo, vuelve a PUBLICADA. */
export function estadoEsperadoOferta(
  oferta: OfertaFila,
  leidaEn: number
): string | null {
  if (!["PUBLICADA", "CUPOS_COMPLETOS"].includes(oferta.estado)) return null
  const antesDeVentana =
    leidaEn < Date.parse(oferta.ventana_inicio) &&
    leidaEn < Date.parse(oferta.fecha_limite_aceptacion)
  if (!antesDeVentana) return null
  return oferta.cupos_ocupados >= oferta.cupos_totales
    ? "CUPOS_COMPLETOS"
    : "PUBLICADA"
}

function violacionesOfertas(inst: Instantanea): string[] {
  const activas = consumen(inst.asignaciones)
  return inst.ofertas.flatMap((oferta) => {
    const cupos = inst.cupos.filter((c) => c.oferta_id === oferta.id)
    const propias = activas.filter((a) => a.oferta_id === oferta.id)
    const etiqueta = `ofertas(${oferta.id})`
    const fallas: string[] = []
    const ocupados = cupos.reduce((t, c) => t + c.cupos_ocupados, 0)
    const totales = cupos.reduce((t, c) => t + c.cupos_totales, 0)
    if (oferta.cupos_ocupados !== ocupados) {
      fallas.push(
        `${etiqueta}.cupos_ocupados = ${oferta.cupos_ocupados}, Σ oferta_cupos = ${ocupados}`
      )
    }
    if (oferta.cupos_totales !== totales) {
      fallas.push(
        `${etiqueta}.cupos_totales = ${oferta.cupos_totales}, Σ oferta_cupos = ${totales}`
      )
    }
    if (centavos(oferta.presupuesto_comprometido) !== sumaCentavos(propias)) {
      fallas.push(
        `${etiqueta}.presupuesto_comprometido = ${oferta.presupuesto_comprometido}, Σ monto_bruto = ${sumaCentavos(propias) / 100}`
      )
    }
    if (
      centavos(oferta.presupuesto_comprometido) >
      centavos(oferta.presupuesto_maximo)
    ) {
      fallas.push(`${etiqueta} supera su presupuesto máximo`)
    }
    const esperado = estadoEsperadoOferta(oferta, inst.leidaEn)
    if (esperado && esperado !== oferta.estado) {
      fallas.push(
        `${etiqueta}.estado = ${oferta.estado}, se esperaba ${esperado}`
      )
    }
    return fallas
  })
}

function violacionesCampana(inst: Instantanea): string[] {
  const activas = consumen(inst.asignaciones)
  const { campana } = inst
  const fallas: string[] = []
  if (centavos(campana.presupuesto_comprometido) !== sumaCentavos(activas)) {
    fallas.push(
      `campanas.presupuesto_comprometido = ${campana.presupuesto_comprometido}, Σ monto_bruto = ${sumaCentavos(activas) / 100}`
    )
  }
  if (
    centavos(campana.presupuesto_comprometido) >
    centavos(campana.presupuesto_total)
  ) {
    fallas.push("la campaña supera su presupuesto total")
  }
  return fallas
}

/** Tope % por medio (§7.2.3 bis): Σ bruto del medio en la campaña ≤ tope × presupuesto total. */
function violacionesTope(inst: Instantanea): string[] {
  if (inst.ofertas.length === 0) return []
  const tope = Math.max(...inst.ofertas.map((o) => o.tope_porcentaje_por_medio))
  const limite = Math.round(tope * centavos(inst.campana.presupuesto_total))
  const porMedio = new Map<string, AsignacionFila[]>()
  for (const fila of consumen(inst.asignaciones)) {
    porMedio.set(fila.medio_id, [...(porMedio.get(fila.medio_id) ?? []), fila])
  }
  return [...porMedio.entries()]
    .filter(([, filas]) => sumaCentavos(filas) > limite)
    .map(
      ([medio, filas]) =>
        `medio ${medio}: ${sumaCentavos(filas) / 100} supera el tope ${limite / 100}`
    )
}

function violacionesMontos(inst: Instantanea): string[] {
  const conMontos = new Set(inst.montos)
  return inst.asignaciones
    .filter((a) => a.aceptada_at !== null && !conMontos.has(a.id))
    .map((a) => `asignación ${a.id} aceptada sin fila en asignacion_montos`)
}

/** Lista de invariantes rotos (vacía si todo cuadra). */
export function verificarInvariantes(inst: Instantanea): string[] {
  return [
    ...violacionesCupos(inst),
    ...violacionesOfertas(inst),
    ...violacionesCampana(inst),
    ...violacionesTope(inst),
    ...violacionesMontos(inst),
  ]
}

/** `session_id` del JWT de Supabase Auth (el que revalida `private.sesion_valida`). */
export function sessionIdDeToken(token: string): string {
  const partes = token.split(".")
  if (partes.length !== 3) throw new Error("El token de acceso no es un JWT.")
  const carga: unknown = JSON.parse(
    Buffer.from(partes[1], "base64url").toString("utf8")
  )
  if (
    carga &&
    typeof carga === "object" &&
    "session_id" in carga &&
    typeof carga.session_id === "string"
  ) {
    return carga.session_id
  }
  throw new Error("El token de acceso no trae session_id.")
}
