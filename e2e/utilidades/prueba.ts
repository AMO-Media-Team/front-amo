/**
 * `test` de la suite E2E: el de Playwright más una guardia automática que hace
 * fallar la prueba si el navegador informa de algo que en producción sería un
 * defecto:
 *
 * - una violación de la Content-Security-Policy (`securitypolicyviolation`),
 * - un error de consola o una excepción sin capturar que la prueba no declaró,
 * - un aviso de hidratación de React (SSR y cliente pintaron cosas distintas).
 *
 * Todos los specs importan `test` y `expect` de aquí. Una prueba que provoca a
 * propósito una respuesta de error la declara con `guardia.permitir(...)`.
 */
import {
  test as base,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  expect,
} from "@playwright/test"

export { expect }
export type { Locator, Page } from "@playwright/test"

type OpcionesContexto = NonNullable<Parameters<Browser["newContext"]>[0]>

interface Problema {
  tipo: "csp" | "consola" | "excepción" | "hidratación"
  detalle: string
  pagina: string
}

export interface Guardia {
  /** Declara errores de consola que esta prueba provoca a propósito. */
  permitir: (...patrones: RegExp[]) => void
  /** Vigila también un contexto abierto a mano (`abrirContexto` ya lo hace). */
  vigilar: (contexto: BrowserContext) => Promise<void>
}

/**
 * Contexto adicional (otra sesión, otro tamaño) con las opciones del
 * proyecto, vigilado por la guardia y cerrado al terminar la prueba.
 */
export type AbrirContexto = (
  opciones?: OpcionesContexto
) => Promise<BrowserContext>

interface FixturesAmo {
  guardia: Guardia
  abrirContexto: AbrirContexto
}

/** El navegador anota en consola toda respuesta 4xx/5xx, también la del documento. */
export function respuestaConEstado(estado: number): RegExp {
  return new RegExp(
    `Failed to load resource: the server responded with a status of ${estado}\\b`
  )
}

/**
 * React en producción informa la hidratación fallida con sus errores
 * minificados 418, 423 y 425 (y con texto en desarrollo).
 */
const AVISO_HIDRATACION =
  /hydrat|did not match|Minified React error #(?:418|419|421|422|423|425)\b/i

const NOMBRE_ENLACE_CSP = "__amoViolacionCsp"

interface DetalleViolacion {
  directiva: string
  recurso: string
  /** Archivo y posición del código que la provocó (vacío si no es un script). */
  origen: string
}

/** Se ejecuta en la página antes que cualquier script de la aplicación. */
function escucharViolaciones(nombreEnlace: string): void {
  document.addEventListener("securitypolicyviolation", (evento) => {
    const informar = (
      window as unknown as Record<string, (detalle: DetalleViolacion) => void>
    )[nombreEnlace]
    informar?.({
      directiva: evento.effectiveDirective,
      recurso: evento.blockedURI,
      origen: evento.sourceFile
        ? `${evento.sourceFile}:${evento.lineNumber}:${evento.columnNumber}`
        : "",
    })
  })
}

function crearGuardia(): { guardia: Guardia; problemas: () => Problema[] } {
  const problemas: Problema[] = []
  const permitidos: RegExp[] = []

  function anotarConsola(mensaje: ConsoleMessage): void {
    const tipo = mensaje.type()
    if (tipo !== "error" && tipo !== "warning") return
    const texto = mensaje.text()
    const esHidratacion = AVISO_HIDRATACION.test(texto)
    // Los avisos (`warning`) solo cuentan si delatan una hidratación fallida.
    if (tipo === "warning" && !esHidratacion) return
    problemas.push({
      tipo: esHidratacion ? "hidratación" : "consola",
      detalle: `${texto} (${mensaje.location().url})`,
      pagina: mensaje.page()?.url() ?? "",
    })
  }

  const guardia: Guardia = {
    permitir: (...patrones) => void permitidos.push(...patrones),
    vigilar: async (contexto) => {
      await contexto.exposeBinding(
        NOMBRE_ENLACE_CSP,
        ({ page }, detalle: DetalleViolacion) => {
          problemas.push({
            tipo: "csp",
            detalle: `${detalle.directiva} bloqueó ${detalle.recurso || "(en línea)"}${detalle.origen ? ` desde ${detalle.origen}` : ""}`,
            pagina: page.url(),
          })
        }
      )
      await contexto.addInitScript(escucharViolaciones, NOMBRE_ENLACE_CSP)
      contexto.on("console", anotarConsola)
      contexto.on("weberror", (error) => {
        const detalle = error.error().message
        problemas.push({
          tipo: AVISO_HIDRATACION.test(detalle) ? "hidratación" : "excepción",
          detalle,
          pagina: error.page()?.url() ?? "",
        })
      })
    },
  }

  return {
    guardia,
    problemas: () =>
      problemas.filter(
        ({ tipo, detalle }) =>
          // Una violación de la CSP nunca es «esperada».
          tipo === "csp" || !permitidos.some((patron) => patron.test(detalle))
      ),
  }
}

export const test = base.extend<FixturesAmo>({
  guardia: [
    async ({ context }, usar, info) => {
      const { guardia, problemas } = crearGuardia()
      await guardia.vigilar(context)
      await usar(guardia)
      const encontrados = problemas()
      if (encontrados.length > 0) {
        await info.attach("problemas-del-navegador", {
          body: JSON.stringify(encontrados, null, 2),
          contentType: "application/json",
        })
      }
      expect(
        encontrados,
        "El navegador informó violaciones de la CSP, errores de consola o avisos de hidratación"
      ).toEqual([])
    },
    { auto: true },
  ],

  abrirContexto: async (
    {
      browser,
      guardia,
      baseURL,
      viewport,
      locale,
      timezoneId,
      colorScheme,
      hasTouch,
      isMobile,
      deviceScaleFactor,
      userAgent,
    },
    usar
  ) => {
    const abiertos: BrowserContext[] = []
    await usar(async (opciones = {}) => {
      const contexto = await browser.newContext({
        baseURL,
        viewport,
        locale,
        timezoneId,
        colorScheme,
        hasTouch,
        isMobile,
        deviceScaleFactor,
        userAgent,
        ...opciones,
      })
      abiertos.push(contexto)
      await guardia.vigilar(contexto)
      return contexto
    })
    await Promise.all(abiertos.map((contexto) => contexto.close()))
  },
})
