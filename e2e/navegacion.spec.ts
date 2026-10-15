import { expect, type Page, test } from "./utilidades/prueba"
import { PROYECTO_MOVIL } from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Armazón de la aplicación contra `pnpm build && pnpm start`: barra lateral,
 * migas de pan y tema. En escritorio y tablet la barra lateral está a la
 * vista; en móvil se abre con el botón de la barra superior.
 */

/** Página ligera de partida: el panel de Inicio lanza una docena de consultas. */
const PARTIDA = "/cuenta/perfil"

async function abrirMenuPrincipal(page: Page, proyecto: string) {
  if (proyecto === PROYECTO_MOVIL) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Mostrar u ocultar el menú lateral" })
      .click()
  }
  const principal = page.getByRole("navigation", { name: "Principal" })
  await expect(principal).toBeVisible()
  return principal
}

test.describe("equipo interno", () => {
  test.use({ storageState: sesion("interno") })

  test("la barra lateral lleva a la sección y las migas dicen dónde estás", async ({
    page,
  }, info) => {
    await page.goto(PARTIDA)
    const principal = await abrirMenuPrincipal(page, info.project.name)
    for (const seccion of ["Mapa", "Reportes", "Medios", "Configuración"]) {
      await expect(principal.getByRole("link", { name: seccion })).toBeVisible()
    }

    await principal.getByRole("link", { name: "Campañas" }).click()
    await expect(page).toHaveURL(/\/operacion\/campanas$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Campañas" })
    ).toBeVisible()
    const migas = page.getByRole("navigation", { name: "Ruta de navegación" })
    await expect(migas).toContainText("Operación")
    await expect(migas.getByRole("link", { name: "Campañas" })).toBeVisible()
  })

  test("el tema se cambia desde la barra superior y se recuerda", async ({
    page,
  }) => {
    await page.goto("/reportes")
    const raiz = page.locator("html")
    await expect(raiz).toHaveClass(/\bdark\b/)

    await page.getByRole("button", { name: "Cambiar tema" }).click()
    await page.getByRole("menuitemradio", { name: "Claro" }).click()
    await expect(raiz).toHaveClass(/\blight\b/)
    await expect(raiz).not.toHaveClass(/\bdark\b/)

    await page.reload()
    await expect(raiz).toHaveClass(/\blight\b/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Reportes" })
    ).toBeVisible()
  })
})

test.describe("anunciante", () => {
  test.use({ storageState: sesion("anunciante") })

  test("su menú solo ofrece Inicio y Reportes", async ({ page }, info) => {
    await page.goto(PARTIDA)
    const principal = await abrirMenuPrincipal(page, info.project.name)
    await expect(principal.getByRole("listitem").getByRole("link")).toHaveText([
      "Inicio",
      "Reportes",
    ])
  })
})
