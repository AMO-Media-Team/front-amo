import { esProduccion, supabaseUrlDe } from "../scripts/bootstrap/produccion"
import { clienteComoSuperadmin } from "../scripts/bootstrap/provision-e2e"
import { VISTAS_LIQUIDACIONES } from "../src/features/liquidaciones/rutas"
import { VISTAS_PAGOS_MEDIOS } from "../src/features/pagos-medios/rutas"
import { SLUGS_REPORTE } from "../src/features/reportes/catalogo"
import type { ColaValidacion } from "../src/features/validacion/rutas"
import type { Cola } from "../src/features/verificacion/colas"
import type { Database } from "../src/types/database.types"
import { infraccionesGraves } from "./utilidades/axe"
import { entorno } from "./utilidades/cuentas"
import { anuncianteDemo, clienteDeLectura } from "./utilidades/datos-demo"
import type { Tema } from "./utilidades/interfaz"
import {
  crearMedioDesechable,
  huellaCorreo,
  type TitularDesechable,
} from "./utilidades/privacidad"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import {
  credencialesDemo,
  ingresarComoLecturaFinanzas,
  type NombreSesion,
  sesion,
} from "./utilidades/sesiones"

/**
 * Accesibilidad automática (axe-core, WCAG 2.2 AA) de las pantallas clave de
 * cada portal (RNF-ACC-01): equipo AMO, Finanzas, anunciante, medio y las
 * públicas, en tema oscuro y claro y en los tres proyectos (1440, 834 y
 * 390 px). Umbral de RNF-ACC-01: ninguna infracción seria ni crítica.
 *
 * - Las fichas se toman del primer enlace de su listado o de los datos demo
 *   (clave de servicio); sin datos, la prueba se salta y dice por qué. La
 *   demo no trae solicitudes de titulares: la ficha de una se audita sobre
 *   una solicitud de supresión propia (titular desechable de la fábrica de
 *   `utilidades/privacidad.ts`), creada antes y borrada después, nunca contra
 *   producción.
 * - Las fichas con pestañas se auditan pestaña por pestaña; las de una
 *   asignación del medio, con las pantallas que enlazan (contenido, evidencia,
 *   métricas).
 * - Los diálogos, hojas, menús y la tabla de «Ver datos» se abren y se auditan
 *   aparte, cuando su opacidad ya es 1. Nada se confirma.
 *
 * Solo lectura: abrir la ficha de una oferta registra la vista del medio demo
 * (MED-009), que es aceptable sobre datos demo. Las pantallas sencillas de
 * cada portal (Inicio, mapa, reportes, listados) siguen en
 * `accesibilidad.spec.ts` con el umbral de cero infracciones.
 */

type EstadoAsignacion = Database["public"]["Enums"]["asignacion_estado"]
type Portal = NombreSesion | "publico"

/** El oscuro es el tema de AMO mientras el navegador no elija otro. */
const TEMAS: readonly Tema[] = ["dark", "light"]

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
/** Una consulta o un fragmento opcionales al final del enlace. */
const COLA_DEL_ENLACE = "(?:[?#].*)?$"

const COLAS_VERIFICACION = [
  "medios",
  "cuentas",
  "documentos",
  "solicitudes",
  "anunciantes",
] as const satisfies readonly Cola[]

const RUTAS_VALIDACION = [
  "/operacion/validacion?cola=evidencias",
  "/operacion/validacion?cola=metricas&alertas=true",
  "/operacion/validacion?cola=verificar",
] as const satisfies readonly `/operacion/validacion?cola=${ColaValidacion}${string}`[]

/** La finanzas del reporte ya la audita `accesibilidad.spec.ts`. */
const REPORTES = SLUGS_REPORTE.filter((slug) => slug !== "finanzas")

// ── Navegación y espera ──────────────────────────────────────────────────────

/** Abre una ruta del portal y espera a que la pantalla termine de pintarse. */
type Ir = (destino: string) => Promise<void>

/**
 * Lo pintado: el título de la página y ningún esqueleto ni tabla cargando
 * (`aria-busy="true"`). `page.goto` ya esperó el fin del streaming.
 */
async function esperarPantalla(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  await expect(
    page.locator('[aria-busy="true"]'),
    `${new URL(page.url()).pathname} sigue cargando`
  ).toHaveCount(0, { timeout: 20_000 })
}

/**
 * La sesión `finanzas` es de un rol interno: expira tras 30 minutos sin uso.
 * Si el servidor la cerró, se vuelve a ingresar (con TOTP) y se sigue.
 */
function navegador(page: Page, portal: Portal): Ir {
  return async (destino) => {
    await page.goto(destino)
    if (portal === "finanzas" && new URL(page.url()).pathname === "/ingresar") {
      await page.context().clearCookies()
      await ingresarComoLecturaFinanzas(page, destino)
    }
    await esperarPantalla(page)
  }
}

/** Fija el tema que next-themes leerá en la próxima carga. */
async function elegirTema(page: Page, tema: Tema): Promise<void> {
  await page.evaluate(
    (valor) => window.localStorage.setItem("theme", valor),
    tema
  )
}

async function confirmarTema(page: Page, tema: Tema): Promise<void> {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${tema}\\b`))
}

// ── Enlaces y datos demo ─────────────────────────────────────────────────────

/** Los `href` de la página que cumplen el patrón, sin repetir su ruta. */
async function enlaces(page: Page, patron: RegExp): Promise<string[]> {
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((anclas) =>
      anclas.map((ancla) => ancla.getAttribute("href") ?? "")
    )
  const vistos = new Set<string>()
  return hrefs.filter((href) => {
    const ruta = href.split(/[?#]/)[0]
    if (!patron.test(href) || vistos.has(ruta)) return false
    vistos.add(ruta)
    return true
  })
}

/** Patrón del enlace a una ficha: `<base>/<uuid>`, con o sin consulta. */
function fichaDe(base: string): RegExp {
  return new RegExp(`^${base}/${UUID}${COLA_DEL_ENLACE}`)
}

type Resolver = (ir: Ir, page: Page) => Promise<string | null>

/**
 * La primera ficha enlazada desde un listado (sin su consulta: la primera
 * pestaña). `base` por omisión es la ruta del listado sin consulta.
 */
function primeraFicha(listado: string, base = listado.split("?")[0]): Resolver {
  return async (ir, page) => {
    await ir(listado)
    const [primera] = await enlaces(page, fichaDe(base))
    return primera ? primera.split(/[?#]/)[0] : null
  }
}

/** Una consulta por proceso: varias pantallas parten del mismo dato demo. */
function unaVez<T>(leer: () => Promise<T>): () => Promise<T> {
  let resultado: Promise<T> | null = null
  return () => {
    resultado ??= leer().catch((error: unknown) => {
      resultado = null
      throw error
    })
    return resultado
  }
}

interface AsignacionAnunciante {
  campana: string
  oferta: string
  asignacion: string
}

/** Una asignación ya con resultados del anunciante demo (seguimiento y métricas llenos). */
const asignacionDelAnunciante = unaVez(
  async (): Promise<AsignacionAnunciante | null> => {
    const servicio = clienteDeLectura()
    const { id } = await anuncianteDemo(servicio)
    const { data, error } = await servicio
      .from("asignaciones")
      .select("id, campana_id, oferta_id")
      .eq("anunciante_id", id)
      .in("estado", ["VERIFICADA", "LIQUIDADA", "PAGADA"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`No se pudo leer: ${error.message}`)
    return data
      ? {
          campana: data.campana_id,
          oferta: data.oferta_id,
          asignacion: data.id,
        }
      : null
  }
)

/** Una campaña ACTIVA del anunciante demo (admite ofertas nuevas). */
const campanaActivaDelAnunciante = unaVez(async (): Promise<string | null> => {
  const servicio = clienteDeLectura()
  const { id } = await anuncianteDemo(servicio)
  const { data, error } = await servicio
    .from("campanas")
    .select("id")
    .eq("anunciante_id", id)
    .eq("estado", "ACTIVA")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer: ${error.message}`)
  return data?.id ?? null
})

const medioDemo = unaVez(async (): Promise<string> => {
  const { email } = credencialesDemo("MEDIO")
  const { data, error } = await clienteDeLectura()
    .from("perfiles")
    .select("medio_id")
    .eq("email", email)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer: ${error.message}`)
  if (!data?.medio_id) {
    throw new Error(`La cuenta ${email} no tiene un medio asociado.`)
  }
  return data.medio_id
})

/** La ficha de la asignación más reciente del medio demo en alguno de esos estados. */
function asignacionDelMedio(estados: readonly EstadoAsignacion[]): Resolver {
  return async () => {
    const { data, error } = await clienteDeLectura()
      .from("asignaciones")
      .select("id")
      .eq("medio_id", await medioDemo())
      .in("estado", estados)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`No se pudo leer: ${error.message}`)
    return data ? `/mis-campanas/${data.id}` : null
  }
}

// ── Solicitud de un titular (CTA-007) ───────────────────────────────────────

/**
 * Marca de las solicitudes de esta suite. No es la de `cierre-privacidad`
 * (`MARCA_SOLICITUD_E2E`): esa suite borra las suyas al empezar y al terminar,
 * y puede correr a la vez que esta. Lo de cada proceso se borra por su id.
 */
const MARCA_SOLICITUD_A11Y = "[E2E accesibilidad]"

/** Las que dejó una corrida cortada se limpian pasado este tiempo. */
const VIGENCIA_SOBRANTE_MS = 2 * 60 * 60 * 1000

interface SolicitudAuditada {
  id: string | null
  titular: TitularDesechable
}

/** La de este proceso (cada worker crea y borra la suya). */
let solicitudAuditada: SolicitudAuditada | null = null

/** Día de Bogotá a `dias` de hoy ('YYYY-MM-DD'). */
function diaBogota(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date(Date.now() + dias * 24 * 60 * 60 * 1000))
}

/**
 * Supresión RADICADA de un titular desechable (medio y cuenta de la fábrica):
 * la ficha muestra las acciones del equipo, «Ver datos del titular» y el panel
 * de supresión. El plazo imita el de un reclamo (15 días hábiles).
 */
async function crearSolicitudAuditada(): Promise<void> {
  const servicio = await clienteComoSuperadmin(entorno)
  const sobrantes = new Date(Date.now() - VIGENCIA_SOBRANTE_MS).toISOString()
  await servicio
    .from("solicitudes_titular")
    .delete()
    .like("descripcion", `%${MARCA_SOLICITUD_A11Y}%`)
    .lt("created_at", sobrantes)

  const titular = await crearMedioDesechable()
  solicitudAuditada = { id: null, titular }
  const { data, error } = await servicio
    .from("solicitudes_titular")
    .insert({
      perfil_id: titular.usuarioId,
      email_sha256: huellaCorreo(titular.email),
      rol_tipo: "MEDIO",
      medio_id: titular.medioId,
      tipo: "SUPRESION",
      descripcion: `${MARCA_SOLICITUD_A11Y} Ya no voy a publicar en AMO: borren mi cuenta y mis datos.`,
      datos_afectados: ["CONTACTO"],
      plazo_vence: diaBogota(21),
      alerta_desde: diaBogota(14),
    })
    .select("id")
    .single()
  if (error) {
    throw new Error(`No se pudo radicar la solicitud: ${error.message}`)
  }
  solicitudAuditada.id = data.id
}

/**
 * Borra la solicitud, la cuenta y el medio de este proceso. Si
 * `cierre-privacidad` ya borró al titular (lo hace por prefijo), no falla.
 */
async function borrarSolicitudAuditada(): Promise<void> {
  const creada = solicitudAuditada
  solicitudAuditada = null
  if (!creada) return
  const servicio = await clienteComoSuperadmin(entorno)
  if (creada.id) {
    const { error } = await servicio
      .from("solicitudes_titular")
      .delete()
      .eq("id", creada.id)
    if (error) {
      throw new Error(`No se pudo borrar la solicitud: ${error.message}`)
    }
  }
  const { usuarioId, medioId } = creada.titular
  const { error: errorCuenta } = await servicio.auth.admin.deleteUser(usuarioId)
  if (errorCuenta && errorCuenta.status !== 404) {
    throw new Error(`No se pudo borrar la cuenta: ${errorCuenta.message}`)
  }
  const { error: errorMedio } = await servicio
    .from("medios")
    .delete()
    .eq("id", medioId)
  if (errorMedio) {
    throw new Error(`No se pudo borrar el medio: ${errorMedio.message}`)
  }
}

// ── Pantallas ────────────────────────────────────────────────────────────────

/** Datos que la demo no trae: se crean antes de la prueba y se borran al final. */
interface DatosPropios {
  crear: () => Promise<void>
  borrar: () => Promise<void>
}

interface Pantalla {
  /** Nombre de la prueba: la ruta, con `[id]` si es una ficha. */
  nombre: string
  ruta: string | Resolver
  /** Audita también cada pestaña de la ficha (el primer `tablist`). */
  pestanas?: boolean
  /** Pantallas que esta enlaza y se auditan con ella (dado su `ruta`). */
  enlazadas?: (ruta: string) => RegExp
  /** Solo fuera de producción: en producción la prueba se salta. */
  datos?: DatosPropios
}

const pantalla = (ruta: string): Pantalla => ({ nombre: ruta, ruta })

const PANTALLAS: Readonly<Record<Portal, readonly Pantalla[]>> = {
  publico: [pantalla("/auth/confirm")],
  interno: [
    ...COLAS_VERIFICACION.map((cola) =>
      pantalla(`/operacion/verificacion?cola=${cola}`)
    ),
    pantalla("/operacion/moderacion"),
    pantalla("/operacion/ofertas"),
    {
      nombre: "/operacion/ofertas/[id]",
      ruta: primeraFicha("/operacion/ofertas"),
    },
    ...RUTAS_VALIDACION.map(pantalla),
    {
      nombre: "/operacion/disputas/[id]",
      ruta: primeraFicha("/operacion/disputas"),
    },
    {
      nombre: "/operacion/medios/[id]",
      ruta: primeraFicha("/operacion/medios"),
      pestanas: true,
    },
    pantalla("/operacion/anunciantes"),
    {
      nombre: "/operacion/anunciantes/[id]",
      ruta: primeraFicha("/operacion/anunciantes"),
      pestanas: true,
    },
    pantalla("/operacion/campanas"),
    {
      nombre: "/operacion/campanas/[id]",
      ruta: primeraFicha("/operacion/campanas"),
      pestanas: true,
    },
    {
      nombre: "/operacion/asignaciones/[id]",
      ruta: primeraFicha("/operacion/asignaciones"),
      pestanas: true,
    },
    ...VISTAS_LIQUIDACIONES.map((vista) =>
      pantalla(`/finanzas/liquidaciones?vista=${vista}`)
    ),
    {
      nombre: "/finanzas/liquidaciones/[id]",
      ruta: primeraFicha("/finanzas/liquidaciones?vista=pagadas"),
    },
    pantalla("/finanzas/facturas"),
    {
      nombre: "/finanzas/facturas/[id]",
      ruta: primeraFicha("/finanzas/facturas"),
      pestanas: true,
    },
    pantalla("/finanzas/cartera"),
    {
      nombre: "/administracion/usuarios/[id]",
      ruta: primeraFicha("/administracion/usuarios"),
      pestanas: true,
    },
    {
      nombre: "/administracion/roles/[id]",
      ruta: primeraFicha("/administracion/roles"),
      pestanas: true,
    },
    pantalla("/administracion/accesos"),
    pantalla("/notificaciones"),
    ...REPORTES.map((slug) => pantalla(`/reportes/${slug}`)),
    // Fase 6: gestión asistida (ADM-014) y solicitudes de titulares (CTA-007).
    pantalla("/operacion/campanas/nueva"),
    pantalla("/administracion/privacidad"),
    {
      // La demo no trae solicitudes y las de `cierre-privacidad` son
      // efímeras: se audita una propia, en estado RADICADA.
      nombre: "/administracion/privacidad/[id]",
      ruta: async () =>
        solicitudAuditada?.id
          ? `/administracion/privacidad/${solicitudAuditada.id}`
          : null,
      datos: { crear: crearSolicitudAuditada, borrar: borrarSolicitudAuditada },
    },
  ],
  // Los pagos a medios piden `liquidaciones.registrar_pago`, que ADMIN no tiene.
  finanzas: [
    ...VISTAS_PAGOS_MEDIOS.map((vista) =>
      pantalla(`/finanzas/pagos?vista=${vista}`)
    ),
    {
      nombre: "/finanzas/pagos/[id]",
      ruta: primeraFicha("/finanzas/pagos?vista=dispersiones"),
    },
  ],
  anunciante: [
    pantalla("/campanas"),
    pantalla("/campanas/nueva"),
    {
      nombre: "/campanas/[id]",
      ruta: async () => {
        const datos = await asignacionDelAnunciante()
        return datos && `/campanas/${datos.campana}`
      },
      pestanas: true,
    },
    {
      // El asistente en su primer paso: no se avanza.
      nombre: "/campanas/[id]/ofertas/nueva",
      ruta: async () => {
        const campana = await campanaActivaDelAnunciante()
        return campana && `/campanas/${campana}/ofertas/nueva`
      },
    },
    {
      nombre: "/campanas/[id]/ofertas/[ofertaId]",
      ruta: async () => {
        const datos = await asignacionDelAnunciante()
        return datos && `/campanas/${datos.campana}/ofertas/${datos.oferta}`
      },
    },
    {
      // Seguimiento de una asignación (ANU-011).
      nombre: "/campanas/[id]/asignaciones/[asignacionId]",
      ruta: async () => {
        const datos = await asignacionDelAnunciante()
        return (
          datos && `/campanas/${datos.campana}/asignaciones/${datos.asignacion}`
        )
      },
    },
    pantalla("/facturas"),
    { nombre: "/facturas/[id]", ruta: primeraFicha("/facturas") },
    pantalla("/empresa"),
    pantalla("/empresa/documentos"),
    pantalla("/empresa/equipo"),
    // Fase 6: derechos del titular de los datos (CTA-007).
    pantalla("/cuenta/privacidad"),
  ],
  medio: [
    pantalla("/ofertas"),
    // Sin aceptar: solo se mira.
    { nombre: "/ofertas/[id]", ruta: primeraFicha("/ofertas") },
    { nombre: "/mis-campanas", ruta: "/mis-campanas", pestanas: true },
    {
      nombre: "/mis-campanas/[id] por publicar",
      ruta: asignacionDelMedio(["ACEPTADA", "CONTENIDO_ENTREGADO"]),
      enlazadas: (ruta) =>
        new RegExp(
          `^${ruta}/(?:contenido|evidencia|metricas|disputa)${COLA_DEL_ENLACE}`
        ),
    },
    {
      nombre: "/mis-campanas/[id] con métricas",
      ruta: asignacionDelMedio([
        "EVIDENCIA_VALIDADA",
        "METRICAS_CARGADAS",
        "VERIFICADA",
        "LIQUIDADA",
        "PAGADA",
      ]),
      enlazadas: (ruta) =>
        new RegExp(
          `^${ruta}/(?:contenido|evidencia|metricas|disputa)${COLA_DEL_ENLACE}`
        ),
    },
    pantalla("/ganancias"),
    { nombre: "/ganancias/[id]", ruta: primeraFicha("/ganancias") },
    ...["", "/perfil", "/documentos", "/pago", "/cuentas", "/nivel"].map(
      (seccion) => pantalla(`/mi-medio${seccion}`)
    ),
    // Fase 6: indicadores de reputación (MED-016) y derechos del titular
    // (CTA-007).
    pantalla("/mi-medio/reputacion"),
    pantalla("/cuenta/privacidad"),
  ],
}

// ── Auditoría ────────────────────────────────────────────────────────────────

function etiquetar(donde: string, hallazgos: readonly string[]): string[] {
  return hallazgos.map((hallazgo) => `${donde} → ${hallazgo}`)
}

/** Cada pestaña del primer `tablist` que no está elegida, una tras otra. */
async function auditarPestanas(page: Page, donde: string): Promise<string[]> {
  const pestanas = page.getByRole("tablist").first().getByRole("tab")
  const hallazgos: string[] = []
  const total = await pestanas.count()
  for (let indice = 0; indice < total; indice += 1) {
    const pestana = pestanas.nth(indice)
    if (
      (await pestana.getAttribute("aria-selected")) === "true" ||
      (await pestana.isDisabled())
    ) {
      continue
    }
    const nombre = (await pestana.innerText()).replace(/\s+/g, " ").trim()
    await pestana.click()
    await expect(pestana).toHaveAttribute("aria-selected", "true")
    await esperarPantalla(page)
    hallazgos.push(
      ...etiquetar(`${donde} › ${nombre}`, await infraccionesGraves(page))
    )
  }
  return hallazgos
}

async function revisarPantalla(
  page: Page,
  portal: Portal,
  { nombre, ruta, pestanas = false, enlazadas }: Pantalla
): Promise<void> {
  const ir = navegador(page, portal)
  const destino = typeof ruta === "string" ? ruta : await ruta(ir, page)
  test.skip(!destino, `La base no tiene datos para ${nombre}.`)
  if (!destino) return

  const rutas = [destino]
  if (enlazadas) {
    await ir(destino)
    rutas.push(...(await enlaces(page, enlazadas(destino))))
  }

  const hallazgos: string[] = []
  for (const tema of TEMAS) {
    for (const actual of rutas) {
      await ir(actual)
      await confirmarTema(page, tema)
      const donde = `${actual} (${tema})`
      hallazgos.push(...etiquetar(donde, await infraccionesGraves(page)))
      if (pestanas) hallazgos.push(...(await auditarPestanas(page, donde)))
    }
    // La próxima carga ya llega con el otro tema.
    if (tema !== TEMAS[TEMAS.length - 1]) {
      await elegirTema(page, TEMAS[TEMAS.indexOf(tema) + 1])
    }
  }
  expect(hallazgos, `${nombre}: infracciones serias o críticas`).toEqual([])
}

// ── Estados abiertos ─────────────────────────────────────────────────────────

interface Abierto {
  nombre: string
  portal: Portal
  ruta: string | Resolver
  /** Abre el estado y devuelve la zona que se audita; `null` si no se puede. */
  abrir: (page: Page, ir: Ir) => Promise<Locator | null>
}

const ABIERTOS: readonly Abierto[] = [
  {
    nombre: "el menú de comandos (⌘K)",
    portal: "interno",
    ruta: "/inicio",
    abrir: async (page) => {
      await page.keyboard.press("ControlOrMeta+K")
      return page.getByRole("dialog", { name: "Menú de comandos" })
    },
  },
  {
    nombre: "la hoja «Nuevo usuario»",
    portal: "interno",
    ruta: "/administracion/usuarios",
    abrir: async (page) => {
      await page.getByRole("button", { name: "Crear usuario" }).click()
      return page.getByRole("dialog", { name: "Nuevo usuario" })
    },
  },
  {
    nombre: "un filtro facetado",
    portal: "interno",
    ruta: "/administracion/usuarios",
    abrir: async (page) => {
      await page
        .locator(`button[aria-haspopup="dialog"]`)
        .filter({ hasText: /^Rol/ })
        .first()
        .click()
      const lista = page.getByRole("listbox", { name: "Resultados" })
      await expect(lista).toBeVisible()
      return page.getByRole("dialog").filter({ has: lista })
    },
  },
  {
    nombre: "«Generar corte»",
    portal: "interno",
    ruta: "/finanzas/liquidaciones?vista=pendientes",
    abrir: async (page) => {
      const generar = page.getByRole("button", { name: "Generar corte" })
      await expect(generar).toBeVisible()
      if (await generar.isDisabled()) return null
      await generar.click()
      return page.getByRole("dialog", { name: "Generar el corte" })
    },
  },
  {
    // DSH-002: la tabla de un gráfico, recorrible con teclado.
    nombre: "«Ver datos» de un gráfico",
    portal: "interno",
    ruta: "/inicio",
    abrir: async (page) => {
      const ver = page.getByRole("button", { name: "Ver datos" }).first()
      await expect(ver).toBeEnabled()
      await ver.click()
      const tabla = page
        .getByRole("region", { name: /^Tabla de datos: / })
        .first()
      await tabla.focus()
      await expect(tabla).toBeFocused()
      return tabla
    },
  },
  {
    nombre: "la hoja de validación",
    portal: "interno",
    ruta: "/operacion/validacion?cola=evidencias",
    abrir: async (page, ir) => {
      const revisar = page
        .getByRole("button", { name: /^Revisar (?:la evidencia|métricas) / })
        .first()
      if ((await revisar.count()) === 0) {
        await ir("/operacion/validacion?cola=metricas")
      }
      if ((await revisar.count()) === 0) return null
      await revisar.click()
      return page.getByRole("dialog").first()
    },
  },
  {
    // Lista con buscador (cmdk) en un popover. Con la lista abierta, el
    // disparador debe apuntar al listbox que existe: cmdk le pone su propio
    // id a la lista, y axe deja ese `aria-controls` roto «por revisar».
    nombre: "el selector de departamento",
    portal: "medio",
    ruta: "/mi-medio/perfil",
    abrir: async (page) => {
      const disparador = page.getByRole("combobox", {
        name: "Departamento",
        exact: true,
      })
      if ((await disparador.count()) === 0 || (await disparador.isDisabled())) {
        return null
      }
      await disparador.click()
      const lista = page.getByRole("listbox", { name: "Resultados" })
      await expect(lista).toBeVisible()
      const idLista = await lista.getAttribute("id")
      expect(idLista, "el listbox tiene id").toBeTruthy()
      await expect(disparador).toHaveAttribute("aria-controls", idLista ?? "")
      return page.getByRole("dialog").filter({ has: lista })
    },
  },
  {
    nombre: "«¿Aceptas esta oferta?» (sin confirmar)",
    portal: "medio",
    ruta: primeraFicha("/ofertas"),
    abrir: async (page) => {
      const aceptar = page
        .getByRole("button", { name: "Aceptar", exact: true })
        .first()
      if ((await aceptar.count()) === 0 || (await aceptar.isDisabled())) {
        return null
      }
      await aceptar.click()
      return page.getByRole("alertdialog", { name: "¿Aceptas esta oferta?" })
    },
  },
]

async function revisarAbierto(
  page: Page,
  { nombre, portal, ruta, abrir }: Abierto
): Promise<void> {
  const ir = navegador(page, portal)
  const destino = typeof ruta === "string" ? ruta : await ruta(ir, page)
  test.skip(!destino, `La base no tiene datos para ${nombre}.`)
  if (!destino) return

  const hallazgos: string[] = []
  for (const tema of TEMAS) {
    await ir(destino)
    await confirmarTema(page, tema)
    const zona = await abrir(page, ir)
    test.skip(!zona, `No se puede abrir ${nombre} con los datos de la base.`)
    if (!zona) return
    await expect(zona).toBeVisible()
    // A medio aparecer, un texto translúcido daría un contraste falso.
    await expect(zona).toHaveCSS("opacity", "1")
    hallazgos.push(
      ...etiquetar(`${nombre} (${tema})`, await infraccionesGraves(page, zona))
    )
    if (tema !== TEMAS[TEMAS.length - 1]) {
      await elegirTema(page, TEMAS[TEMAS.indexOf(tema) + 1])
    }
  }
  expect(hallazgos, `${nombre}: infracciones serias o críticas`).toEqual([])
}

// ── Pruebas ──────────────────────────────────────────────────────────────────

// Sin animaciones de entrada: a medio aparecer, un texto aún translúcido
// daría un contraste falso. Las fichas con pestañas o pantallas enlazadas
// cargan varias veces por tema.
test.use({ contextOptions: { reducedMotion: "reduce" } })
test.describe.configure({ timeout: 180_000 })

const PORTALES: readonly Portal[] = [
  "publico",
  "interno",
  "finanzas",
  "anunciante",
  "medio",
]

for (const portal of PORTALES) {
  test.describe(
    portal === "publico" ? "sin sesión" : `sesión ${portal}`,
    () => {
      if (portal !== "publico") test.use({ storageState: sesion(portal) })

      for (const actual of PANTALLAS[portal]) {
        const definir = () =>
          test(`${actual.nombre} sin infracciones graves en tema oscuro y claro`, async ({
            page,
          }) => {
            await revisarPantalla(page, portal, actual)
          })
        const { datos } = actual
        if (!datos) {
          definir()
          continue
        }
        // Grupo propio: los datos se crean y se borran solo para esta prueba.
        test.describe(() => {
          // Playwright exige desestructurar los fixtures aunque no se usen.
          test.beforeAll(async ({}, info) => {
            info.skip(
              esProduccion(supabaseUrlDe()),
              `${actual.nombre} necesita datos de prueba: no se crean en producción.`
            )
            await datos.crear()
          })
          test.afterAll(async () => {
            await datos.borrar()
          })
          definir()
        })
      }

      for (const estado of ABIERTOS.filter((a) => a.portal === portal)) {
        test(`${estado.nombre} abierto, sin infracciones graves en los dos temas`, async ({
          page,
        }) => {
          await revisarAbierto(page, estado)
        })
      }
    }
  )
}
