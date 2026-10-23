import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { avisosMedioE2E, leerAsignacionE2E } from "./utilidades/pauta"
import { PROYECTO_VALIDACION } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"
import {
  asignacionConEvidenciaPendienteE2E,
  asignacionConMetricaPendienteE2E,
  asignacionListaParaVerificarE2E,
  ingresarComoOperaciones,
  restablecerValidacionE2E,
  rutaFichaAsignacion,
} from "./utilidades/validacion"

/**
 * Colas de validación del equipo AMO (ADM-007, ADM-008, ADM-009; paquete VA)
 * contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna: las
 *   tres colas se abren desde sus tarjetas con contador, el filtro «Solo con
 *   alertas» va en la URL y nada desborda la pantalla.
 * - Escribe (solo en el proyecto «validacion», en serie, 1.440 px), sobre
 *   asignaciones que crean las fábricas de la fase:
 *   - OPERACIONES aprueba una evidencia marcando la etiqueta visible (ADM-007
 *     c2) y rechaza otra con observaciones: vuelve a CONTENIDO_ENTREGADO y el
 *     medio recibe el aviso (ADM-007 c1).
 *   - La métrica con alerta por múltiplo de seguidores aparece con el filtro y
 *     su porqué se ve al lado de la captura; aprobarla exige anotar qué se
 *     revisó (ADM-008 c1). Una cuya evidencia no está aprobada no se aprueba.
 *   - Verifica una asignación lista (ADM-009 c2); una con la permanencia
 *     pendiente dice hasta cuándo (ADM-009 c1) y solo un ADMIN la verifica
 *     con constancia manual.
 *   - Un ADMIN corrige una métrica aprobada desde la ficha con un motivo
 *     obligatorio que queda en la métrica (ADM-008 c2).
 *   Antes y después, `restablecerValidacionE2E()` limpia las campañas
 *   «Validación E2E».
 */

const RUTA = "/operacion/validacion"

function rutaCola(cola: "evidencias" | "metricas" | "verificar"): string {
  return `${RUTA}?cola=${cola}`
}

/**
 * Busca en la cola (página a página) el botón de una tarjeta y lo pulsa. Lo
 * de las fábricas es lo más reciente: suele estar en la última página.
 */
async function abrirDesdeLaCola(
  page: Page,
  { lista, boton }: { lista: string; boton: string }
): Promise<void> {
  for (let pagina = 1; pagina <= 15; pagina += 1) {
    await expect(page.getByRole("list", { name: lista })).toBeVisible()
    const tarjeta = page.getByRole("button", { name: boton, exact: true })
    if ((await tarjeta.count()) > 0) {
      await tarjeta.click()
      return
    }
    const siguientes = page
      .getByRole("navigation", { name: "Páginas de la cola" })
      .getByRole("link", { name: "Siguientes" })
    if ((await siguientes.count()) === 0) break
    await siguientes.click()
    await expect(page).toHaveURL(new RegExp(`[?&]pagina=${pagina + 1}\\b`))
  }
  throw new Error(`«${boton}» no aparece en la lista «${lista}».`)
}

/** Lo que tiene el foco: tras decidir nunca debe quedar en `<body>`. */
function enfocado(page: Page): Locator {
  return page.locator(":focus")
}

async function estadoAsignacion(asignacionId: string): Promise<string> {
  return (await leerAsignacionE2E(asignacionId)).estado
}

test.describe("validación · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("las tres colas se abren con su contador y caben en la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Validación" })
    ).toBeVisible()
    const colas = page.getByRole("navigation", { name: "Colas de validación" })
    await expect(colas.getByRole("link")).toHaveCount(3)
    await expect(
      colas.getByRole("link", { name: /^Evidencias: / })
    ).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("heading", { level: 2, name: "Evidencias" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Evidencias por validar" })
        .or(page.getByText("No hay evidencias por validar"))
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    await test.step("métricas, con el filtro de alertas en la URL", async () => {
      await colas.getByRole("link", { name: /^Métricas: / }).click()
      await expect(page).toHaveURL(/[?&]cola=metricas\b/)
      await expect(
        page.getByRole("heading", { level: 2, name: "Métricas" })
      ).toBeVisible()
      const filtro = page.getByRole("switch", { name: "Solo con alertas" })
      await filtro.click()
      await expect(page).toHaveURL(/[?&]alertas=true\b/)
      await expect(filtro).toBeChecked()
      await expect(
        page
          .getByRole("list", { name: "Métricas por validar" })
          .or(page.getByText("Ninguna métrica pendiente tiene alerta"))
      ).toBeVisible()
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
      await esperarSinDesbordeHorizontal(page)
    })

    await test.step("por verificar", async () => {
      await colas.getByRole("link", { name: /^Por verificar: / }).click()
      await expect(page).toHaveURL(/[?&]cola=verificar\b/)
      await expect(
        page
          .getByRole("list", { name: "Asignaciones por verificar" })
          .or(page.getByText("No hay asignaciones por verificar"))
      ).toBeVisible()
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
      await esperarSinDesbordeHorizontal(page)
    })
  })
})

test.describe("validación · decisiones", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_VALIDACION,
      "Valida y verifica asignaciones del «Medio E2E»: corre solo en el proyecto «validacion», en serie."
    )
    info.setTimeout(120_000)
    await restablecerValidacionE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_VALIDACION) return
    info.setTimeout(120_000)
    await restablecerValidacionE2E()
  })

  test.describe("OPERACIONES", () => {
    test("aprueba una evidencia marcando la etiqueta visible (ADM-007 c2)", async ({
      page,
    }) => {
      const asignacion = await asignacionConEvidenciaPendienteE2E()
      const { medio, oferta } = asignacion
      await ingresarComoOperaciones(page, { destino: rutaCola("evidencias") })
      await abrirDesdeLaCola(page, {
        lista: "Evidencias por validar",
        boton: `Revisar la evidencia de ${medio.nombre}: ${oferta.titulo}`,
      })
      const hoja = page.getByRole("dialog", {
        name: `Evidencia de ${medio.nombre}`,
      })
      await expect(
        hoja.getByRole("link", { name: /^Abrir la publicación/ })
      ).toHaveAttribute("href", asignacion.publicaciones[0].url)
      await expect(
        hoja.getByRole("img", { name: /^Captura de la publicación/ })
      ).toBeVisible()

      // Sin marcar la etiqueta no se aprueba: el error queda en la casilla.
      await hoja.getByRole("button", { name: "Aprobar" }).click()
      const casilla = hoja.getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
      await expect(casilla).toHaveAccessibleDescription(
        /Marca la casilla cuando compruebes que la etiqueta de publicidad se ve/
      )
      await casilla.click()
      await hoja.getByRole("button", { name: "Aprobar" }).click()

      await expect
        .poll(() => estadoAsignacion(asignacion.asignacionId))
        .toMatch(/^(EVIDENCIA_VALIDADA|METRICAS_CARGADAS)$/)
      const leida = await leerAsignacionE2E(asignacion.asignacionId)
      expect(leida.publicaciones[0]).toMatchObject({
        estado: "APROBADA",
        etiquetaVerificada: true,
      })
      // Pasa a la siguiente (foco en su título) o, si era la última, a la cola.
      await expect(enfocado(page)).toHaveText(/^(Evidencia de .+|Evidencias)$/)
    })

    test("rechaza una evidencia con observaciones y el medio recibe el aviso (ADM-007 c1)", async ({
      page,
    }) => {
      const asignacion = await asignacionConEvidenciaPendienteE2E()
      const { medio, oferta } = asignacion
      await ingresarComoOperaciones(page, { destino: rutaCola("evidencias") })
      await abrirDesdeLaCola(page, {
        lista: "Evidencias por validar",
        boton: `Revisar la evidencia de ${medio.nombre}: ${oferta.titulo}`,
      })
      const hoja = page.getByRole("dialog", {
        name: `Evidencia de ${medio.nombre}`,
      })
      await hoja.getByRole("button", { name: "Rechazar" }).click()
      const dialogo = page.getByRole("alertdialog", {
        name: "¿Rechazar la evidencia?",
      })
      await expect(dialogo).toContainText("al menos 24 horas")
      await dialogo
        .getByRole("button", { name: /^Falta la etiqueta de publicidad/ })
        .click()
      await dialogo.getByRole("button", { name: "Rechazar evidencia" }).click()
      await expect(dialogo).toBeHidden()

      await expect
        .poll(() => estadoAsignacion(asignacion.asignacionId))
        .toBe("CONTENIDO_ENTREGADO")
      const leida = await leerAsignacionE2E(asignacion.asignacionId)
      expect(leida.publicaciones[0].estado).toBe("RECHAZADA")
      expect(leida.publicaciones[0].observaciones).toMatch(
        /^Falta la etiqueta de publicidad/
      )
      const [aviso] = await avisosMedioE2E({
        tipo: "evidencia.rechazada",
        entidadId: asignacion.asignacionId,
      })
      expect(aviso?.mensaje).toContain("Falta la etiqueta de publicidad")
      await expect(enfocado(page)).toHaveText(/^(Evidencia de .+|Evidencias)$/)
    })

    test("la métrica con alerta muestra su porqué junto a la captura y exige anotar qué se revisó (ADM-008 c1)", async ({
      page,
    }) => {
      const metrica = await asignacionConMetricaPendienteE2E({
        conAlerta: true,
      })
      expect(metrica.alerta.multiplo).toBe(true)
      const { medio, oferta } = metrica
      await ingresarComoOperaciones(page, { destino: rutaCola("metricas") })
      await page.getByRole("switch", { name: "Solo con alertas" }).click()
      await expect(page).toHaveURL(/[?&]alertas=true\b/)
      await abrirDesdeLaCola(page, {
        lista: "Métricas por validar",
        boton: `Revisar métricas de 24 horas de ${medio.nombre}: ${oferta.titulo} (con alerta)`,
      })
      const hoja = page.getByRole("dialog", {
        name: `Métricas de 24 horas de ${medio.nombre}`,
      })
      const porque = hoja.getByRole("region", { name: "Por qué tiene alerta" })
      await expect(porque).toContainText(
        "Alcance excesivo frente a los seguidores"
      )
      for (const dato of [
        "Alcance reportado",
        "Seguidores al aceptar",
        "Múltiplo permitido",
        "Límite",
      ]) {
        await expect(porque.getByText(dato, { exact: true })).toBeVisible()
      }

      // A 1.440 px la captura queda a la izquierda del porqué.
      const captura = hoja.getByRole("img", { name: /^Captura del panel/ })
      await expect(captura).toBeVisible()
      const [cajaCaptura, cajaPorque] = await Promise.all([
        captura.boundingBox(),
        porque.boundingBox(),
      ])
      expect(cajaCaptura && cajaPorque).toBeTruthy()
      if (cajaCaptura && cajaPorque) {
        expect(cajaCaptura.x + cajaCaptura.width).toBeLessThanOrEqual(
          cajaPorque.x
        )
      }

      await hoja.getByRole("button", { name: "Aprobar" }).click()
      const revisado = hoja.getByRole("textbox", { name: "Qué revisaste" })
      await expect(revisado).toHaveAccessibleDescription(
        /anota qué revisaste antes de aprobarla/
      )
      await hoja
        .getByRole("button", {
          name: "Comparé las cifras con la captura del panel y coinciden.",
        })
        .click()
      await hoja.getByRole("button", { name: "Aprobar" }).click()

      await expect
        .poll(
          async () =>
            (await leerAsignacionE2E(metrica.asignacionId)).metricas.find(
              (corte) => corte.id === metrica.metricaId
            )?.estado
        )
        .toBe("APROBADA")
      const leida = await leerAsignacionE2E(metrica.asignacionId)
      expect(
        leida.metricas.find((corte) => corte.id === metrica.metricaId)
          ?.observaciones
      ).toBe("Comparé las cifras con la captura del panel y coinciden.")
    })

    test("sin la evidencia aprobada, la métrica no se aprueba y se explica", async ({
      page,
    }) => {
      const metrica = await asignacionConMetricaPendienteE2E({
        conAlerta: true,
        evidenciaAprobada: false,
      })
      const { medio, oferta } = metrica
      await ingresarComoOperaciones(page, {
        destino: `${rutaCola("metricas")}&alertas=true`,
      })
      await abrirDesdeLaCola(page, {
        lista: "Métricas por validar",
        boton: `Revisar métricas de 24 horas de ${medio.nombre}: ${oferta.titulo} (con alerta)`,
      })
      const hoja = page.getByRole("dialog", {
        name: `Métricas de 24 horas de ${medio.nombre}`,
      })
      const aprobar = hoja.getByRole("button", { name: "Aprobar" })
      await expect(aprobar).toBeDisabled()
      await expect(aprobar).toHaveAccessibleDescription(
        /Primero valida la evidencia de esta publicación/
      )
      await expect(
        hoja.getByRole("link", { name: "Ir a la cola de evidencias" })
      ).toHaveAttribute("href", rutaCola("evidencias"))
      await hoja.getByRole("button", { name: "Cerrar" }).click()
      await expect(hoja).toBeHidden()
    })

    test("verifica una asignación lista (ADM-009 c2) y explica la permanencia pendiente (ADM-009 c1)", async ({
      page,
    }) => {
      const lista = await asignacionListaParaVerificarE2E()
      const pendiente = await asignacionListaParaVerificarE2E({
        permanenciaDias: 30,
      })
      expect(lista.lista).toBe(true)
      expect(pendiente.lista).toBe(false)
      await ingresarComoOperaciones(page, { destino: rutaCola("verificar") })

      await abrirDesdeLaCola(page, {
        lista: "Asignaciones por verificar",
        boton: `Verificar ${lista.medio.nombre}: ${lista.oferta.titulo}`,
      })
      const dialogo = page.getByRole("alertdialog", {
        name: "¿Verificar la asignación?",
      })
      await dialogo.getByRole("button", { name: "Verificar" }).click()
      await expect(dialogo).toBeHidden()
      await expect
        .poll(() => estadoAsignacion(lista.asignacionId))
        .toBe("VERIFICADA")
      // La tarjeta sale de la cola: el foco queda en su título.
      await expect(
        page.getByRole("heading", { level: 2, name: "Por verificar" })
      ).toBeFocused()

      await page.goto(rutaCola("verificar"))
      const tarjeta = page
        .getByRole("list", { name: "Asignaciones por verificar" })
        .getByRole("listitem")
        .filter({ hasText: pendiente.oferta.titulo })
      // Puede estar en otra página: las bloqueadas van después de las listas.
      for (
        let pagina = 1;
        (await tarjeta.count()) === 0 && pagina < 15;
        pagina += 1
      ) {
        await page
          .getByRole("navigation", { name: "Páginas de la cola" })
          .getByRole("link", { name: "Siguientes" })
          .click()
        await expect(page).toHaveURL(new RegExp(`[?&]pagina=${pagina + 1}\\b`))
        await expect(
          page.getByRole("list", { name: "Asignaciones por verificar" })
        ).toBeVisible()
      }
      await expect(tarjeta).toContainText(
        /Permanencia pendiente hasta \d{1,2} de /
      )
      // OPERACIONES no deja constancia manual de la permanencia.
      await expect(
        tarjeta.getByRole("button", { name: /^Verificar/ })
      ).toHaveCount(0)
      expect(await estadoAsignacion(pendiente.asignacionId)).toBe(
        "METRICAS_CARGADAS"
      )
    })
  })

  test.describe("ADMIN", () => {
    test.use({ storageState: sesion("interno") })

    test("verifica con constancia manual de permanencia y motivo", async ({
      page,
    }) => {
      const pendiente = await asignacionListaParaVerificarE2E({
        permanenciaDias: 30,
      })
      await page.goto(rutaCola("verificar"))
      await abrirDesdeLaCola(page, {
        lista: "Asignaciones por verificar",
        boton: `Verificar con constancia de permanencia ${pendiente.medio.nombre}: ${pendiente.oferta.titulo}`,
      })
      const dialogo = page.getByRole("alertdialog", {
        name: "¿Verificar antes de cumplir la permanencia?",
      })
      await dialogo
        .getByRole("button", {
          name: /^Comprobé que la publicación sigue en línea/,
        })
        .click()
      await dialogo
        .getByRole("button", { name: "Verificar con constancia" })
        .click()
      await expect(dialogo).toBeHidden()
      await expect
        .poll(() => estadoAsignacion(pendiente.asignacionId))
        .toBe("VERIFICADA")
    })

    test("corrige una métrica aprobada desde la ficha con motivo obligatorio (ADM-008 c2)", async ({
      page,
    }) => {
      const asignacion = await asignacionListaParaVerificarE2E()
      const [metrica] = asignacion.metricas
      await page.goto(rutaFichaAsignacion(asignacion.asignacionId))
      await page
        .getByRole("group", { name: "Validar las métricas de 24 horas" })
        .getByRole("button", { name: "Corregir" })
        .click()
      const hoja = page.getByRole("dialog", {
        name: "Corregir las métricas de 24 horas",
      })
      const alcance = hoja.getByRole("textbox", { name: "Alcance" })
      await expect(alcance).toBeVisible()
      await alcance.fill("1")

      // Sin motivo no se guarda: el error queda en su campo.
      await hoja.getByRole("button", { name: "Guardar la corrección" }).click()
      const motivo = hoja.getByRole("textbox", {
        name: "Motivo de la corrección",
      })
      await expect(motivo).toHaveAccessibleDescription(/al menos 10 caracteres/)
      await motivo.fill(
        "El medio digitó mal el alcance: la captura del panel muestra 1."
      )
      await hoja.getByRole("button", { name: "Guardar la corrección" }).click()
      await expect(hoja).toBeHidden()

      const { data, error } = await clienteDeLectura()
        .from("metricas")
        .select("alcance, observaciones, estado_validacion")
        .eq("id", metrica.metricaId)
        .single()
      if (error) throw new Error(`No se pudo leer la métrica: ${error.message}`)
      expect(data.alcance).toBe(1)
      expect(data.estado_validacion).toBe("APROBADA")
      expect(data.observaciones).toContain(
        "Corrección: El medio digitó mal el alcance"
      )
    })
  })
})
