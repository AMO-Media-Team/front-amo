/**
 * Content Security Policy con nonce por solicitud (la emite `src/proxy.ts`).
 * Módulo puro: sin `process.env` ni APIs de Next, para poder probarlo aislado.
 *
 * Next lee el nonce de la cabecera CSP de la *solicitud* (o de su variante
 * Report-Only) y lo aplica solo a sus scripts; el layout raíz lo reenvía a
 * next-themes. `style-src 'unsafe-inline'` es un compromiso asumido: sonner,
 * next/font, input-otp y number-flow inyectan estilos en línea.
 */

const SUPABASE_PROYECTO = "zygfqfvqwfvhbirmjojp"
const SUPABASE = `https://${SUPABASE_PROYECTO}.supabase.co`
const SUPABASE_WS = `wss://${SUPABASE_PROYECTO}.supabase.co`
// Subidas reanudables (TUS): el endpoint directo de Storage.
const SUPABASE_STORAGE = `https://${SUPABASE_PROYECTO}.storage.supabase.co`
const MAPBOX_API = "https://api.mapbox.com"
const MAPBOX_EVENTOS = "https://events.mapbox.com"
const MAPBOX_TESELAS = "https://*.tiles.mapbox.com"

const RUTA_REPORTE_CSP = "/api/csp-report"
/** Nombre del endpoint en `Reporting-Endpoints` / directiva `report-to`. */
const GRUPO_REPORTE_CSP = "csp"

export type ModoCsp = "enforce" | "report"

export interface OpcionesCsp {
  nonce: string
  /** `next dev`: React necesita `eval` para reconstruir pilas de error. */
  desarrollo: boolean
  /**
   * El sitio se sirve por HTTPS. Solo entonces se emite
   * `upgrade-insecure-requests`: en `http://localhost` (`next dev` y
   * `pnpm start`) Chromium pasa a https el destino de las redirecciones de un
   * `fetch` y la solicitud falla (p. ej. el prefetch de una ruta que el proxy
   * redirige).
   */
  https: boolean
}

type Directivas = ReadonlyArray<
  readonly [directiva: string, ...fuentes: string[]]
>

function directivas({ nonce, desarrollo, https }: OpcionesCsp): Directivas {
  const scripts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Mapbox GL compila WebAssembly.
    "'wasm-unsafe-eval'",
    ...(desarrollo ? ["'unsafe-eval'"] : []),
  ]

  return [
    ["default-src", "'self'"],
    ["script-src", ...scripts],
    ["style-src", "'self'", "'unsafe-inline'"],
    [
      "img-src",
      "'self'",
      "data:",
      "blob:",
      SUPABASE,
      MAPBOX_API,
      MAPBOX_TESELAS,
    ],
    ["font-src", "'self'", "data:"],
    [
      "connect-src",
      "'self'",
      SUPABASE,
      SUPABASE_WS,
      SUPABASE_STORAGE,
      MAPBOX_API,
      MAPBOX_EVENTOS,
      MAPBOX_TESELAS,
    ],
    // Mapbox y browser-image-compression crean workers desde blobs.
    ["worker-src", "'self'", "blob:"],
    ["child-src", "blob:"],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
    ...(https ? [["upgrade-insecure-requests"] as const] : []),
    ["report-uri", RUTA_REPORTE_CSP],
    ["report-to", GRUPO_REPORTE_CSP],
  ]
}

export function construirCsp(opciones: OpcionesCsp): string {
  return directivas(opciones)
    .map((partes) => partes.join(" "))
    .join("; ")
}

/** 128 bits aleatorios en base64 (Web Crypto: funciona en Node y en tests). */
export function generarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/** `AMO_CSP_MODO`: cualquier valor distinto de `report` aplica la política. */
export function modoCspDesdeEntorno(valor: string | undefined): ModoCsp {
  return valor?.trim().toLowerCase() === "report" ? "report" : "enforce"
}

export function nombreCabeceraCsp(modo: ModoCsp): string {
  return modo === "report"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy"
}

/** Valor de `Reporting-Endpoints` (la API Reporting exige URL absoluta). */
export function cabeceraEndpointsReporte(origen: string): string {
  return `${GRUPO_REPORTE_CSP}="${new URL(RUTA_REPORTE_CSP, origen).href}"`
}

// ── Reportes de violación (/api/csp-report) ─────────────────────────────────

/** Resumen sin PII: solo origen y ruta de las URL, nunca la consulta ni el fragmento. */
export interface ResumenViolacionCsp {
  directiva: string
  recursoBloqueado: string
  documento: string
  disposicion: "enforce" | "report"
  archivo?: string
  linea?: number
}

type Registro = Record<string, unknown>

const LONGITUD_MAXIMA_CAMPO = 200

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function texto(registro: Registro, ...claves: string[]): string | undefined {
  for (const clave of claves) {
    const valor = registro[clave]
    if (typeof valor === "string" && valor.length > 0) return valor
  }
  return undefined
}

function numero(registro: Registro, ...claves: string[]): number | undefined {
  for (const clave of claves) {
    const valor = registro[clave]
    if (typeof valor === "number" && Number.isFinite(valor)) return valor
  }
  return undefined
}

/**
 * Reduce una URL a origen + ruta. Palabras clave del navegador (`inline`,
 * `eval`, `data`…) se conservan tal cual; lo que no es URL se descarta.
 */
export function sanearUrlReporte(valor: string | undefined): string {
  if (!valor) return "(desconocido)"
  if (/^[a-z-]+$/i.test(valor)) return valor
  try {
    const url = new URL(valor)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return url.protocol.replace(":", "")
    }
    return `${url.origin}${url.pathname}`.slice(0, LONGITUD_MAXIMA_CAMPO)
  } catch {
    return "(no es URL)"
  }
}

function resumirCuerpo(cuerpo: Registro): ResumenViolacionCsp {
  const archivo = texto(cuerpo, "source-file", "sourceFile")
  const linea = numero(cuerpo, "line-number", "lineNumber")
  const disposicion = texto(cuerpo, "disposition")

  return {
    directiva: (
      texto(
        cuerpo,
        "effective-directive",
        "effectiveDirective",
        "violated-directive"
      ) ?? "(desconocida)"
    ).slice(0, 60),
    recursoBloqueado: sanearUrlReporte(
      texto(cuerpo, "blocked-uri", "blockedURL")
    ),
    documento: sanearUrlReporte(texto(cuerpo, "document-uri", "documentURL")),
    disposicion: disposicion === "report" ? "report" : "enforce",
    ...(archivo ? { archivo: sanearUrlReporte(archivo) } : {}),
    ...(linea !== undefined ? { linea } : {}),
  }
}

/**
 * Acepta los dos formatos de reporte: `application/csp-report`
 * (`{ "csp-report": {...} }`) y `application/reports+json` (arreglo de
 * `{ type: "csp-violation", body: {...} }`). Ignora lo que no reconoce.
 */
export function resumirReportesCsp(carga: unknown): ResumenViolacionCsp[] {
  if (esRegistro(carga) && esRegistro(carga["csp-report"])) {
    return [resumirCuerpo(carga["csp-report"])]
  }
  if (!Array.isArray(carga)) return []

  return carga
    .filter(
      (reporte): reporte is Registro & { body: Registro } =>
        esRegistro(reporte) &&
        reporte.type === "csp-violation" &&
        esRegistro(reporte.body)
    )
    .map((reporte) => resumirCuerpo(reporte.body))
}
