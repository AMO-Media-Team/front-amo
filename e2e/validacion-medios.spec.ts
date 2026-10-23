import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import {
  ingresarComoMedio,
  MEDIO_SUSPENSION,
  MEDIO_VERIFICADO,
  rutaFichaMedio,
} from "./utilidades/medios"
import { leerAsignacionE2E } from "./utilidades/pauta"
import { PROYECTO_VALIDACION } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"
import {
  abrirDisputaE2E,
  asignacionConMetricaPendienteE2E,
  type AsignacionValidacionE2E,
  asignacionValidacionE2E,
  ingresarComoOperaciones,
  type MetricaPendienteE2E,
  restablecerValidacionE2E,
} from "./utilidades/validacion"

/**
 * Ficha y suspensión de medios (ADM-002, paquete MS) contra `pnpm build &&
 * pnpm start`.
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna: las
 *   pestañas «Disputas» y «Alertas» del «Medio E2E» cargan (lista o vacío) sin
 *   desbordar la pantalla.
 * - Escribe (solo en el proyecto «validacion», en serie), como OPERACIONES y
 *   con el «Medio Suspensión E2E»: las fábricas le dejan tres asignaciones en
 *   curso (una aceptada, una en disputa abierta por el anunciante y una con la
 *   métrica de 24 h por validar y alerta por múltiplo de seguidores). La ficha
 *   muestra la disputa y la alerta con su porqué; al suspenderlo, el diálogo
 *   lista las asignaciones afectadas con enlace a cada ficha y exige el motivo
 *   (ADM-002 c2); suspender no cancela ninguna y la ficha las deja a la vista;
 *   el medio suspendido no ve ofertas (ADM-002 c1); reactivar con motivo lo
 *   devuelve a verificado. Antes y después, `restablecerValidacionE2E()` limpia
 *   las campañas «Validación E2E» y reactiva al medio.
 */

test.describe("ficha del medio · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("las pestañas Disputas y Alertas cargan sin desbordar la pantalla", async ({
    page,
  }) => {
    await page.goto(`${rutaFichaMedio(MEDIO_VERIFICADO)}?pestana=disputas`)
    await expect(
      page.getByRole("heading", { level: 1, name: MEDIO_VERIFICADO.nombre })
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Disputas/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const disputas = page.getByRole("tabpanel", { name: /^Disputas/ })
    await expect(
      disputas
        .getByRole("list", { name: "Disputas del medio" })
        .or(
          disputas.getByText(
            "Ninguna de sus asignaciones ha tenido una disputa."
          )
        )
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    await page.getByRole("tab", { name: /^Alertas/ }).click()
    await expect.poll(() => parametro(page, "pestana")).toBe("alertas")
    const alertas = page.getByRole("tabpanel", { name: /^Alertas/ })
    await expect(
      alertas
        .getByRole("list", { name: "Métricas con alerta" })
        .or(
          alertas.getByText(
            "Ninguna de sus métricas se ha salido de lo esperable para su cuenta."
          )
        )
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("suspensión del medio", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  const MOTIVO_SUSPENSION =
    "Las métricas reportadas no coinciden con las estadísticas de la cuenta."

  let aceptada: AsignacionValidacionE2E
  let enDisputa: AsignacionValidacionE2E
  let conAlerta: MetricaPendienteE2E
  let disputaId: string

  const numero = new Intl.NumberFormat("es-CO")

  function ficha(pestana?: string): string {
    const ruta = rutaFichaMedio(MEDIO_SUSPENSION)
    return pestana ? `${ruta}?pestana=${pestana}` : ruta
  }

  function cabecera(page: Page): Locator {
    return page.locator("header").filter({
      has: page.getByRole("heading", {
        level: 1,
        name: MEDIO_SUSPENSION.nombre,
      }),
    })
  }

  function avisos(page: Page): Locator {
    return page.getByRole("region", { name: /^Avisos/ })
  }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_VALIDACION,
      "Suspende un medio compartido: corre solo en el proyecto «validacion», en serie."
    )
    info.setTimeout(240_000)
    await restablecerValidacionE2E()
    aceptada = await asignacionValidacionE2E({
      hasta: "ACEPTADA",
      medio: MEDIO_SUSPENSION,
    })
    enDisputa = await asignacionValidacionE2E({
      hasta: "PUBLICADA",
      medio: MEDIO_SUSPENSION,
    })
    disputaId = await abrirDisputaE2E({
      asignacionId: enDisputa.asignacionId,
      como: "ANUNCIANTE",
      motivo: "CONTENIDO",
      descripcion:
        "La publicación no muestra la etiqueta de publicidad que exige la oferta.",
    })
    conAlerta = await asignacionConMetricaPendienteE2E({
      conAlerta: true,
      medio: MEDIO_SUSPENSION,
    })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_VALIDACION) return
    // Los demás specs parten del medio verificado y sin campañas de validación.
    await restablecerValidacionE2E()
  })

  test("la ficha muestra la disputa y la alerta con su porqué", async ({
    page,
  }) => {
    await ingresarComoOperaciones(page, { destino: ficha() })
    await page.getByRole("tab", { name: /^Disputas/ }).click()
    await expect.poll(() => parametro(page, "pestana")).toBe("disputas")
    const disputas = page.getByRole("tabpanel", { name: /^Disputas/ })
    const disputa = disputas
      .getByRole("article")
      .filter({ hasText: enDisputa.oferta.titulo })
    await expect(disputa).toContainText("Abierta por el anunciante")
    await expect(disputa).toContainText(
      "La asignación estaba en «Publicada» al abrirla"
    )
    await expect(
      disputa.getByRole("link", { name: /^Ver la disputa/ })
    ).toHaveAttribute("href", `/operacion/disputas/${disputaId}`)

    await page.getByRole("tab", { name: /^Alertas/ }).click()
    const alertas = page.getByRole("tabpanel", { name: /^Alertas/ })
    const alerta = alertas
      .getByRole("article")
      .filter({ hasText: conAlerta.oferta.titulo })
    await expect(alerta).toContainText("Por validar")
    const limite = alerta.getByRole("table", {
      name: "Cifras de «Alcance por encima de sus seguidores»",
    })
    expect(conAlerta.alerta.limiteAlcance).not.toBeNull()
    await expect(limite.getByRole("row", { name: /^Alcance/ })).toContainText(
      `Hasta ${numero.format(conAlerta.alerta.limiteAlcance ?? 0)}`
    )
    await expect(limite.getByRole("row", { name: /^Alcance/ })).toContainText(
      "(fuera de lo esperado)"
    )
    await expect(
      alerta.getByRole("link", { name: /^Ver la asignación/ })
    ).toHaveAttribute(
      "href",
      `/operacion/asignaciones/${conAlerta.asignacionId}`
    )
  })

  test("suspender lista las asignaciones en curso, exige el motivo y no cancela ninguna", async ({
    page,
  }) => {
    await ingresarComoOperaciones(page, { destino: ficha() })
    const suspender = cabecera(page).getByRole("button", { name: "Suspender" })
    await suspender.click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Suspender a ${MEDIO_SUSPENSION.nombre}?`,
    })
    await expect(dialogo).toContainText("Deja de ver ofertas")

    // ADM-002 c2: la lista de las afectadas, con enlace a cada ficha.
    const lista = dialogo.getByRole("list", { name: "Asignaciones en curso" })
    for (const asignacion of [aceptada, enDisputa, conAlerta]) {
      await expect(
        lista.getByRole("link", {
          name: new RegExp(`^${escapar(asignacion.oferta.titulo)}`),
        })
      ).toHaveAttribute(
        "href",
        `/operacion/asignaciones/${asignacion.asignacionId}`
      )
    }
    await expect(
      lista
        .getByRole("listitem")
        .filter({ hasText: enDisputa.oferta.titulo })
        .getByRole("link", { name: /^Ver la disputa/ })
    ).toHaveAttribute("href", `/operacion/disputas/${disputaId}`)
    await expect(dialogo.getByRole("status")).toContainText(
      /^Tiene \d+ asignaciones en curso\. Abre cada una para decidir si la cancelas con su causa/
    )

    // Sin motivo no se suspende.
    await dialogo.getByRole("button", { name: "Suspender medio" }).click()
    await expect(dialogo.getByRole("alert")).toHaveText(
      "Describe el motivo (al menos 5 caracteres)."
    )
    await expect(dialogo.getByLabel("Motivo de la suspensión")).toBeFocused()

    await dialogo.getByRole("button", { name: MOTIVO_SUSPENSION }).click()
    await dialogo.getByRole("button", { name: "Suspender medio" }).click()
    await expect(dialogo).toBeHidden()

    // El resultado dice cuántas quedan en curso; el foco vuelve al botón, ahora «Reactivar».
    await expect(avisos(page)).toContainText(
      `Suspendiste a ${MEDIO_SUSPENSION.nombre}`
    )
    await expect(avisos(page)).toContainText(
      /Quedan \d+ asignaciones en curso: revísalas en la ficha/
    )
    await expect(
      cabecera(page).getByRole("button", { name: "Reactivar" })
    ).toBeFocused()
    await expect(
      cabecera(page).getByText("Suspendido", { exact: true })
    ).toBeVisible()
    await expect(page.getByText(`Motivo: ${MOTIVO_SUSPENSION}`)).toBeVisible()

    // Nada se canceló: siguen en curso y la ficha las deja a la vista.
    const porRevisar = page.getByRole("region", {
      name: "Asignaciones en curso por revisar",
    })
    for (const asignacion of [aceptada, enDisputa, conAlerta]) {
      await expect(
        porRevisar.getByRole("link", {
          name: new RegExp(`^${escapar(asignacion.oferta.titulo)}`),
        })
      ).toBeVisible()
    }
    expect((await leerAsignacionE2E(aceptada.asignacionId)).estado).toBe(
      "ACEPTADA"
    )
    expect((await leerAsignacionE2E(enDisputa.asignacionId)).estado).toBe(
      "EN_DISPUTA"
    )
    expect((await leerAsignacionE2E(conAlerta.asignacionId)).estado).toBe(
      "METRICAS_CARGADAS"
    )
    await esperarSinDesbordeHorizontal(page)
  })

  test("el medio suspendido no ve ofertas", async ({ abrirContexto }) => {
    // El medio entra desde el celular, con su propia sesión.
    const contexto = await abrirContexto({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    })
    const pagina = await contexto.newPage()
    await ingresarComoMedio(pagina, {
      cuenta: "MEDIO_SUSPENSION",
      destino: "/ofertas",
    })
    await expect(
      pagina.getByRole("heading", { name: "Tu medio está suspendido" })
    ).toBeVisible()
    await expect(
      pagina.getByRole("article").filter({ hasText: aceptada.oferta.titulo })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(pagina)
  })

  test("reactivar con motivo lo devuelve a verificado", async ({ page }) => {
    await ingresarComoOperaciones(page, { destino: ficha() })
    await cabecera(page).getByRole("button", { name: "Reactivar" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Reactivar a ${MEDIO_SUSPENSION.nombre}?`,
    })
    await dialogo
      .getByRole("button", {
        name: "Revisamos sus métricas y quedaron aclaradas.",
      })
      .click()
    await dialogo.getByRole("button", { name: "Reactivar medio" }).click()
    await expect(dialogo).toBeHidden()
    await expect(avisos(page)).toContainText(
      `Reactivaste a ${MEDIO_SUSPENSION.nombre}`
    )
    await expect(
      cabecera(page).getByRole("button", { name: "Suspender" })
    ).toBeFocused()
    await expect(
      page.getByRole("region", { name: "Asignaciones en curso por revisar" })
    ).toHaveCount(0)
    await expect(
      cabecera(page).getByText("Verificado", { exact: true })
    ).toBeVisible()
    await expect(page.getByText(/^Suspendido desde/)).toHaveCount(0)
  })
})

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
