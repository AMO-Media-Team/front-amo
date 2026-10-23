import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { parametro } from "./utilidades/interfaz"
import {
  CUENTA_MEDIO_VERIFICADO,
  MEDIO_NUEVO,
  MEDIO_VERIFICADO,
} from "./utilidades/medios"
import { expect, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Verificación de medios (ADM-001) y pertinencia geográfica (ADM-006) contra
 * `pnpm build && pnpm start`, con la sesión interna (administrador) y los
 * medios del aprovisionamiento E2E: «Medio E2E» (verificado nivel 1, con
 * documentos y cuenta) y «Medio Nuevo E2E» (pendiente, sin nada).
 *
 * Lo que corre en los tres proyectos solo lee. Lo que escribe corre solo en
 * escritorio: la decisión sobre el medio nuevo la rechaza la BD (no cambia
 * nada) y la pertinencia se crea, se ajusta y se quita en la misma prueba.
 */

const RUTA_COLAS = "/operacion/verificacion"

/** Municipio de prueba para la pertinencia (Antioquia, como el Medio E2E). */
const MUNICIPIO = {
  codigo: "05266",
  nombre: "Envigado",
  departamento: "Antioquia",
}

function rutaFicha(medioId: string, pestana: string): string {
  return `/operacion/medios/${medioId}?pestana=${pestana}`
}

function colas(page: Page) {
  return page.getByRole("navigation", { name: "Colas de verificación" })
}

test.use({ storageState: sesion("interno") })

test("las colas se recorren por la URL con lo pendiente en cada una", async ({
  page,
}) => {
  await page.goto(RUTA_COLAS)
  await expect(
    page.getByRole("heading", { level: 1, name: "Verificación" })
  ).toBeVisible()
  // Medios, anunciantes (fase 2), cuentas, documentos y solicitudes.
  await expect(colas(page).getByRole("link")).toHaveCount(5)
  await expect(
    colas(page).getByRole("link", { name: /^Medios:/ })
  ).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByRole("heading", { level: 2, name: "Medios", exact: true })
  ).toBeVisible()

  await colas(page)
    .getByRole("link", { name: /^Documentos:/ })
    .click()
  await expect.poll(() => parametro(page, "cola")).toBe("documentos")
  await expect(
    page.getByRole("heading", { level: 2, name: "Documentos", exact: true })
  ).toBeVisible()
  await expect(
    page
      .getByRole("list", { name: "Documentos por revisar" })
      .or(page.getByText("No hay documentos por revisar."))
  ).toBeVisible()

  // Los parámetros son contrato con los enlaces de las notificaciones (/ir).
  for (const [cola, titulo] of [
    ["cuentas", "Cuentas"],
    ["solicitudes", "Solicitudes"],
  ] as const) {
    await page.goto(`${RUTA_COLAS}?cola=${cola}`)
    await expect(
      page.getByRole("heading", { level: 2, name: titulo, exact: true })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
  }

  // Una cola desconocida cae en la de medios.
  await page.goto(`${RUTA_COLAS}?cola=otra`)
  await expect(
    colas(page).getByRole("link", { name: /^Medios:/ })
  ).toHaveAttribute("aria-current", "page")
})

test("la ficha del medio verificado muestra su expediente", async ({
  page,
}) => {
  await page.goto(rutaFicha(MEDIO_VERIFICADO.id, "verificacion"))
  await expect(page.getByRole("tab", { name: "Verificación" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  const panel = page.getByRole("tabpanel", { name: "Verificación" })
  await expect(panel.getByText("Verificado en el nivel 1")).toBeVisible()

  // En su nivel actual no hay cambio posible; en otro, sí (con motivo).
  await panel.getByRole("radio", { name: /^Nivel 1/ }).click()
  await expect(
    panel.getByRole("button", { name: "Elige otro nivel para cambiarlo" })
  ).toBeDisabled()
  await expect(panel.getByText(/^4 de 4 al día$/)).toBeVisible()
  await panel.getByRole("radio", { name: /^Nivel 2/ }).click()
  await expect(
    panel.getByRole("button", { name: "Cambiar al nivel 2" })
  ).toBeEnabled()

  // El documento se ve con una URL firmada como servicio (queda en la bitácora).
  await panel.getByRole("button", { name: "Ver cédula (frente)" }).click()
  const hoja = page.getByRole("dialog", { name: "Cédula (frente)" })
  await expect(
    hoja.getByRole("img", {
      name: `Cédula (frente) de ${MEDIO_VERIFICADO.nombre}`,
    })
  ).toBeVisible()
  await hoja.getByRole("button", { name: "Cerrar" }).click()
  await expect(hoja).toBeHidden()

  await expect(
    panel.getByRole("link", {
      name: `@${CUENTA_MEDIO_VERIFICADO.handle} en Instagram (abre en una pestaña nueva)`,
    })
  ).toBeVisible()
})

test.describe("decisiones que la BD no deja pasar", () => {
  test.beforeEach(({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Llama a la BD con el medio de prueba: corre solo en escritorio."
    )
  })

  test("verificar un medio sin requisitos explica lo que falta y no cambia nada", async ({
    page,
  }) => {
    await page.goto(rutaFicha(MEDIO_NUEVO.id, "verificacion"))
    const panel = page.getByRole("tabpanel", { name: "Verificación" })
    // Otros specs le cargan documentos o lo envían, pero nadie se los aprueba.
    await panel.getByRole("button", { name: "Verificar en el nivel 1" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Verificar ${MEDIO_NUEVO.nombre} en el nivel 1?`,
    })
    await dialogo
      .getByRole("button", { name: "Verificar", exact: true })
      .click()
    // El detalle de la BD llega con nombres legibles y el diálogo sigue abierto.
    await expect(dialogo).toContainText(
      /Faltan documentos aprobados y vigentes: .*Cédula \(frente\)/
    )
    await dialogo.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialogo).toBeHidden()
    await expect(
      panel.getByRole("button", { name: "Verificar en el nivel 1" })
    ).toBeVisible()

    await panel.getByRole("button", { name: "Rechazar", exact: true }).click()
    const rechazo = page.getByRole("alertdialog", {
      name: `¿Rechazar la verificación de ${MEDIO_NUEVO.nombre}?`,
    })
    await rechazo.getByRole("button", { name: "Rechazar verificación" }).click()
    await expect(rechazo.getByRole("alert")).toHaveText(
      "Describe el motivo (al menos 5 caracteres)."
    )
    await rechazo.getByRole("button", { name: "Cancelar" }).click()
    await expect(rechazo).toBeHidden()
  })
})

test.describe("pertinencia geográfica", () => {
  let servicio: ClienteSupabase

  async function multiplicadorGuardado(): Promise<number | null> {
    const { data, error } = await servicio
      .from("medio_pertinencia_geografica")
      .select("multiplicador")
      .eq("medio_id", MEDIO_VERIFICADO.id)
      .eq("municipio_codigo", MUNICIPIO.codigo)
      .maybeSingle()
    if (error) throw new Error(`No se pudo leer: ${error.message}`)
    return data?.multiplicador ?? null
  }

  async function limpiar(): Promise<void> {
    const { error } = await servicio
      .from("medio_pertinencia_geografica")
      .delete()
      .eq("medio_id", MEDIO_VERIFICADO.id)
      .eq("municipio_codigo", MUNICIPIO.codigo)
    if (error) throw new Error(`No se pudo limpiar: ${error.message}`)
  }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cambia datos del Medio E2E: corre solo en escritorio."
    )
    servicio = clienteDeLectura()
    await limpiar()
  })

  // Red de seguridad: si la prueba falla a medias, el medio queda como estaba.
  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    await limpiar()
  })

  test("clasifica un municipio, ajusta su multiplicador y lo quita", async ({
    page,
  }) => {
    await page.goto(rutaFicha(MEDIO_VERIFICADO.id, "pertinencia"))
    const panel = page.getByRole("tabpanel", { name: "Pertinencia" })
    await panel
      .getByRole("button", { name: "Clasificar municipio" })
      .first()
      .click()

    const hoja = page.getByRole("dialog", { name: "Clasificar municipio" })
    await hoja.getByRole("combobox", { name: "Departamento" }).click()
    await page
      .getByRole("combobox", { name: "Busca un departamento…" })
      .fill(MUNICIPIO.departamento)
    await page
      .getByRole("option", { name: MUNICIPIO.departamento, exact: true })
      .click()
    await page
      .getByRole("combobox", { name: "Busca un municipio…" })
      .fill(MUNICIPIO.nombre)
    await page
      .getByRole("option", { name: MUNICIPIO.nombre, exact: true })
      .click()
    await expect(
      hoja.getByRole("combobox", { name: "Municipio" })
    ).toContainText(MUNICIPIO.nombre)

    const multiplicador = hoja.getByRole("textbox", { name: "Multiplicador" })
    await multiplicador.fill("1,2")
    // El ICU del navegador puede separar el «%» con un espacio duro.
    await expect(hoja.getByText(/Sube el precio 20\s?%/)).toBeVisible()
    await hoja
      .getByRole("textbox", { name: /^Notas/ })
      .fill("Prueba automatizada: audiencia del sur del Valle de Aburrá.")
    await hoja.getByRole("button", { name: "Clasificar", exact: true }).click()
    await expect(hoja).toBeHidden()

    const fila = panel.getByRole("row", { name: new RegExp(MUNICIPIO.nombre) })
    await expect(fila).toContainText("1,200 ×")
    expect(await multiplicadorGuardado()).toBe(1.2)

    await panel
      .getByRole("button", { name: `Editar ${MUNICIPIO.nombre}` })
      .click()
    const edicion = page.getByRole("dialog", {
      name: `Pertinencia en ${MUNICIPIO.nombre}`,
    })
    await edicion.getByRole("button", { name: "Bajar 0,05" }).click()
    await expect(
      edicion.getByRole("textbox", { name: "Multiplicador" })
    ).toHaveValue("1,150")
    await edicion.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(edicion).toBeHidden()
    await expect(fila).toContainText("1,150 ×")
    expect(await multiplicadorGuardado()).toBe(1.15)

    await panel
      .getByRole("button", { name: `Quitar ${MUNICIPIO.nombre}` })
      .click()
    const confirmacion = page.getByRole("alertdialog", {
      name: `¿Quitar ${MUNICIPIO.nombre}?`,
    })
    await confirmacion
      .getByRole("button", { name: "Quitar", exact: true })
      .click()
    await expect(confirmacion).toBeHidden()
    await expect(fila).toHaveCount(0)
    expect(await multiplicadorGuardado()).toBeNull()
  })
})
