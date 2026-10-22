import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import {
  ingresarComoMedio,
  restablecerMedioNuevoE2E,
} from "./utilidades/medios"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * «Mi medio» (paquete MM: MED-002, MED-004, MED-007) contra `pnpm build &&
 * pnpm start` y el Supabase de pruebas, con las cuentas del aprovisionamiento
 * E2E (`pnpm bootstrap:e2e`):
 *
 * - «Medio E2E» (`E2E_MEDIO_*`): VERIFICADO nivel 1 con pago y documentos al
 *   día. Solo se lee: corre en escritorio, tablet y móvil.
 * - «Medio Nuevo E2E» (`E2E_MEDIO_NUEVO_*`): la prueba recorre su lista de
 *   alta (perfil y pago) a 390 px. Lo devuelve a recién registrado antes y
 *   después, así que corre solo en el proyecto con cuentas y en serie.
 */

const MOVIL = { width: 390, height: 844 }

function listaAlta(page: Page): Locator {
  return page.getByRole("region", { name: "Lista de alta" })
}

function barraGuardar(page: Page): Locator {
  return page.getByRole("region", { name: "Cambios sin guardar" })
}

/** Paso de la lista de alta: el renglón entero es el enlace. */
function paso(page: Page, titulo: string): Locator {
  return listaAlta(page).getByRole("link", { name: new RegExp(`^${titulo}`) })
}

async function elegirOpcion(
  page: Page,
  campo: string,
  opcion: string
): Promise<void> {
  await page.getByRole("combobox", { name: campo }).click()
  await page.getByRole("option", { name: opcion, exact: true }).click()
  await expect(page.getByRole("combobox", { name: campo })).toHaveText(opcion)
}

/** Diez dígitos que no chocan con otra corrida (huella única entre medios). */
function cedulaDePrueba(): string {
  return `1${String(Date.now()).slice(-9)}`
}

test.describe("mi medio · medio verificado", () => {
  test("ve su situación, su nivel con el tope y solo resúmenes de su pago", async ({
    page,
  }) => {
    await ingresarComoMedio(page, { destino: "/mi-medio" })

    await expect(
      page.getByRole("heading", { name: "Tu medio está verificado" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Tu información" })
    ).toBeVisible()
    await expect(listaAlta(page)).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: /enviar a verificación/i })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    await page.getByRole("link", { name: /Ver mi nivel y cómo subir/ }).click()
    await expect(page).toHaveURL(/\/mi-medio\/nivel$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Nivel de verificación" })
    ).toBeVisible()
    await expect(
      page.getByText("Nivel 1 · Persona natural informal", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("meter", { name: "Avance del tope anual" })
    ).toBeVisible()
    const camino = page.getByRole("region", { name: "Cómo subir al nivel 2" })
    await expect(camino.getByText("RUT", { exact: true })).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // «Cargar documentos» abre la lista en el nivel objetivo, no en el actual.
    await camino.getByRole("link", { name: /Cargar documentos/ }).click()
    await expect(page).toHaveURL(/\/mi-medio\/documentos\?nivel=2$/)
    await expect(page.getByRole("radio", { name: "Nivel 2" })).toBeChecked()

    await page.goto("/mi-medio/pago")
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Pago y condición tributaria",
      })
    ).toBeVisible()
    await expect(page.getByText(/^Registrado: .+ •••• \w{4}\./)).toBeVisible()
    await expect(page.getByLabel("Número de documento nuevo")).toHaveValue("")
    await expect(
      page.getByRole("button", { name: "Cambiar de cuenta" })
    ).toBeVisible()
    await expect(page.getByText(/•••• \d{4}$/).first()).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // Verificado: Inicio muestra sus indicadores, no la lista de alta.
    await page.goto("/inicio")
    await expect(
      page.getByRole("meter", { name: "Avance del tope anual" })
    ).toBeVisible()
    await expect(listaAlta(page)).toHaveCount(0)
  })
})

test.describe("mi medio · alta de un medio nuevo", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ viewport: MOVIL })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cambia el medio nuevo: corre solo en el proyecto con cuentas."
    )
    await restablecerMedioNuevoE2E()
  })
  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS) {
      await restablecerMedioNuevoE2E()
    }
  })

  test("Inicio muestra la lista de alta en lugar de indicadores vacíos", async ({
    page,
  }) => {
    await ingresarComoMedio(page, { cuenta: "MEDIO_NUEVO" })

    await expect(
      page.getByRole("heading", { name: "Completa el alta de tu medio" })
    ).toBeVisible()
    await expect(listaAlta(page)).toBeVisible()
    await expect(
      page.getByRole("meter", { name: "Avance del tope anual" })
    ).toHaveCount(0)
    const enviar = page.getByRole("button", { name: "Enviar a verificación" })
    await expect(enviar).toHaveAttribute("aria-disabled", "true")
    await expect(enviar).toHaveAccessibleDescription(
      /^Para enviar a verificación completa /
    )
    await esperarSinDesbordeHorizontal(page)
  })

  test("completa su perfil con temas, descripción y audiencia", async ({
    page,
  }) => {
    const descripcion = `Jóvenes de Cali que siguen el deporte local (prueba ${Date.now()}).`
    await ingresarComoMedio(page, {
      cuenta: "MEDIO_NUEVO",
      destino: "/mi-medio",
    })
    await expect(paso(page, "Perfil del medio")).toContainText("En curso")
    await paso(page, "Perfil del medio").click()
    await expect(page).toHaveURL(/\/mi-medio\/perfil$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Perfil del medio" })
    ).toBeVisible()
    await expect(barraGuardar(page)).toHaveCount(0)

    await page
      .getByRole("group", { name: "Temas de tu contenido" })
      .getByRole("checkbox", { name: "Deportes" })
      .check()
    await page.getByLabel("Describe a tu audiencia").fill(descripcion)
    await page.getByRole("button", { name: "Agregar un país" }).click()
    // La primera fila sugiere Colombia y lleva el foco al porcentaje.
    const porcentaje = page.getByLabel(
      "Porcentaje de la audiencia en el país 1"
    )
    await expect(porcentaje).toBeFocused()
    await porcentaje.fill("85")
    await esperarSinDesbordeHorizontal(page)

    await barraGuardar(page)
      .getByRole("button", { name: "Guardar perfil" })
      .click()
    await expect(page.getByText("Perfil guardado")).toBeVisible()
    await expect(barraGuardar(page)).toHaveCount(0)

    await page.reload()
    await expect(page.getByLabel("Describe a tu audiencia")).toHaveValue(
      descripcion
    )
    await expect(page.getByRole("checkbox", { name: "Deportes" })).toBeChecked()
    await expect(
      page.getByLabel("Porcentaje de la audiencia en el país 1")
    ).toHaveValue("85")

    await page.goto("/mi-medio")
    await expect(paso(page, "Perfil del medio")).toContainText("Listo")
  })

  test("registra su pago cifrado y la interfaz no vuelve a mostrar los números", async ({
    page,
  }) => {
    const cedula = cedulaDePrueba()
    const celular = `300${cedula.slice(-7)}`
    await ingresarComoMedio(page, {
      cuenta: "MEDIO_NUEVO",
      destino: "/mi-medio/pago",
    })
    await expect(page.getByText("Tus datos van cifrados")).toBeVisible()

    await page.getByLabel("Nombre del titular").fill("Titular Medio Nuevo E2E")
    await elegirOpcion(page, "Tipo de documento", "Cédula de ciudadanía")
    await page.getByLabel("Número de documento").fill(cedula)
    await page.getByRole("radio", { name: /Billetera digital/ }).click()
    await elegirOpcion(page, "Billetera", "Nequi")
    await page.getByLabel("Celular de la billetera").fill(celular)
    await page.getByRole("switch", { name: /Declaro renta/ }).click()
    await esperarSinDesbordeHorizontal(page)

    await barraGuardar(page)
      .getByRole("button", { name: "Guardar datos de pago" })
      .click()
    await expect(page.getByText("Datos de pago guardados")).toBeVisible()
    await expect(barraGuardar(page)).toHaveCount(0)

    // Solo resúmenes: ni el documento ni el celular completos en la página.
    await expect(
      page.getByText(`Registrado: CC •••• ${cedula.slice(-4)}.`, {
        exact: false,
      })
    ).toBeVisible()
    await expect(
      page.getByText(`Nequi •••• ${celular.slice(-4)}`)
    ).toBeVisible()
    await expect(page.getByLabel("Número de documento nuevo")).toHaveValue("")
    await expect(page.locator("body")).not.toContainText(cedula)
    await expect(page.locator("body")).not.toContainText(celular)
    await expect(
      page.getByRole("region", {
        name: "Falta la certificación de billetera de tu cuenta",
      })
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole("switch", { name: /Declaro renta/ })
    ).toBeChecked()
    await expect(page.locator("body")).not.toContainText(cedula)

    await page.goto("/mi-medio")
    await expect(paso(page, "Pago y condición tributaria")).toContainText(
      "Listo"
    )
    // Faltan documentos y cuentas: el envío sigue bloqueado y dice qué falta.
    await expect(
      page.getByRole("button", { name: "Enviar a verificación" })
    ).toHaveAttribute("aria-disabled", "true")
  })

  test("ve qué necesita para obtener su nivel 1", async ({ page }) => {
    await ingresarComoMedio(page, {
      cuenta: "MEDIO_NUEVO",
      destino: "/mi-medio/nivel",
    })
    await expect(
      page.getByRole("heading", { name: "Aún no tienes nivel" })
    ).toBeVisible()
    const camino = page.getByRole("region", { name: "Cómo obtener tu nivel 1" })
    await expect(camino.getByText("Lo que debes cargar")).toBeVisible()
    await expect(
      camino.getByText("Prueba de vida", { exact: true })
    ).toBeVisible()
    await expect(camino.getByText("Opcional", { exact: true })).toBeVisible()
    await expect(
      camino.getByRole("link", { name: /Cargar documentos/ })
    ).toHaveAttribute("href", "/mi-medio/documentos?nivel=1")
    await esperarSinDesbordeHorizontal(page)
  })
})
