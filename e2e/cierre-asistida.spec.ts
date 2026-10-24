import { crearClienteServicio } from "../scripts/bootstrap/supabase"
import {
  ANUNCIANTE_E2E,
  ingresarComoAnunciante,
  rutaFichaAnunciante,
  usuarioAnunciante,
} from "./utilidades/anunciantes"
import { videoDePrueba } from "./utilidades/archivos"
import {
  credenciales,
  entorno,
  escribirCodigoMfa,
  ingresar,
} from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import { borrarCampanasE2E, leerEstadoOferta } from "./utilidades/negocio"
import { PROYECTO_CIERRE } from "./utilidades/proyectos"
import {
  esperarStreaming,
  expect,
  type Locator,
  type Page,
  test,
} from "./utilidades/prueba"

/**
 * Gestión asistida por cuenta del anunciante (ADM-014, paquete GA) contra
 * `pnpm build && pnpm start`. Escribe: corre solo en el proyecto «cierre», en
 * serie y a 1440 px. Al terminar borra las campañas que creó (con sus ofertas,
 * creativos, archivos y avisos).
 *
 * - La cuenta ADMIN E2E abre «Nueva campaña» desde la ficha de «Anunciante
 *   E2E» (VERIFICADO): llega con la empresa elegida y el aviso de la gestión
 *   asistida; la campaña nace en borrador, marcada «Creada por el equipo AMO»,
 *   y la activa. La bitácora queda con el operador como actor (`actor_id`:
 *   `actor_email` guarda el correo enmascarado) y
 *   `metadatos = {modo: ASISTIDO, anunciante_id}`.
 * - Desde la ficha interna arma una oferta en el asistente asistido (reel de
 *   Instagram), carga el video y la envía a revisión: llega a la ficha interna
 *   de la oferta con el panel «Gestión por cuenta del anunciante».
 * - El anunciante ve su campaña con la insignia, «Equipo AMO» en el historial
 *   de la oferta y el aviso «El equipo AMO envió a revisión…».
 */

const PREFIJO = "Campaña GA E2E"
const FRANJA_1 = "30.000 – 60.000"
/** El video se sube por bloques y calcula su huella antes de subir. */
const ESPERA_SUBIDA_MS = 90_000

const RUTA_FICHA_INTERNA = /\/operacion\/campanas\/([0-9a-f-]{36})$/
const RUTA_OFERTA_INTERNA = /\/operacion\/ofertas\/([0-9a-f-]{36})$/

function sufijoUnico(): string {
  return Date.now().toString(36)
}

// ── Fechas del calendario (días de Bogotá) ───────────────────────────────────

interface Dia {
  anio: number
  /** 1–12. */
  mes: number
  dia: number
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

function hoyEnBogota(): Dia {
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number)
  return { anio, mes, dia }
}

function sumarDias({ anio, mes, dia }: Dia, dias: number): Dia {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias))
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
  }
}

/** Elige un día en el calendario de un `CampoFecha` (como `anunciante-campanas`). */
async function elegirFecha(
  page: Page,
  etiqueta: string,
  objetivo: Dia,
  desde: Dia
): Promise<void> {
  await page.getByLabel(etiqueta, { exact: true }).click()
  const dialogo = page.getByRole("dialog", {
    name: `Elegir la fecha: ${etiqueta}`,
  })
  await expect(dialogo).toBeVisible()
  const saltos = (objetivo.anio - desde.anio) * 12 + objetivo.mes - desde.mes
  for (let salto = 1; salto <= saltos; salto++) {
    await dialogo.getByRole("button", { name: "Ir al mes siguiente" }).click()
    const visible = new Date(Date.UTC(desde.anio, desde.mes - 1 + salto, 1))
    await expect(dialogo.getByRole("grid")).toHaveAccessibleName(
      new RegExp(
        `${MESES[visible.getUTCMonth()]}.*${visible.getUTCFullYear()}`,
        "i"
      )
    )
  }
  await dialogo
    .getByRole("button", {
      name: new RegExp(
        `\\b${objetivo.dia} de ${MESES[objetivo.mes - 1]} de ${objetivo.anio}\\b`
      ),
    })
    .first()
    .click()
  await expect(dialogo).toBeHidden()
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Cuenta ADMIN E2E (contraseña y TOTP); espera Inicio y abre `destino`. */
async function ingresarComoAdmin(page: Page, destino: string): Promise<void> {
  await ingresar(page, credenciales("ADMIN"))
  await escribirCodigoMfa(page)
  await expect(page).toHaveURL(/\/inicio$/)
  await page.goto(destino)
  await esperarStreaming(page)
}

function avisoAsistido(page: Page): Locator {
  return page.getByRole("note", { name: "Gestión asistida" })
}

function paso(page: Page, titulo: RegExp): Locator {
  return page.getByRole("heading", { level: 2, name: titulo })
}

async function siguiente(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Acciones del asistente" })
    .getByRole("button", { name: "Siguiente" })
    .click()
}

/**
 * Id del perfil de la cuenta ADMIN E2E: la bitácora identifica al actor por
 * `actor_id` (su `actor_email` es una copia enmascarada, `e***@amo.test`).
 */
async function idPerfilAdmin(): Promise<string> {
  const { email } = credenciales("ADMIN")
  const { data, error } = await crearClienteServicio(entorno)
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la cuenta ${email}: ejecuta \`pnpm bootstrap:e2e\`. ${error.message}`
    )
  }
  return data.id
}

/**
 * Cambios de una entidad en la bitácora (alta, ediciones y transiciones; no
 * las consultas ni las exportaciones), del más antiguo al más reciente.
 */
async function bitacoraDe(entidad: "campanas" | "ofertas", id: string) {
  const { data, error } = await crearClienteServicio(entorno)
    .from("bitacora")
    .select("actor_id, accion, metadatos")
    .eq("entidad", entidad)
    .eq("entidad_id", id)
    .in("accion", ["INSERT", "UPDATE", "TRANSICION"])
    .order("created_at")
  if (error) throw new Error(`No se pudo leer la bitácora: ${error.message}`)
  return data
}

async function marcaAsistida(
  tabla: "campanas" | "ofertas",
  id: string
): Promise<boolean> {
  const { data, error } = await crearClienteServicio(entorno)
    .from(tabla)
    .select("gestion_asistida")
    .eq("id", id)
    .single()
  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
  return data.gestion_asistida
}

// ── Pruebas ──────────────────────────────────────────────────────────────────

test.describe("gestión asistida por cuenta del anunciante", () => {
  // La subida del video calcula su huella antes de subirlo.
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  const nombre = `${PREFIJO} ${sufijoUnico()}`
  const titulo = `Oferta GA E2E ${sufijoUnico()}`
  let campanaId = ""
  let ofertaId = ""

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CIERRE,
      "Crea campañas y ofertas del Anunciante E2E: corre solo en el proyecto «cierre», en serie."
    )
    await borrarCampanasE2E({ prefijo: PREFIJO })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CIERRE) return
    await borrarCampanasE2E({ prefijo: PREFIJO })
  })

  test("el equipo AMO crea la campaña por cuenta del anunciante y la activa", async ({
    page,
  }) => {
    const hoy = hoyEnBogota()
    await ingresarComoAdmin(
      page,
      rutaFichaAnunciante(ANUNCIANTE_E2E, "campanas")
    )

    // Desde la ficha del anunciante, con la empresa ya elegida.
    await page
      .getByRole("main")
      .getByRole("link", { name: "Nueva campaña" })
      .first()
      .click()
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/operacion/campanas/nueva" &&
        url.searchParams.get("anunciante") === ANUNCIANTE_E2E.id
    )
    await expect(avisoAsistido(page)).toContainText(
      `Estás actuando por cuenta de ${ANUNCIANTE_E2E.nombre}. Cada cambio queda en la bitácora a tu nombre. La empresa recibe un aviso cuando creas, activas o cancelas una campaña, y cuando envías, retiras o cancelas una oferta.`
    )
    const formulario = page.getByRole("form", {
      name: "Nueva campaña por cuenta de un anunciante",
    })
    await expect(
      formulario.getByRole("combobox", { name: "Empresa" })
    ).toContainText(ANUNCIANTE_E2E.nombre)

    await formulario.getByLabel("Nombre de la campaña").fill(nombre)
    await formulario.getByLabel("Marca o producto").fill("Marca GA E2E")
    await elegirFecha(page, "Fecha de inicio", hoy, hoy)
    await elegirFecha(page, "Fecha de fin", sumarDias(hoy, 45), hoy)
    await formulario.getByLabel("Presupuesto total").fill("20.000.000")
    await esperarSinDesbordeHorizontal(page)
    await formulario.getByRole("button", { name: "Crear campaña" }).click()

    // Ficha interna: borrador marcado como asistido.
    await expect(page).toHaveURL(RUTA_FICHA_INTERNA)
    campanaId = RUTA_FICHA_INTERNA.exec(new URL(page.url()).pathname)?.[1] ?? ""
    await expect(
      page.getByRole("heading", { level: 1, name: nombre })
    ).toBeVisible()
    await expect(page.getByText("Creada por el equipo AMO")).toBeVisible()
    expect(await marcaAsistida("campanas", campanaId)).toBe(true)

    // Activar habla de la empresa; queda activa.
    await page.getByRole("button", { name: "Activar campaña" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Activar la campaña?",
    })
    await expect(dialogo).toContainText(
      `Se activa por cuenta de ${ANUNCIANTE_E2E.nombre}`
    )
    await dialogo.getByRole("button", { name: "Activar campaña" }).click()
    await expect(dialogo).toBeHidden()
    await expect(
      page.getByRole("button", { name: "Cancelar campaña" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { level: 1, name: nombre })
    ).toBeFocused()

    // Bitácora: el operador es el actor y el anunciante, el propietario.
    const operador = await idPerfilAdmin()
    const filas = await bitacoraDe("campanas", campanaId)
    expect(filas.length).toBeGreaterThanOrEqual(2)
    for (const fila of filas) {
      expect(fila.actor_id).toBe(operador)
      expect(fila.metadatos).toMatchObject({
        modo: "ASISTIDO",
        anunciante_id: ANUNCIANTE_E2E.id,
      })
    }
  })

  test("arma la oferta en el asistente asistido, carga el video y la envía a revisión", async ({
    page,
  }) => {
    expect(campanaId).not.toBe("")
    await ingresarComoAdmin(page, `/operacion/campanas/${campanaId}`)
    await page
      .getByRole("main")
      .getByRole("link", { name: "Nueva oferta" })
      .first()
      .click()
    await expect(page).toHaveURL(
      `/operacion/campanas/${campanaId}/ofertas/nueva`
    )
    await expect(avisoAsistido(page)).toContainText(
      `Estás actuando por cuenta de ${ANUNCIANTE_E2E.nombre}`
    )

    // 1 · Qué se publica.
    await expect(paso(page, /Paso 1 de 6: Qué se publica/)).toBeVisible()
    await page
      .getByRole("group", { name: "Instagram" })
      .getByRole("checkbox", { name: "Reel" })
      .check()
    await page
      .getByRole("textbox", { name: "Título de la oferta" })
      .fill(titulo)
    await siguiente(page)
    // 2 · A quién y 3 · Cuándo: los valores por omisión.
    await expect(paso(page, /Paso 2 de 6: A quién le llega/)).toBeFocused()
    await siguiente(page)
    await expect(paso(page, /Paso 3 de 6: Cuándo/)).toBeFocused()
    await siguiente(page)
    // 4 · Cuánto: al salir queda el borrador.
    await expect(paso(page, /Paso 4 de 6: Cuánto/)).toBeFocused()
    const tarjeta = page.getByRole("region", {
      name: "Reel · Instagram",
      exact: true,
    })
    await tarjeta.getByLabel("Presupuesto máximo").fill("3000000")
    await tarjeta
      .getByRole("textbox", { name: `Cupos en la franja ${FRANJA_1}` })
      .fill("2")
    await siguiente(page)
    await expect(paso(page, /Paso 5 de 6: Paquete creativo/)).toBeFocused()
    ofertaId = (parametro(page, "ofertas") ?? "").split(",")[0] ?? ""
    expect(ofertaId).toMatch(/^[0-9a-f-]{36}$/)
    expect((await leerEstadoOferta({ id: ofertaId })).estado).toBe("BORRADOR")
    expect(await marcaAsistida("ofertas", ofertaId)).toBe(true)

    // 5 · Paquete creativo: un video vertical 9:16, sin recomprimir.
    const panel = page.getByRole("region", {
      name: "Paquete creativo: Reel de Instagram",
    })
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      panel.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles(
      await videoDePrueba({ ancho: 360, alto: 640, segundos: 3 })
    )
    await expect(
      panel.getByText("El paquete creativo está completo.")
    ).toBeVisible({ timeout: ESPERA_SUBIDA_MS })
    await siguiente(page)

    // 6 · Envío: queda en la cola de moderación y va a la ficha interna.
    await expect(paso(page, /Paso 6 de 6: Revisión y envío/)).toBeFocused()
    await esperarSinDesbordeHorizontal(page)
    await page.getByRole("button", { name: "Enviar a revisión" }).click()
    await expect(page.getByText("Oferta enviada a revisión")).toBeVisible()
    await expect(page).toHaveURL(RUTA_OFERTA_INTERNA)
    expect(new URL(page.url()).pathname).toBe(`/operacion/ofertas/${ofertaId}`)
    expect((await leerEstadoOferta({ id: ofertaId })).estado).toBe(
      "EN_REVISION"
    )

    // La gestión va separada de la decisión de moderación.
    const gestion = page
      .getByRole("heading", { name: "Gestión por cuenta del anunciante" })
      .locator("xpath=ancestor::section[1]")
    await expect(gestion).toContainText(
      `Actúas por cuenta de ${ANUNCIANTE_E2E.nombre}. Cada cambio queda en la bitácora a tu nombre; la empresa recibe un aviso cuando envías, retiras o cancelas la oferta.`
    )
    await expect(
      gestion.getByRole("button", { name: "Retirar de revisión" })
    ).toBeVisible()
    await expect(gestion.getByRole("button", { name: /Publicar/ })).toHaveCount(
      0
    )
    await expect(page.getByText("Creada por el equipo AMO")).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // Bitácora de la oferta: asistida, a nombre del operador.
    const operador = await idPerfilAdmin()
    const filas = await bitacoraDe("ofertas", ofertaId)
    expect(filas.length).toBeGreaterThanOrEqual(2)
    for (const fila of filas) {
      expect(fila.actor_id).toBe(operador)
      expect(fila.metadatos).toMatchObject({
        modo: "ASISTIDO",
        anunciante_id: ANUNCIANTE_E2E.id,
      })
    }
  })

  test("el anunciante ve la campaña del equipo AMO, el historial y el aviso", async ({
    page,
  }) => {
    expect(ofertaId).not.toBe("")
    await ingresarComoAnunciante(page, { destino: `/campanas/${campanaId}` })
    await expect(
      page.getByRole("heading", { level: 1, name: nombre })
    ).toBeVisible()
    await expect(page.getByText("Creada por el equipo AMO")).toBeVisible()

    await page.goto(`/campanas/${campanaId}/ofertas/${ofertaId}`)
    await esperarStreaming(page)
    await expect(
      page.getByRole("heading", { level: 1, name: titulo })
    ).toBeVisible()
    await expect(
      page.getByRole("list", { name: "Cambios de la oferta" })
    ).toContainText("Equipo AMO")
    await esperarSinDesbordeHorizontal(page)

    // El aviso a la empresa: en la base y en su bandeja.
    const persona = await usuarioAnunciante()
    const { data, error } = await crearClienteServicio(entorno)
      .from("notificaciones")
      .select("mensaje")
      .eq("usuario_id", persona.id)
      .eq("entidad", "ofertas")
      .eq("entidad_id", ofertaId)
    if (error) throw new Error(`No se pudo leer los avisos: ${error.message}`)
    const mensaje = `El equipo AMO envió a revisión la oferta «${titulo}» por cuenta de tu empresa.`
    expect(data.map((fila) => fila.mensaje)).toContain(mensaje)
    await page.goto("/notificaciones")
    await esperarStreaming(page)
    await expect(page.getByText(mensaje).first()).toBeVisible()
  })
})
