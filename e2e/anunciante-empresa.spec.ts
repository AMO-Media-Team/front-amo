import { formatearNit } from "../src/lib/colombia/nit"
import {
  ANUNCIANTE_E2E,
  ANUNCIANTE_NUEVO_E2E,
  ingresarComoAnunciante,
  leerEstadoAnunciante,
  restablecerAnuncianteNuevoE2E,
} from "./utilidades/anunciantes"
import { pdfDePrueba } from "./utilidades/archivos"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * «Mi empresa» del anunciante (paquete EM: ANU-001, ANU-002 y ADM-003 del lado
 * de la empresa) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet, móvil y «anunciante»): con «Anunciante
 *   E2E» (verificada) la razón social, el país y el NIT son de solo lectura y
 *   el equipo se ve con la persona de la sesión primero, sin desbordar la
 *   pantalla. Si otra prueba la suspendió en ese momento, la identificación
 *   sigue bloqueada igual.
 * - Escribe (solo en el proyecto «anunciante», en serie): con «Anunciante
 *   Nuevo E2E» (recién registrada) corrige un DV mal escrito, guarda sus datos
 *   y su persona de contacto, carga el RUT y la Cámara de Comercio, la envía a
 *   verificación y la ve «En revisión». Al terminar la devuelve a recién
 *   registrada.
 */

const RUTA = "/empresa"

function sufijoUnico(): string {
  return Date.now().toString(36)
}

function secciones(page: Page): Locator {
  return page.getByRole("navigation", { name: "Secciones de mi empresa" })
}

function tarjeta(page: Page, titulo: string): Locator {
  return page.getByRole("article", { name: titulo, exact: true })
}

/** Carga un documento desde su tarjeta y espera a que quede en revisión. */
async function cargarDocumento(page: Page, titulo: string): Promise<void> {
  const documento = tarjeta(page, titulo)
  await expect(documento.getByText("Sin cargar", { exact: true })).toBeVisible()
  await documento.getByRole("button", { name: "Cargar" }).click()

  const hoja = page.getByRole("dialog", { name: titulo })
  await expect(
    hoja.getByRole("heading", { name: "Para que lo aprueben a la primera" })
  ).toBeVisible()
  const [selector] = await Promise.all([
    page.waitForEvent("filechooser"),
    hoja.getByRole("button", { name: "Elegir archivo" }).click(),
  ])
  await selector.setFiles(await pdfDePrueba({ titulo }))
  await hoja.getByRole("button", { name: "Subir documento" }).click()

  await expect(hoja).toBeHidden()
  await expect(
    documento.getByText("En revisión", { exact: true })
  ).toBeVisible()
  await expect(documento.getByRole("button", { name: "Ver" })).toBeVisible()
}

test.describe("mi empresa · empresa verificada", () => {
  test("la identificación es de solo lectura y el equipo se ve", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, { destino: RUTA })
    await expect(
      page.getByRole("heading", { level: 1, name: "Mi empresa" })
    ).toBeVisible()
    await expect(
      secciones(page).getByRole("link", { name: "Datos" })
    ).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("region", {
        name: /^Tu empresa está (?:verificada|suspendida)$/,
      })
    ).toBeVisible()

    const datos = page.getByRole("form", { name: "Datos de la empresa" })
    const razon = datos.getByRole("textbox", { name: "Razón social" })
    await expect(razon).toHaveValue(ANUNCIANTE_E2E.razonSocial)
    await expect(razon).not.toBeEditable()
    await expect(razon).toHaveAccessibleDescription(
      /solo los corrige el equipo de AMO/
    )
    const nit = datos.getByRole("textbox", { name: "NIT" })
    await expect(nit).toHaveValue(
      formatearNit(ANUNCIANTE_E2E.nit, ANUNCIANTE_E2E.digitoVerificacion)
    )
    await expect(nit).not.toBeEditable()
    await expect(datos.getByRole("textbox", { name: "País" })).toHaveValue(
      "Colombia"
    )
    await expect(
      datos.getByRole("textbox", { name: /dígito de verificación/ })
    ).toHaveCount(0)
    // Lo que no es identificación se sigue editando.
    await expect(
      datos.getByRole("textbox", { name: "Nombre comercial" })
    ).toBeEditable()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    // Equipo (ANU-002): la persona de la sesión primero, y quién crea cuentas.
    await secciones(page).getByRole("link", { name: "Equipo" }).click()
    await expect(page).toHaveURL(/\/empresa\/equipo$/)
    const equipo = page.getByRole("region", { name: "Tu equipo en AMO" })
    await expect(equipo).toBeVisible()
    const yo = equipo.getByRole("listitem").first()
    await expect(yo.getByText("Tú", { exact: true })).toBeVisible()
    await expect(yo).toContainText(ANUNCIANTE_E2E.nombre)
    await expect(
      page.getByText(/Las cuentas nuevas las crea el equipo de AMO/)
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("mi empresa · alta y envío a verificación", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  const sufijo = sufijoUnico()
  const correoFacturacion = `facturacion.em.${sufijo}@amo.test`
  const correoContacto = `contacto.em.${sufijo}@amo.test`

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Cambia el «Anunciante Nuevo E2E»: corre solo en el proyecto «anunciante», en serie."
    )
    await restablecerAnuncianteNuevoE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await restablecerAnuncianteNuevoE2E()
  })

  test("corrige y guarda sus datos y su persona de contacto", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      cuenta: "ANUNCIANTE_NUEVO",
      destino: RUTA,
    })
    const verificacion = page.getByRole("region", {
      name: "Verifica tu empresa",
    })
    await expect(verificacion).toBeVisible()
    const enviar = verificacion.getByRole("button", {
      name: "Enviar a verificación",
    })
    await expect(enviar).toHaveAttribute("aria-disabled", "true")
    await expect(enviar).toHaveAccessibleDescription(
      "Para enviar tu empresa a verificación aún necesitamos los datos de la persona de contacto, el RUT y la Cámara de Comercio."
    )

    // ANU-001: un DV que no corresponde al NIT no se deja guardar.
    const datos = page.getByRole("form", { name: "Datos de la empresa" })
    const correcto = ANUNCIANTE_NUEVO_E2E.digitoVerificacion
    const dv = datos.getByRole("textbox", { name: /dígito de verificación/ })
    await dv.fill(String((Number(correcto) + 1) % 10))
    await dv.blur()
    await expect(
      datos.getByText(
        `No corresponde al NIT: para ${formatearNit(ANUNCIANTE_NUEVO_E2E.nit)} es ${correcto}. Revisa ambos en el RUT.`
      )
    ).toBeVisible()
    await expect(dv).toHaveAttribute("aria-invalid", "true")
    await datos.getByRole("button", { name: `Usar ${correcto}` }).click()
    await expect(dv).toHaveValue(correcto)
    await expect(dv).not.toHaveAttribute("aria-invalid")

    await datos
      .getByRole("textbox", { name: /^Correo de facturación/ })
      .fill(correoFacturacion)
    await datos.getByRole("combobox", { name: "Régimen de IVA" }).click()
    await page
      .getByRole("option", { name: "Responsable de IVA", exact: true })
      .click()
    await datos.getByRole("button", { name: "Guardar datos" }).click()
    await expect(page.getByText("Datos de la empresa guardados")).toBeVisible()

    const contacto = page.getByRole("form", { name: "Persona de contacto" })
    await contacto
      .getByRole("textbox", { name: "Nombre completo" })
      .fill("Contacto EM E2E")
    await contacto
      .getByRole("textbox", { name: "Correo", exact: true })
      .fill(correoContacto)
    await contacto.getByRole("textbox", { name: /^Celular/ }).fill("3001234567")
    await contacto.getByRole("button", { name: "Guardar contacto" }).click()
    await expect(page.getByText("Persona de contacto guardada")).toBeVisible()

    // Quedó guardado: al volver a la página se ve lo escrito y el paso, listo.
    await page.reload()
    await expect(
      datos.getByRole("textbox", { name: /^Correo de facturación/ })
    ).toHaveValue(correoFacturacion)
    await expect(
      contacto.getByRole("textbox", { name: /^Celular/ })
    ).toHaveValue("+57 300 123 4567")
    const pasoContacto = verificacion.getByRole("link", {
      name: /Persona de contacto/,
    })
    await expect(pasoContacto.getByText("Listo", { exact: true })).toBeVisible()
    await expect(enviar).toHaveAccessibleDescription(
      "Para enviar tu empresa a verificación aún necesitamos el RUT y la Cámara de Comercio."
    )
  })

  test("carga el RUT y la Cámara, la envía a verificación y la ve en revisión", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      cuenta: "ANUNCIANTE_NUEVO",
      destino: `${RUTA}/documentos`,
    })
    await expect(
      secciones(page).getByRole("link", { name: "Documentos" })
    ).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("region", { name: "Te faltan 2 documentos" })
    ).toBeVisible()

    await cargarDocumento(page, "RUT")
    await cargarDocumento(page, "Cámara de Comercio")

    // Con lo necesario cargado, el resumen invita a enviar desde aquí mismo.
    const resumen = page.getByRole("region", {
      name: "Ya cargaste lo necesario",
    })
    await expect(
      resumen.getByText("Ya puedes enviar tu empresa a verificación")
    ).toBeVisible()
    await expect(
      resumen.getByRole("button", { name: "Enviar a verificación" })
    ).toBeEnabled()

    // Se envía desde «Datos», donde están todos los pasos.
    await secciones(page).getByRole("link", { name: "Datos" }).click()
    const verificacion = page.getByRole("region", {
      name: "Todo listo para enviar",
    })
    await expect(verificacion).toBeVisible()
    await expect(
      verificacion
        .getByRole("link", { name: /Documentos/ })
        .getByText("En revisión", { exact: true })
    ).toBeVisible()
    await verificacion
      .getByRole("button", { name: "Enviar a verificación" })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Enviar tu empresa a verificación?",
    })
    await dialogo.getByRole("button", { name: "Enviar a verificación" }).click()
    await expect(dialogo).toBeHidden()
    await expect(page.getByText("Tu empresa quedó en revisión")).toBeVisible()

    await expect(
      page.getByRole("region", { name: "Tu empresa está en revisión" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Enviar a verificación" })
    ).toHaveCount(0)
    // El botón desapareció: el foco queda en el titular, no en <body>.
    await expect(
      page.getByRole("heading", { name: "Tu empresa está en revisión" })
    ).toBeFocused()

    // La empresa sigue PENDIENTE, ahora en la cola, con sus dos documentos por revisar.
    const estado = await leerEstadoAnunciante(ANUNCIANTE_NUEVO_E2E)
    expect(estado.estado).toBe("PENDIENTE")
    expect(estado.enviadoVerificacionAt).not.toBeNull()
    expect(
      estado.documentos.map((documento) => [documento.tipo, documento.estado])
    ).toEqual([
      ["RUT", "PENDIENTE"],
      ["CAMARA_COMERCIO", "PENDIENTE"],
    ])

    // En «Documentos» también se ve que está en revisión.
    await secciones(page).getByRole("link", { name: "Documentos" }).click()
    await expect(page.getByText("Tu empresa está en revisión")).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })
})
