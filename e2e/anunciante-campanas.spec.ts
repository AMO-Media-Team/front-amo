import {
  anuncianteDemo,
  anunciantesAjenos,
  clienteDeLectura,
} from "./utilidades/datos-demo"
import {
  ingresarComoAnunciante,
  restablecerAnuncianteNuevoE2E,
} from "./utilidades/anunciantes"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import {
  borrarCampanasE2E,
  crearCampanaE2E,
  crearOfertaE2E,
  leerEstadoOferta,
  type OfertaE2E,
} from "./utilidades/negocio"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import {
  expect,
  type Locator,
  type Page,
  respuestaConEstado,
  test,
} from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * «Mis campañas» del anunciante (paquete CA: ANU-002, ANU-003, ANU-014) e
 * Inicio contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil; sesión demo del anunciante): el
 *   listado de su empresa con filtro y búsqueda en la URL, la ficha con sus
 *   pestañas y el desvío de `/campanas/[id]/ofertas`; la campaña de otra
 *   empresa no existe para él.
 * - Escribe (solo en el proyecto «anunciante», en serie): con «Anunciante E2E»
 *   crea una campaña (nombre único por corrida), la edita y la activa; con una
 *   oferta publicada (fábrica de E0) el presupuesto no baja de lo
 *   comprometido; la cancela con motivo y su oferta se cancela con ella;
 *   cancelada, la archiva y sale del listado. Con «Anunciante Nuevo E2E» (sin
 *   verificar) activar está bloqueado y explicado, también en su inicio, y el
 *   borrador se puede archivar. Al terminar borra lo que creó.
 */

/** Prefijo de las campañas de esta suite (lo usa la limpieza). */
const PREFIJO = "Campaña CA E2E"

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

/**
 * Elige un día en el calendario de un `CampoFecha`: abre el selector (que
 * muestra el mes de `desde`), avanza los meses que hagan falta y toca el día
 * por su nombre accesible («jueves, 22 de octubre de 2026»).
 */
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
    // El calendario ya muestra el mes siguiente antes de buscar el día.
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

// ── Utilidades de la ficha ───────────────────────────────────────────────────

const RUTA_FICHA = /\/campanas\/([0-9a-f-]{36})$/

function idDeFicha(page: Page): string {
  const id = new URL(page.url()).pathname.match(RUTA_FICHA)?.[1]
  if (!id) throw new Error(`No es la ficha de una campaña: ${page.url()}`)
  return id
}

/** Si la campaña quedó archivada (`deleted_at`): su empresa ya no la ve. */
async function campanaArchivada(id: string): Promise<boolean> {
  const { data, error } = await clienteDeLectura()
    .from("campanas")
    .select("deleted_at")
    .eq("id", id)
    .single()
  if (error)
    throw new Error(`No se pudo leer la campaña ${id}: ${error.message}`)
  return data.deleted_at !== null
}

function cabecera(page: Page): Locator {
  return page
    .locator("header")
    .filter({ has: page.getByRole("heading", { level: 1 }) })
}

/** Enlaces a fichas del listado (fila en escritorio, tarjeta en móvil). */
function fichasDelListado(page: Page): Locator {
  return page
    .getByRole("region", { name: "Campañas de tu empresa", exact: true })
    .locator('a[href^="/campanas/"]:not([href="/campanas/nueva"])')
    .filter({ visible: true })
}

const TOTAL = /^1–\d+ de ([\d.]+)$/

async function totalDe(page: Page): Promise<number> {
  const resumen = page
    .getByRole("navigation", { name: "Paginación de la tabla" })
    .getByText(TOTAL)
  await expect(resumen).toBeVisible()
  const total = (await resumen.innerText()).match(TOTAL)?.[1] ?? ""
  return Number(total.replaceAll(".", ""))
}

// ── Solo lectura ─────────────────────────────────────────────────────────────

test.describe("mis campañas · solo lectura", () => {
  test.use({ storageState: sesion("anunciante") })

  test("lista las campañas de su empresa con filtro y búsqueda en la URL", async ({
    page,
  }) => {
    await page.goto("/campanas")
    await expect(
      page.getByRole("heading", { level: 1, name: "Mis campañas" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Resumen de tus campañas" })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Crear campaña" }).first()
    ).toHaveAttribute("href", "/campanas/nueva")
    const todas = await totalDe(page)
    expect(todas).toBeGreaterThan(1)

    await test.step("el filtro por estado queda en la URL", async () => {
      const region = page.getByRole("region", {
        name: "Campañas de tu empresa",
        exact: true,
      })
      await region
        .getByRole("button", { name: "Estado", exact: true })
        .first()
        .click()
      await page
        .getByRole("option", { name: "Finalizada", exact: true })
        .click()
      await expect.poll(() => parametro(page, "estado")).toBe("FINALIZADA")
      await page.keyboard.press("Escape")
      await expect.poll(() => totalDe(page)).toBeLessThan(todas)
      await region.getByRole("button", { name: "Limpiar" }).click()
      await expect.poll(() => parametro(page, "estado")).toBeNull()
    })

    const nombre = (await fichasDelListado(page).first().innerText()).trim()
    const encontrada = fichasDelListado(page)
      .filter({ hasText: nombre })
      .first()

    await test.step("la búsqueda queda en la URL y encuentra la campaña", async () => {
      await page
        .getByRole("searchbox", { name: "Buscar por campaña o marca" })
        .fill(nombre)
      await expect.poll(() => parametro(page, "q")).toBe(nombre)
      await expect(encontrada).toBeVisible()
      await expect.poll(() => totalDe(page)).toBeLessThan(todas)
      await esperarSinDesbordeHorizontal(page)
    })

    await test.step("la ficha muestra su resumen y sus pestañas", async () => {
      await encontrada.click()
      await expect(page).toHaveURL(RUTA_FICHA)
      await expect(
        page.getByRole("heading", { level: 1, name: nombre })
      ).toBeVisible()
      await expect(
        page.getByRole("region", { name: "Resumen de la campaña" })
      ).toBeVisible()
      await expect(page.getByRole("tab", { name: /^Ofertas/ })).toHaveAttribute(
        "aria-selected",
        "true"
      )
      await page.getByRole("tab", { name: "Datos" }).click()
      await expect.poll(() => parametro(page, "pestana")).toBe("datos")
      await expect(
        page.getByRole("heading", { level: 2, name: "Datos de la campaña" })
      ).toBeVisible()
      const migas = page.getByRole("navigation", { name: "Ruta de navegación" })
      await expect(
        migas.getByRole("link", { name: "Mis campañas" })
      ).toBeVisible()
      await esperarSinDesbordeHorizontal(page)
    })

    await test.step("/campanas/[id]/ofertas lleva a la pestaña de ofertas", async () => {
      const id = idDeFicha(page)
      await page.goto(`/campanas/${id}/ofertas`)
      await expect(page).toHaveURL(`/campanas/${id}?pestana=ofertas`)
      await expect(
        page.getByRole("heading", { level: 2, name: "Ofertas de la campaña" })
      ).toBeVisible()
    })
  })

  test("la campaña de otra empresa no existe para él (ANU-002)", async ({
    page,
    guardia,
  }) => {
    guardia.permitir(respuestaConEstado(404))
    const servicio = clienteDeLectura()
    const [ajeno] = await anunciantesAjenos(
      servicio,
      await anuncianteDemo(servicio)
    )
    await page.goto(`/campanas/${ajeno.campanaId}`)
    await expect(
      page.getByRole("heading", { name: "No encontramos lo que buscas" })
    ).toBeVisible()
    expect(await page.content()).not.toContain(ajeno.nombre)
  })
})

// ── Escribe: «Anunciante E2E» (verificado) ───────────────────────────────────

test.describe("mis campañas · crear, editar, activar y cancelar", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  const nombre = `${PREFIJO} ${sufijoUnico()}`
  const editado = `${nombre} (editada)`
  let campanaId = ""
  let oferta: OfertaE2E | null = null

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Crea y cancela campañas del Anunciante E2E: corre solo en el proyecto «anunciante», en serie."
    )
    await borrarCampanasE2E({ prefijo: PREFIJO })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarCampanasE2E({ prefijo: PREFIJO })
  })

  test("crea una campaña en borrador y la edita", async ({ page }) => {
    const hoy = hoyEnBogota()
    await ingresarComoAnunciante(page, { destino: "/campanas" })
    await page
      .getByRole("main")
      .getByRole("link", { name: "Crear campaña" })
      .first()
      .click()
    await expect(page).toHaveURL(/\/campanas\/nueva$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Nueva campaña" })
    ).toBeVisible()

    const formulario = page.getByRole("form", { name: "Nueva campaña" })
    await formulario.getByLabel("Nombre de la campaña").fill(nombre)
    await formulario.getByLabel("Marca o producto").fill("Marca E2E")
    await formulario
      .getByLabel(/^Objetivo/)
      .fill("Probar de punta a punta la gestión de campañas.")
    await elegirFecha(page, "Fecha de inicio", hoy, hoy)
    await elegirFecha(page, "Fecha de fin", sumarDias(hoy, 45), hoy)
    await expect(formulario.getByText("La campaña dura")).toHaveText(
      "La campaña dura 46 días."
    )
    await formulario.getByLabel("Presupuesto total").fill("30.000.000")
    await formulario.getByRole("button", { name: "Crear campaña" }).click()

    await expect(page).toHaveURL(RUTA_FICHA)
    campanaId = idDeFicha(page)
    await expect(
      page.getByRole("heading", { level: 1, name: nombre })
    ).toBeVisible()
    await expect(
      cabecera(page).getByText("Borrador", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("Esta campaña aún no tiene ofertas")
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Nueva oferta" })
    ).toHaveAttribute("href", `/campanas/${campanaId}/ofertas/nueva`)

    await page.getByRole("link", { name: "Editar", exact: true }).click()
    await expect(page).toHaveURL(`/campanas/${campanaId}/editar`)
    const edicion = page.getByRole("form", {
      name: `Editar la campaña ${nombre}`,
    })
    await edicion.getByLabel("Nombre de la campaña").fill(editado)
    await edicion.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(page).toHaveURL(`/campanas/${campanaId}`)
    await expect(
      page.getByRole("heading", { level: 1, name: editado })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })

  test("la activa: la empresa está verificada", async ({ page }) => {
    await ingresarComoAnunciante(page, { destino: `/campanas/${campanaId}` })
    const activar = page.getByRole("button", { name: "Activar campaña" })
    await expect(activar).toBeEnabled()
    await activar.click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Activar la campaña?",
    })
    await dialogo.getByRole("button", { name: "Activar campaña" }).click()
    await expect(dialogo).toBeHidden()
    await expect(
      cabecera(page).getByText("Activa", { exact: true })
    ).toBeVisible()
    // «Activar» desaparece: el foco va al título de la ficha, no a <body>.
    await expect(
      page.getByRole("heading", { level: 1, name: editado })
    ).toBeFocused()
    await expect(
      page.getByRole("button", { name: "Cancelar campaña" })
    ).toBeVisible()
    // Una activa no se archiva: primero se cancela.
    await expect(
      page.getByRole("button", { name: "Archivar campaña" })
    ).toHaveCount(0)
  })

  test("el presupuesto no baja de lo comprometido por sus ofertas", async ({
    page,
  }) => {
    oferta = await crearOfertaE2E({
      campanaId,
      estado: "PUBLICADA",
      presupuesto: 5_000_000,
    })
    await ingresarComoAnunciante(page, { destino: `/campanas/${campanaId}` })
    await expect(
      page
        .getByRole("region", { name: "Resumen de la campaña" })
        .getByText(/5\.000\.000 reservados por tus ofertas/)
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: oferta.titulo })
    ).toHaveAttribute("href", `/campanas/${campanaId}/ofertas/${oferta.id}`)

    await page.goto(`/campanas/${campanaId}/editar`)
    const presupuesto = page.getByLabel("Presupuesto total")
    await expect(
      page.getByText(/^No puede quedar por debajo de \$\s5\.000\.000/)
    ).toBeVisible()
    await presupuesto.fill("4.000.000")
    await page.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(
      page.getByText(
        /^El presupuesto no puede quedar por debajo de \$\s5\.000\.000/
      )
    ).toBeVisible()
    await expect(presupuesto).toHaveAttribute("aria-invalid", "true")
    await expect(page).toHaveURL(`/campanas/${campanaId}/editar`)
  })

  test("la cancela con motivo y su oferta sin compromisos se cancela con ella", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, { destino: `/campanas/${campanaId}` })
    await page.getByRole("button", { name: "Cancelar campaña" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Cancelar «${editado}»?`,
    })
    // ANU-014: lo verificado o pagado no la impide; lo que sigue en curso, sí.
    await expect(dialogo).toContainText(
      "si lo que los medios ya aceptaron está verificado o pagado"
    )
    await dialogo
      .getByLabel("Motivo de la cancelación")
      .fill("La campaña se aplazó para otra fecha.")
    await dialogo.getByRole("button", { name: "Cancelar campaña" }).click()
    await expect(dialogo).toBeHidden()

    await expect(
      cabecera(page).getByText("Cancelada", { exact: true })
    ).toBeVisible()
    await expect(page.getByText(/^Campaña cancelada el /)).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Editar", exact: true })
    ).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Nueva oferta" })).toHaveCount(
      0
    )
    if (!oferta) throw new Error("La prueba anterior no creó la oferta.")
    await expect
      .poll(async () => (await leerEstadoOferta(oferta as OfertaE2E)).estado)
      .toBe("CANCELADA")
  })

  test("cancelada, la archiva y sale del listado con su oferta", async ({
    page,
    guardia,
  }) => {
    guardia.permitir(respuestaConEstado(404))
    await ingresarComoAnunciante(page, { destino: `/campanas/${campanaId}` })
    await page.getByRole("button", { name: "Archivar campaña" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Archivar «${editado}»?`,
    })
    await expect(dialogo).toContainText("el equipo AMO conserva su historial")
    await dialogo.getByRole("button", { name: "Archivar campaña" }).click()

    // Vuelve al listado y la campaña ya no está.
    await expect(page).toHaveURL(/\/campanas$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Mis campañas" })
    ).toBeVisible()
    await expect(
      fichasDelListado(page).filter({ hasText: editado })
    ).toHaveCount(0)
    expect(await campanaArchivada(campanaId)).toBe(true)
    if (!oferta) throw new Error("La prueba anterior no creó la oferta.")
    const { data } = await clienteDeLectura()
      .from("ofertas")
      .select("deleted_at")
      .eq("id", oferta.id)
      .single()
    expect(data?.deleted_at).not.toBeNull()

    // Para su empresa ya no existe.
    await page.goto(`/campanas/${campanaId}`)
    await expect(
      page.getByRole("heading", { name: "No encontramos lo que buscas" })
    ).toBeVisible()
  })
})

// ── Escribe: «Anunciante Nuevo E2E» (sin verificar) ──────────────────────────

test.describe("mis campañas · empresa sin verificar", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Reinicia el Anunciante Nuevo E2E: corre solo en el proyecto «anunciante», en serie."
    )
    await restablecerAnuncianteNuevoE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarCampanasE2E({ cuenta: "ANUNCIANTE_NUEVO", prefijo: PREFIJO })
  })

  test("activar está bloqueado y explicado; el inicio dice qué falta", async ({
    page,
  }) => {
    const campana = await crearCampanaE2E({
      cuenta: "ANUNCIANTE_NUEVO",
      estado: "BORRADOR",
      nombre: `${PREFIJO} ${sufijoUnico()}`,
    })
    await ingresarComoAnunciante(page, {
      cuenta: "ANUNCIANTE_NUEVO",
      destino: `/campanas/${campana.id}`,
    })

    const activar = page.getByRole("button", { name: "Activar campaña" })
    await expect(activar).toBeDisabled()
    await expect(activar).toHaveAccessibleDescription(
      "Podrás activarla cuando AMO verifique tu empresa."
    )
    const aviso = page.getByRole("region", {
      name: "Verifica tu empresa para activar campañas",
    })
    await expect(aviso).toBeVisible()
    await expect(
      aviso.getByRole("link", { name: "Completar mi empresa" })
    ).toHaveAttribute("href", "/empresa")
    // Puede seguir armando la campaña mientras tanto (o archivar el borrador).
    await expect(page.getByRole("link", { name: "Nueva oferta" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Archivar campaña" })
    ).toBeVisible()

    await page.goto("/inicio")
    await expect(
      page.getByRole("region", {
        name: "Verifica tu empresa para activar campañas",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Campañas activas" })
    ).toContainText("No tienes campañas activas")
    await esperarSinDesbordeHorizontal(page)
  })
})
