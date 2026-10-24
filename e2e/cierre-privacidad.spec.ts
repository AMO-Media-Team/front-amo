import { infraccionesGraves } from "./utilidades/axe"
import { ingresar } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal, fijarTema } from "./utilidades/interfaz"
import {
  autorizacionesConTexto,
  avisosAlEquipo,
  borrarTitularesDesechables,
  crearMedioDesechable,
  existePerfil,
  huellaCorreo,
  ingresarComoAdministracion,
  leerSolicitudPorNumero,
  MARCA_SOLICITUD_E2E,
  type TitularDesechable,
} from "./utilidades/privacidad"
import { PROYECTO_CIERRE } from "./utilidades/proyectos"
import {
  esperarStreaming,
  expect,
  type Locator,
  type Page,
  test,
} from "./utilidades/prueba"
import { credencialesDemo, sesion } from "./utilidades/sesiones"

/**
 * Derechos del titular de datos (CTA-007, Ley 1581 de 2012; paquete PV)
 * contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil): Cuenta → Privacidad del medio
 *   demo y la bandeja «Datos personales» del equipo se leen sin desbordar y
 *   sin infracciones graves de accesibilidad, en los dos temas (sin
 *   animaciones de entrada: axe daría un contraste falso a medio aparecer).
 *   Las autorizaciones del medio dependen de lo que haya publicado
 *   `terminos.spec.ts` (en la base local recién creada no hay ninguna): se
 *   consultan por servicio antes de esperar el botón o el mensaje vacío.
 * - Escribe (solo en el proyecto «cierre», en serie), con una cuenta
 *   DESECHABLE (medio sin historial creado por la fábrica): el medio radica
 *   una supresión (criterio de CTA-007: queda registrada con su fecha y el
 *   equipo recibe el caso), el administrador la encuentra en la bandeja, la
 *   toma, la responde, simula y ejecuta la supresión, y la cuenta ya no puede
 *   ingresar. `borrarTitularesDesechables()` limpia antes y después.
 */

const RUTA_CUENTA = "/cuenta/privacidad"
const RUTA_BANDEJA = "/administracion/privacidad"

/** Aviso del estado de la ficha (región nombrada por su título). */
function avisoEstado(page: Page, titulo: string | RegExp): Locator {
  return page.getByRole("region", { name: titulo })
}

/** Las autorizaciones con texto de la cuenta de la sesión «medio» (el medio demo). */
function autorizacionesDelMedio(): Promise<number> {
  return autorizacionesConTexto(credencialesDemo("MEDIO").email)
}

// ── Solo lectura ─────────────────────────────────────────────────────────────

test.describe("privacidad del titular · solo lectura", () => {
  test.use({
    storageState: sesion("medio"),
    contextOptions: { reducedMotion: "reduce" },
  })

  test("Cuenta → Privacidad muestra los datos, las autorizaciones y las solicitudes", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === PROYECTO_CIERRE,
      "Solo lectura: la cubren escritorio, tablet y móvil."
    )
    const conTexto = await autorizacionesDelMedio()
    await page.goto("/cuenta/perfil")
    await page
      .getByRole("navigation", { name: "Secciones de mi cuenta" })
      .getByRole("link", { name: /Privacidad/ })
      .click()
    await expect(page).toHaveURL((url) => url.pathname === RUTA_CUENTA)
    await esperarStreaming(page)

    await expect(
      page
        .getByRole("navigation", { name: "Secciones de mi cuenta" })
        .getByRole("link", { name: /Privacidad/ })
    ).toHaveAttribute("aria-current", "page")
    for (const titulo of [
      "Tus datos",
      "Autorizaciones",
      "Descargar mis datos",
      "Ejerce tus derechos",
      "Mis solicitudes",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name: titulo })
      ).toBeVisible()
    }
    // El medio corrige su pago él mismo.
    await expect(
      page.getByRole("link", { name: "Corregir en Pago" })
    ).toHaveAttribute("href", "/mi-medio/pago")
    // Sus autorizaciones, con su texto. Si al consultar no tenía ninguna,
    // `terminos.spec.ts` pudo aceptar una por él entretanto: vale cualquiera
    // de los dos estados (nada las borra, así que con alguna no hay duda).
    const autorizaciones = page.getByRole("region", { name: "Autorizaciones" })
    const leer = autorizaciones
      .getByRole("button", { name: /^Leer el texto/ })
      .first()
    const sinAutorizaciones = autorizaciones.getByText(
      /^No tienes autorizaciones registradas/
    )
    await expect(conTexto > 0 ? leer : leer.or(sinAutorizaciones)).toBeVisible()
    await expect(
      page
        .getByRole("radiogroup", { name: "¿Qué quieres pedir?" })
        .getByRole("radio")
    ).toHaveCount(6)
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    for (const tema of ["dark", "light"] as const) {
      await fijarTema(page, tema)
      expect(
        await infraccionesGraves(page, "main"),
        `${RUTA_CUENTA} (${tema})`
      ).toEqual([])
    }
  })

  test("leer el texto de una autorización abre el documento aceptado", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === PROYECTO_CIERRE,
      "Solo lectura: la cubren escritorio, tablet y móvil."
    )
    test.skip(
      (await autorizacionesDelMedio()) === 0,
      "El medio demo aún no aceptó una versión con texto (en la base local, hasta que `terminos.spec.ts` publica una)."
    )
    await page.goto(RUTA_CUENTA)
    await esperarStreaming(page)
    const boton = page
      .getByRole("region", { name: "Autorizaciones" })
      .getByRole("button", { name: /^Leer el texto/ })
      .first()
    await boton.click()
    const dialogo = page.getByRole("dialog")
    await expect(dialogo).toBeVisible()
    await expect(dialogo).toContainText(/Versión .+, aceptada el/)
    await page.keyboard.press("Escape")
    await expect(dialogo).toBeHidden()
    await expect(boton).toBeFocused()
  })
})

test.describe("bandeja de datos personales · solo lectura", () => {
  test.use({
    storageState: sesion("interno"),
    contextOptions: { reducedMotion: "reduce" },
  })

  test("la bandeja se lee con el semáforo y los filtros en la URL", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === PROYECTO_CIERRE,
      "Solo lectura: la cubren escritorio, tablet y móvil."
    )
    await page.goto(RUTA_BANDEJA)
    await esperarStreaming(page)
    await expect(
      page.getByRole("heading", { level: 1, name: "Datos personales" })
    ).toBeVisible()
    const resumen = page.getByRole("region", {
      name: "Solicitudes por plazo",
    })
    await expect(resumen.getByRole("button")).toHaveCount(5)

    await resumen.getByRole("button", { name: /^Vencida:/ }).click()
    await expect(page).toHaveURL(/[?&]vence=vencida\b/)
    await expect(
      resumen.getByRole("button", { name: /^Vencida:/ })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    for (const tema of ["dark", "light"] as const) {
      await fijarTema(page, tema)
      expect(
        await infraccionesGraves(page, "main"),
        `${RUTA_BANDEJA} (${tema})`
      ).toEqual([])
    }
  })
})

// ── Escribe: supresión de un titular desechable ──────────────────────────────

test.describe("derechos del titular · supresión de punta a punta", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let titular: TitularDesechable | null = null

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CIERRE,
      "Crea y suprime una cuenta desechable: corre solo en el proyecto «cierre», en serie."
    )
    await borrarTitularesDesechables()
    titular = await crearMedioDesechable()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CIERRE) return
    await borrarTitularesDesechables()
  })

  test("el medio pide la supresión, el equipo la atiende y la cuenta deja de existir", async ({
    page,
    browser,
  }) => {
    if (!titular) throw new Error("La fábrica no creó el titular desechable.")
    const cuenta = titular
    let numero = 0

    await test.step("el medio radica la supresión desde Cuenta → Privacidad", async () => {
      await ingresar(page, cuenta)
      await expect(page).not.toHaveURL(/\/ingresar/)
      await page.goto(RUTA_CUENTA)
      await esperarStreaming(page)

      await page.getByRole("radio", { name: "Suprimir mis datos" }).click()
      await expect(
        page.getByText(/borraremos tu cuenta y ya no podrás ingresar/)
      ).toBeVisible()
      await page
        .getByLabel("Cuéntanos qué necesitas")
        .fill(
          `${MARCA_SOLICITUD_E2E} Ya no voy a publicar en AMO: borren mi cuenta y mis datos.`
        )
      await page.getByRole("checkbox", { name: "Contacto" }).click()
      await page.getByRole("button", { name: "Radicar solicitud" }).click()

      const confirmacion = page.getByRole("status").filter({
        hasText: "Radicamos tu solicitud",
      })
      await expect(confirmacion).toBeVisible()
      await expect(confirmacion).toBeFocused()
      await expect(confirmacion).toContainText("Te responderemos a más tardar")
      const texto = (await confirmacion.textContent()) ?? ""
      numero = Number(/N\.º\s*(\d+)/.exec(texto)?.[1] ?? 0)
      expect(numero, "radicado de la confirmación").toBeGreaterThan(0)

      const tarjeta = page.getByRole("article", { name: "Supresión de datos" })
      await expect(tarjeta).toContainText(`N.º ${numero}`)
      await expect(tarjeta).toContainText("Recibida")
      // Una abierta por tipo: la opción queda bloqueada.
      await expect(
        page.getByRole("radio", { name: "Suprimir mis datos" })
      ).toHaveAttribute("data-disabled")
    })

    await test.step("queda registrada con su fecha y el equipo recibe el caso (CTA-007)", async () => {
      const solicitud = await leerSolicitudPorNumero(numero)
      expect(solicitud.estado).toBe("RADICADA")
      expect(solicitud.perfilId).toBe(cuenta.usuarioId)
      expect(Date.parse(solicitud.recibidaAt)).not.toBeNaN()
      expect(solicitud.plazoVence).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(await avisosAlEquipo(solicitud.id)).toBeGreaterThan(0)
    })

    const contexto = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const admin = await contexto.newPage()
    try {
      await test.step("el administrador la encuentra en la bandeja", async () => {
        await ingresarComoAdministracion(admin, { destino: RUTA_BANDEJA })
        await admin
          .getByRole("searchbox", {
            name: "Buscar radicado o titular",
          })
          .fill(String(numero))
        await expect(admin).toHaveURL(new RegExp(`[?&]q=${numero}\\b`))
        await admin
          .getByRole("link", {
            name: `N.º ${numero} · Supresión de datos`,
          })
          .click()
        await expect(admin).toHaveURL(
          /\/administracion\/privacidad\/[0-9a-f-]{36}$/
        )
        await esperarStreaming(admin)
        await expect(
          admin.getByRole("heading", { level: 1, name: "Supresión de datos" })
        ).toBeVisible()
        await expect(avisoEstado(admin, /^Radicada · /)).toBeVisible()
      })

      await test.step("con la solicitud abierta consulta los datos del titular", async () => {
        const ver = admin.getByRole("button", { name: "Ver datos del titular" })
        await ver.click()
        const datos = admin.getByRole("dialog", { name: "Datos del titular" })
        await expect(datos).toBeVisible()
        await expect(
          datos.getByRole("region", { name: "Registros" })
        ).toContainText("Solicitudes de vinculación")
        await admin.keyboard.press("Escape")
        await expect(datos).toBeHidden()
        await expect(ver).toBeFocused()
      })

      await test.step("la toma en trámite y la responde: procede", async () => {
        await admin.getByRole("button", { name: "Tomar en trámite" }).click()
        await admin
          .getByRole("alertdialog")
          .getByRole("button", { name: "Tomar en trámite" })
          .click()
        await expect(avisoEstado(admin, /^En trámite · /)).toBeFocused()

        await admin
          .getByRole("button", { name: "Responder", exact: true })
          .click()
        const dialogo = admin.getByRole("dialog", {
          name: `Responder la solicitud N.º ${numero}`,
        })
        await dialogo
          .getByRole("radio", { name: "Procede", exact: true })
          .click()
        await dialogo
          .getByLabel("Respuesta al titular")
          .fill(
            "Procede: suprimimos tu cuenta y tus datos. Conservamos solo lo que la ley obliga."
          )
        await dialogo
          .getByRole("button", { name: "Responder", exact: true })
          .click()
        await expect(dialogo).toBeHidden()
        await expect(avisoEstado(admin, "Respondida: procede")).toBeVisible()
        // Respondida, ya no se consultan sus datos (la BD tampoco lo deja).
        await expect(
          admin.getByRole("button", { name: "Ver datos del titular" })
        ).toHaveAccessibleDescription(/solo mientras la solicitud está abierta/)
      })

      await test.step("simula y ejecuta la supresión escribiendo el radicado", async () => {
        await admin.getByRole("button", { name: "Simular supresión" }).click()
        await expect(
          admin.getByText("Simulación: todavía no se borró nada")
        ).toBeVisible()
        // Medio sin negocios: se borra completo.
        await expect(
          admin.getByText(/El medio no tiene negocios: se borran el medio/)
        ).toBeVisible()
        await expect(
          admin.getByText(
            /^No hay solicitudes del formulario «Vincular mi medio»/
          )
        ).toBeVisible()

        await admin.getByRole("button", { name: "Ejecutar supresión" }).click()
        const confirmar = admin.getByRole("alertdialog", {
          name: `¿Ejecutar la supresión de la solicitud N.º ${numero}?`,
        })
        await confirmar
          .getByLabel(new RegExp(`Escribe\\s*${numero}\\s*para confirmar`))
          .fill(String(numero))
        await confirmar
          .getByRole("button", { name: "Ejecutar supresión" })
          .click()
        await expect(confirmar).toBeHidden()
        await expect(admin.getByText("Supresión ejecutada.")).toBeVisible()
        await expect(avisoEstado(admin, "Supresión ejecutada")).toBeFocused()
        // El medio desechable no tenía archivos: nada queda pendiente.
        await expect(
          admin.getByText("No quedaban archivos en Storage.")
        ).toBeVisible()
        await expect(
          admin.getByRole("button", {
            name: "Reintentar el borrado de archivos",
          })
        ).toHaveCount(0)
      })
    } finally {
      await contexto.close()
    }

    await test.step("la cuenta ya no existe ni puede ingresar", async () => {
      expect(await existePerfil(cuenta.usuarioId)).toBe(false)
      const solicitud = await leerSolicitudPorNumero(numero)
      expect(solicitud.perfilId).toBeNull()
      expect(solicitud.supresionEjecutadaAt).not.toBeNull()
      // El servidor registró que no quedó nada en Storage.
      expect(solicitud.archivosPendientes).toEqual([])
      // La solicitud se conserva como evidencia, con la huella del correo.
      expect(solicitud.emailSha256).toBe(huellaCorreo(cuenta.email))

      const otro = await browser.newContext()
      const pagina = await otro.newPage()
      try {
        await ingresar(pagina, cuenta)
        await expect(
          pagina.getByText("Correo o contraseña incorrectos.")
        ).toBeVisible()
        await expect(pagina).toHaveURL(/\/ingresar/)
      } finally {
        await otro.close()
      }
    })
  })
})
