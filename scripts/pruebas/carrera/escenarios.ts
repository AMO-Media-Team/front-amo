/**
 * Escenarios de la prueba de carrera (docs/modelo-datos.md §5.7). Cada uno
 * prepara su campaña, dispara una ráfaga concurrente de `reservar_cupo_srv`
 * y comprueba el número exacto de éxitos, los rechazos esperados, cero
 * deadlocks y los invariantes de contadores, presupuestos y topes.
 */
import { randomUUID } from "node:crypto"

import type { Actor } from "./cuentas"
import {
  type Catalogo,
  crearCampana,
  type MedioPrueba,
  precioEsperado,
  type Preparacion,
  publicarOferta,
} from "./datos"
import {
  erroresInesperados,
  type IntentoReserva,
  resumirRafaga,
  type ResumenRafaga,
  verificarInvariantes,
} from "./invariantes"
import {
  desistir,
  leerInstantanea,
  rafaga,
  reservar,
  type Reserva,
} from "./rafaga"

export interface MedioConActor extends MedioPrueba {
  actor: Actor
}

export interface Entorno {
  prep: Preparacion
  catalogo: Catalogo
  anuncianteId: string
  medios: MedioConActor[]
}

export interface ResultadoEscenario {
  nombre: string
  ok: boolean
  llamadas: number
  resumen: ResumenRafaga
  duracionMs: number
  fallas: string[]
}

interface Expectativa {
  exitos: number | ((exitos: number) => boolean)
  rechazosPermitidos: readonly string[]
  /** Bruto congelado esperado en cada asignación (precio con multiplicadores neutros). */
  montoBruto?: number
}

function reservaDe(
  medio: MedioConActor,
  ofertaId: string,
  claveIdempotencia?: string
): Reserva {
  return {
    ofertaId,
    medioId: medio.medioId,
    cuentaId: medio.cuentaId,
    actor: medio.actor,
    claveIdempotencia,
  }
}

async function evaluar(
  entorno: Entorno,
  nombre: string,
  campanas: readonly string[],
  intentos: readonly IntentoReserva[],
  duracionMs: number,
  esperado: Expectativa
): Promise<ResultadoEscenario> {
  const resumen = resumirRafaga(intentos)
  const fallas: string[] = []
  const exitosOk =
    typeof esperado.exitos === "number"
      ? resumen.exitos === esperado.exitos
      : esperado.exitos(resumen.exitos)
  if (!exitosOk) {
    const esperados =
      typeof esperado.exitos === "number"
        ? String(esperado.exitos)
        : "el rango del escenario"
    fallas.push(`éxitos = ${resumen.exitos}, se esperaba ${esperados}`)
  }
  if (resumen.deadlocks > 0)
    fallas.push(`${resumen.deadlocks} deadlocks (40P01)`)
  const inesperados = erroresInesperados(resumen, esperado.rechazosPermitidos)
  if (inesperados.length > 0)
    fallas.push(`errores inesperados: ${inesperados.join(", ")}`)
  for (const campanaId of campanas) {
    const instantanea = await leerInstantanea(entorno.prep.servicio, campanaId)
    fallas.push(...verificarInvariantes(instantanea))
    const { montoBruto } = esperado
    if (montoBruto !== undefined) {
      fallas.push(
        ...instantanea.asignaciones
          .filter(
            (a) =>
              a.aceptada_at !== null && Number(a.monto_bruto) !== montoBruto
          )
          .map(
            (a) =>
              `asignación ${a.id} con bruto ${a.monto_bruto}, se esperaba ${montoBruto}`
          )
      )
    }
  }
  return {
    nombre,
    ok: fallas.length === 0,
    llamadas: intentos.length,
    resumen,
    duracionMs,
    fallas,
  }
}

/** (1) 20 medios contra 3 cupos de la misma franja, con el presupuesto justo para 3 ⇒ exactamente 3. */
export async function cuposEscasos(
  entorno: Entorno,
  repeticion: number
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    `cupos ${repeticion}`,
    3 * precio
  )
  const ofertaId = await publicarOferta(
    prep,
    catalogo,
    campanaId,
    anuncianteId,
    {
      titulo: `cupos ${repeticion}`,
      cupos: 3,
      presupuestoMaximo: 3 * precio,
      tope: 0.34,
    }
  )
  const { resultados, duracionMs } = await rafaga(
    medios.map(
      (medio) => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
    )
  )
  return evaluar(
    entorno,
    `20 medios vs 3 cupos (#${repeticion})`,
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: 3,
      rechazosPermitidos: ["AMO_SIN_CUPO", "AMO_OFERTA_NO_DISPONIBLE"],
      montoBruto: precio,
    }
  )
}

/**
 * Variante: dos ofertas de la misma campaña compiten por su presupuesto. Se
 * publican con presupuesto para ambas y luego la campaña baja a 3 precios
 * (lo permite §3.6 mientras no quede por debajo de lo comprometido) ⇒ 3 en total.
 */
export async function presupuestoCompartido(
  entorno: Entorno,
  repeticion: number
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    `compartido ${repeticion}`,
    6 * precio
  )
  const ofertas = await Promise.all(
    ["A", "B"].map((letra) =>
      publicarOferta(prep, catalogo, campanaId, anuncianteId, {
        titulo: `compartido ${repeticion}${letra}`,
        cupos: 3,
        presupuestoMaximo: 3 * precio,
        tope: 0.5,
      })
    )
  )
  const recorte = await prep.servicio
    .from("campanas")
    .update({ presupuesto_total: 3 * precio })
    .eq("id", campanaId)
  if (recorte.error)
    throw new Error(`No se pudo recortar la campaña: ${recorte.error.message}`)
  const llamadas = medios.flatMap((medio, i) => {
    const orden = i % 2 === 0 ? ofertas : [...ofertas].reverse()
    return orden.map(
      (ofertaId) => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
    )
  })
  const { resultados, duracionMs } = await rafaga(llamadas)
  return evaluar(
    entorno,
    `2 ofertas vs presupuesto de campaña (#${repeticion})`,
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: 3,
      rechazosPermitidos: [
        "AMO_PRESUPUESTO_CAMPANA",
        "AMO_TOPE_MEDIO",
        "AMO_SIN_CUPO",
        "AMO_OFERTA_NO_DISPONIBLE",
      ],
    }
  )
}

/** (2) Presupuesto máximo de 2,5 precios con 10 cupos ⇒ exactamente 2. */
export async function presupuestoOferta(
  entorno: Entorno
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const presupuesto = Math.round((2.5 * precio) / 100) * 100
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    "presupuesto oferta",
    presupuesto
  )
  const ofertaId = await publicarOferta(
    prep,
    catalogo,
    campanaId,
    anuncianteId,
    {
      titulo: "presupuesto oferta",
      cupos: 10,
      presupuestoMaximo: presupuesto,
      tope: 0.5,
    }
  )
  const { resultados, duracionMs } = await rafaga(
    medios.map(
      (medio) => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
    )
  )
  return evaluar(
    entorno,
    "presupuesto de oferta 2,5 precios",
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: 2,
      rechazosPermitidos: ["AMO_PRESUPUESTO_OFERTA"],
    }
  )
}

/** (3) Varios cupos por medio con un tope del 20 %: 5 aceptaciones paralelas del mismo medio ⇒ 2. */
export async function topePorMedio(
  entorno: Entorno
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    "tope medio",
    10 * precio
  )
  const ofertaId = await publicarOferta(
    prep,
    catalogo,
    campanaId,
    anuncianteId,
    {
      titulo: "tope medio",
      cupos: 10,
      presupuestoMaximo: 10 * precio,
      tope: 0.2,
      multiplesCupos: true,
    }
  )
  const medio = medios[0]
  const { resultados, duracionMs } = await rafaga(
    Array.from(
      { length: 5 },
      () => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
    )
  )
  return evaluar(
    entorno,
    "tope % por medio (mismo medio x5)",
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: 2,
      rechazosPermitidos: ["AMO_TOPE_MEDIO"],
    }
  )
}

/**
 * (5) Aceptar y desistir en paralelo sobre una oferta en CUPOS_COMPLETOS: los
 * 3 titulares desisten mientras otros 10 medios intentan aceptar. Los cupos
 * liberados se pueden volver a ocupar, pero nunca más de 3 a la vez.
 */
export async function aceptarYDesistir(
  entorno: Entorno
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    "desistir",
    3 * precio
  )
  const ofertaId = await publicarOferta(
    prep,
    catalogo,
    campanaId,
    anuncianteId,
    {
      titulo: "desistir",
      cupos: 3,
      presupuestoMaximo: 3 * precio,
      tope: 0.34,
    }
  )
  const titulares = medios.slice(0, 3)
  for (const medio of titulares) {
    const previo = await reservar(prep.servicio, reservaDe(medio, ofertaId))
    if (previo.error)
      throw new Error(`No se pudo llenar la oferta: ${previo.error.message}`)
  }
  const aspirantes = medios.slice(3, 13)
  const desistimientos = titulares.map(
    (medio) => () => desistir(prep.servicio, { ofertaId, actor: medio.actor })
  )
  const reservas = aspirantes.map(
    (medio) => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
  )
  const { resultados, duracionMs } = await rafaga(
    intercalar(desistimientos, reservas)
  )
  const resultado = await evaluar(
    entorno,
    "aceptar y desistir en paralelo",
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: (exitos) =>
        exitos >= titulares.length && exitos <= titulares.length + 3,
      rechazosPermitidos: ["AMO_OFERTA_NO_DISPONIBLE", "AMO_SIN_CUPO"],
    }
  )
  const desistidos = resultados.filter(
    (r, i) => i % 2 === 0 && i / 2 < titulares.length && r.error === null
  )
  if (desistidos.length !== titulares.length) {
    resultado.fallas.push(
      `solo ${desistidos.length} de ${titulares.length} desistimientos prosperaron`
    )
    resultado.ok = false
  }
  return resultado
}

/** Intercala dos listas (a0, b0, a1, b1, …) y añade al final lo que sobre de la más larga. */
function intercalar<T>(a: readonly T[], b: readonly T[]): T[] {
  const salida: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) salida.push(a[i])
    if (i < b.length) salida.push(b[i])
  }
  return salida
}

/** (6) Doble envío (x5) con la misma clave de idempotencia ⇒ una sola asignación, el mismo id para todos. */
export async function idempotencia(
  entorno: Entorno
): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId, medios } = entorno
  const precio = precioEsperado(catalogo)
  const campanaId = await crearCampana(
    prep,
    anuncianteId,
    "idempotencia",
    3 * precio
  )
  const ofertaId = await publicarOferta(
    prep,
    catalogo,
    campanaId,
    anuncianteId,
    {
      titulo: "idempotencia",
      cupos: 3,
      presupuestoMaximo: 3 * precio,
      tope: 0.34,
    }
  )
  const clave = randomUUID()
  const { resultados, duracionMs } = await rafaga(
    Array.from(
      { length: 5 },
      () => () => reservar(prep.servicio, reservaDe(medios[0], ofertaId, clave))
    )
  )
  const resultado = await evaluar(
    entorno,
    "idempotencia (misma clave x5)",
    [campanaId],
    resultados,
    duracionMs,
    {
      exitos: 5,
      rechazosPermitidos: [],
    }
  )
  if (resultado.resumen.asignaciones.length !== 1) {
    resultado.fallas.push(
      `${resultado.resumen.asignaciones.length} asignaciones distintas, se esperaba 1`
    )
    resultado.ok = false
  }
  return resultado
}

/**
 * (4) Tope anual del nivel de verificación: el medio queda a menos de dos
 * aceptaciones del umbral de bloqueo y acepta en paralelo en dos campañas
 * distintas ⇒ exactamente 1 (el advisory lock del medio serializa los topes).
 */
export async function topeAnual(entorno: Entorno): Promise<ResultadoEscenario> {
  const { prep, catalogo, anuncianteId } = entorno
  const medio = entorno.medios[entorno.medios.length - 1]
  const publicaciones = 10
  const precio = precioEsperado(catalogo, publicaciones)
  const umbral = await umbralAnual(prep)
  const cupos = Math.ceil(umbral / (precio * 0.5)) + 2
  const carga = await crearCampana(
    prep,
    anuncianteId,
    "tope anual carga",
    cupos * precio
  )
  const ofertaCarga = await publicarOferta(
    prep,
    catalogo,
    carga,
    anuncianteId,
    {
      titulo: "tope anual carga",
      cupos,
      presupuestoMaximo: cupos * precio,
      tope: 1,
      publicaciones,
      multiplesCupos: true,
    }
  )
  let acumulado = await anualDelMedio(prep, medio.medioId)
  let montoMedio = 0
  while (montoMedio === 0 || acumulado + 2 * montoMedio <= umbral) {
    const intento = await reservar(prep.servicio, reservaDe(medio, ofertaCarga))
    if (intento.error)
      throw new Error(
        `No se pudo acercar el medio a su tope: ${intento.error.message}`
      )
    acumulado = await anualDelMedio(prep, medio.medioId)
    montoMedio = await montoMedioDe(prep, intento.asignacionId)
  }
  const campanas = await Promise.all(
    ["X", "Y"].map((letra) =>
      crearCampana(prep, anuncianteId, `tope anual ${letra}`, precio)
    )
  )
  const ofertas = await Promise.all(
    campanas.map((campanaId, i) =>
      publicarOferta(prep, catalogo, campanaId, anuncianteId, {
        titulo: `tope anual ${i}`,
        cupos: 1,
        presupuestoMaximo: precio,
        tope: 1,
        publicaciones,
      })
    )
  )
  const { resultados, duracionMs } = await rafaga(
    ofertas.map(
      (ofertaId) => () => reservar(prep.servicio, reservaDe(medio, ofertaId))
    )
  )
  return evaluar(
    entorno,
    "tope anual del nivel (2 campañas)",
    [carga, ...campanas],
    resultados,
    duracionMs,
    {
      exitos: 1,
      rechazosPermitidos: ["AMO_TOPE_NIVEL"],
    }
  )
}

/** `porcentaje_bloqueo × tope_anual` del nivel 1. */
async function umbralAnual(prep: Preparacion): Promise<number> {
  const { data, error } = await prep.servicio
    .from("niveles_verificacion")
    .select("tope_anual, porcentaje_bloqueo")
    .eq("nivel", 1)
    .single()
  if (error || data.tope_anual === null || data.porcentaje_bloqueo === null) {
    throw new Error("El nivel 1 no tiene tope anual: el escenario no aplica.")
  }
  return Number(data.tope_anual) * Number(data.porcentaje_bloqueo)
}

/** Σ monto_medio del año (asignaciones que ocupan cupo), como lo calcula `reservar_cupo`. */
async function anualDelMedio(
  prep: Preparacion,
  medioId: string
): Promise<number> {
  const { data, error } = await prep.servicio
    .from("asignacion_montos")
    .select("monto_medio, asignaciones!inner(estado)")
    .eq("medio_id", medioId)
    .not(
      "asignaciones.estado",
      "in",
      "(RECHAZADA,CANCELADA,VENCIDA_SIN_PUBLICAR)"
    )
  if (error)
    throw new Error(`No se pudo sumar el año del medio: ${error.message}`)
  return data.reduce((total, fila) => total + Number(fila.monto_medio ?? 0), 0)
}

async function montoMedioDe(
  prep: Preparacion,
  asignacionId: string | null
): Promise<number> {
  const { data, error } = await prep.servicio
    .from("asignacion_montos")
    .select("monto_medio")
    .eq("asignacion_id", asignacionId ?? "")
    .single()
  if (error)
    throw new Error(`No se pudo leer el monto del medio: ${error.message}`)
  return Number(data.monto_medio ?? 0)
}
