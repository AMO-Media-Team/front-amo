import { resumirReportesCsp } from "@/lib/csp"

/**
 * Recibe reportes de violación de la CSP (`report-uri` y `report-to`). Es
 * público (lo llama el navegador sin sesión), así que limita tipo y tamaño y
 * registra solo un resumen sin PII: nunca consultas, fragmentos ni muestras
 * de código.
 */

const TAMANO_MAXIMO_BYTES = 16 * 1024
const MAXIMO_REPORTES_POR_SOLICITUD = 10
const TIPOS_ACEPTADOS = new Set([
  "application/csp-report",
  "application/reports+json",
  "application/json",
])

const sinContenido = (status: number) => new Response(null, { status })

/** Lee el cuerpo hasta `limite` bytes; `null` si lo supera. */
async function leerConLimite(
  request: Request,
  limite: number
): Promise<string | null> {
  if (!request.body) return ""
  const lector = request.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > limite) {
      await lector.cancel()
      return null
    }
    partes.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(partes))
}

export async function POST(request: Request): Promise<Response> {
  const tipo = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase()
  if (!tipo || !TIPOS_ACEPTADOS.has(tipo)) return sinContenido(415)

  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > TAMANO_MAXIMO_BYTES) return sinContenido(413)

  const texto = await leerConLimite(request, TAMANO_MAXIMO_BYTES)
  if (texto === null) return sinContenido(413)

  let carga: unknown
  try {
    carga = JSON.parse(texto)
  } catch {
    return sinContenido(400)
  }

  const resumenes = resumirReportesCsp(carga).slice(
    0,
    MAXIMO_REPORTES_POR_SOLICITUD
  )
  for (const resumen of resumenes) {
    console.warn(
      JSON.stringify({
        nivel: "advertencia",
        evento: "violacion_csp",
        ...resumen,
      })
    )
  }
  return sinContenido(204)
}
