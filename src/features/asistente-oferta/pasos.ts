/**
 * Pasos del asistente de oferta (módulo puro): sus ids (`?paso=`), títulos,
 * los campos del formulario que valida cada uno y la traducción de los
 * errores de envío de la BD (`hint` = `envio_oferta:<paso>`) al paso que los
 * resuelve.
 */

export const PASOS_OFERTA = [
  "que",
  "quien",
  "cuando",
  "cuanto",
  "creativo",
  "envio",
] as const

export type PasoOferta = (typeof PASOS_OFERTA)[number]

export const TITULOS_PASO: Readonly<Record<PasoOferta, string>> = {
  que: "Qué se publica",
  quien: "A quién le llega",
  cuando: "Cuándo",
  cuanto: "Cuánto",
  creativo: "Paquete creativo",
  envio: "Revisión y envío",
}

/**
 * Grupo de valores del formulario que valida cada paso (`trigger`): los
 * valores se agrupan por paso (`que.titulo`, `cuanto.formatos.0…`). El paso
 * creativo no tiene campos: lo resuelve el panel de creativos.
 */
export const CAMPOS_PASO: Readonly<Record<PasoOferta, readonly string[]>> = {
  que: ["que"],
  quien: ["quien"],
  cuando: ["cuando"],
  cuanto: ["cuanto"],
  creativo: [],
  envio: ["envio"],
}

const PREFIJO_HINT = "envio_oferta:"

export function esPasoOferta(valor: unknown): valor is PasoOferta {
  return PASOS_OFERTA.includes(valor as PasoOferta)
}

/** `envio_oferta:creativo` → `creativo`; cualquier otra pista → null. */
export function pasoDeHint(hint: string | null | undefined): PasoOferta | null {
  const texto = hint?.trim() ?? ""
  if (!texto.startsWith(PREFIJO_HINT)) return null
  const paso = texto.slice(PREFIJO_HINT.length)
  return esPasoOferta(paso) ? paso : null
}

/** Paso al que pertenece un campo («cuanto.formatos.1.presupuestoMaximo» → «cuanto»). */
export function pasoDeCampo(ruta: string): PasoOferta {
  const raiz = ruta.split(".")[0]
  return esPasoOferta(raiz) ? raiz : "envio"
}

/** Pasos con algún campo en error, en el orden del asistente. */
export function pasosConError(rutas: Iterable<string>): PasoOferta[] {
  const conError = new Set<PasoOferta>()
  for (const ruta of rutas) conError.add(pasoDeCampo(ruta))
  return PASOS_OFERTA.filter((paso) => conError.has(paso))
}

/** «Falta completar: Paquete creativo». */
export function textoFaltaCompletar(paso: PasoOferta): string {
  return `Falta completar: ${TITULOS_PASO[paso]}`
}

/**
 * Rutas con error de un objeto de errores de react-hook-form (anidado:
 * `{ formatos: [ { presupuestoMaximo: { message } } ] }`), sin la raíz
 * `root` (errores generales del servidor).
 */
export function rutasConError(errores: object, prefijo = ""): string[] {
  const rutas: string[] = []
  for (const [clave, valor] of Object.entries(errores)) {
    if (!valor || typeof valor !== "object" || clave === "ref") continue
    const ruta = prefijo ? `${prefijo}.${clave}` : clave
    if (!prefijo && clave === "root") continue
    if ("message" in valor && typeof valor.message === "string") {
      rutas.push(ruta)
    }
    rutas.push(...rutasConError(valor, ruta))
  }
  return [...new Set(rutas)]
}

/** El rechazo del paso más temprano: corregirlo primero es lo que tiene sentido. */
export function primerRechazo<R extends { paso: PasoOferta }>(
  rechazos: readonly R[]
): R | null {
  return (
    [...rechazos].sort(
      (a, b) => PASOS_OFERTA.indexOf(a.paso) - PASOS_OFERTA.indexOf(b.paso)
    )[0] ?? null
  )
}
