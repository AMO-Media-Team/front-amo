import {
  INFO_SECCIONES,
  SECCIONES,
} from "../src/features/configuracion/secciones"
import { clienteComoSuperadmin } from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { entorno } from "./utilidades/cuentas"
import { parametro } from "./utilidades/interfaz"
import { expect, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Configuración de la plataforma contra `pnpm build && pnpm start` y el
 * Supabase real. La lectura corre en los tres proyectos; la edición cambia un
 * parámetro de bajo impacto, solo en escritorio, y lo deja como estaba (el
 * rastro en la bitácora es inmutable).
 */

const RUTA = "/administracion/configuracion"

/** Plazo de las disputas: no interviene en precios ni en ninguna otra prueba. */
const PARAMETRO = {
  clave: "disputas.plazo_recarga_horas",
  titulo: "Plazo para recargar la evidencia",
  maximo: 168,
}

async function valorGuardado(servicio: ClienteSupabase): Promise<number> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("valor")
    .eq("clave", PARAMETRO.clave)
    .single()
  if (error) throw new Error(`No se pudo leer el parámetro: ${error.message}`)
  return Number(data.valor)
}

function campoNuevoValor(page: Page) {
  return page.getByRole("textbox", {
    name: `Nuevo valor de ${PARAMETRO.titulo}`,
  })
}

async function abrirEditor(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: `Editar ${PARAMETRO.titulo}`, exact: true })
    .click()
  await expect(campoNuevoValor(page)).toBeFocused()
}

/** Edita el parámetro pasando por el diálogo de diferencias. */
async function cambiarValor(
  page: Page,
  { desde, hasta }: { desde: number; hasta: number }
): Promise<void> {
  await abrirEditor(page)
  await campoNuevoValor(page).fill(String(hasta))
  await page.getByRole("button", { name: "Revisar cambio" }).click()

  const revision = page.getByRole("dialog", {
    name: `¿Cambiar «${PARAMETRO.titulo}»?`,
  })
  // El diálogo enfrenta el valor vigente con el propuesto y dice cuánto varía.
  await expect(revision).toContainText(new RegExp(`Valor actual\\s*${desde} h`))
  await expect(revision).toContainText(new RegExp(`Nuevo valor\\s*${hasta} h`))
  await expect(revision).toContainText(
    hasta > desde ? /Variación\s*Sube\s*\+1 h/ : /Variación\s*Baja/
  )
  await revision.getByRole("button", { name: "Aplicar cambio" }).click()
  await expect(revision).toBeHidden()
  await expect(
    page.getByText(`${PARAMETRO.titulo} actualizado`, { exact: true })
  ).toBeVisible()
}

test.use({ storageState: sesion("interno") })

test("cada sección se abre desde la navegación y muestra sus parámetros", async ({
  page,
}) => {
  await page.goto(RUTA)
  await expect(
    page.getByRole("heading", { level: 1, name: "Configuración" })
  ).toBeVisible()
  const secciones = page.getByRole("navigation", {
    name: "Secciones de configuración",
  })
  await expect(secciones.getByRole("link")).toHaveCount(SECCIONES.length)

  await secciones.getByRole("link", { name: /^Precios/ }).click()
  await expect.poll(() => parametro(page, "seccion")).toBe("precios")

  for (const seccion of SECCIONES) {
    await test.step(INFO_SECCIONES[seccion].titulo, async () => {
      await page.goto(`${RUTA}?seccion=${seccion}`)
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: INFO_SECCIONES[seccion].titulo,
          exact: true,
        })
      ).toBeVisible()
      // Cada sección agrupa su contenido en bloques con título propio.
      await expect(
        page.getByRole("main").getByRole("heading", { level: 3 }).first()
      ).toBeVisible()
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    })
  }
})

test("un valor fuera de rango se rechaza con un mensaje claro y no se guarda", async ({
  page,
}) => {
  await page.goto(RUTA)
  await abrirEditor(page)
  await campoNuevoValor(page).fill(String(PARAMETRO.maximo + 1))
  await page.getByRole("button", { name: "Revisar cambio" }).click()

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: `Debe estar entre 1 y ${PARAMETRO.maximo}.` })
  ).toBeVisible()
  await expect(campoNuevoValor(page)).toHaveAttribute("aria-invalid", "true")
  // Sin diálogo de confirmación no hay nada que aplicar.
  await expect(page.getByRole("dialog")).toHaveCount(0)

  await page.getByRole("button", { name: "Cancelar" }).click()
  await expect(campoNuevoValor(page)).toHaveCount(0)
  await expect(
    page.getByRole("button", {
      name: `Editar ${PARAMETRO.titulo}`,
      exact: true,
    })
  ).toBeFocused()
})

test.describe("edición", () => {
  let servicio: ClienteSupabase
  let original: number

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cambia un parámetro real: corre solo en el proyecto de escritorio."
    )
    servicio = await clienteComoSuperadmin(entorno)
    original = await valorGuardado(servicio)
  })

  // Red de seguridad: si la prueba falla a medias, la BD vuelve a su valor.
  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    if ((await valorGuardado(servicio)) === original) return
    const { error } = await servicio
      .from("configuracion")
      .update({ valor: original })
      .eq("clave", PARAMETRO.clave)
    if (error) throw new Error(`No se pudo restaurar: ${error.message}`)
  })

  test("cambia un parámetro revisando la diferencia y lo restaura", async ({
    page,
  }) => {
    const nuevo = original + 1
    const fila = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: PARAMETRO.titulo }) })
    await page.goto(RUTA)
    await expect(fila).toContainText(`${original} h`)

    await cambiarValor(page, { desde: original, hasta: nuevo })
    await expect(fila).toContainText(`${nuevo} h`)
    expect(await valorGuardado(servicio)).toBe(nuevo)
    // El valor sobrevive a una recarga: salió de la base de datos.
    await page.reload()
    await expect(fila).toContainText(`${nuevo} h`)

    await cambiarValor(page, { desde: nuevo, hasta: original })
    await expect(fila).toContainText(`${original} h`)
    expect(await valorGuardado(servicio)).toBe(original)
  })
})
