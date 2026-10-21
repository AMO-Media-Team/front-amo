import { CUALQUIER_SALUDO, saludoDe } from "./utilidades/cuentas"
import {
  elegirPeriodoRapido,
  esperarGraficoDibujado,
  esperarSinDesbordeHorizontal,
  parametro,
} from "./utilidades/interfaz"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { PROYECTO_MOVIL } from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Paneles de Inicio por tipo de rol contra `pnpm build && pnpm start` y los
 * datos demo reales (15 meses de pauta). Sesiones de solo lectura compartidas
 * por los tres proyectos (`utilidades/sesiones.ts`).
 */

/** Periodo distinto del predeterminado (30 días) y rápido de calcular. */
const PERIODO_CORTO = { clave: "ultimos7", etiqueta: "Últimos 7 días" }

function tarjeta(zona: Locator, titulo: string): Locator {
  return zona.getByRole("article").filter({
    has: zona.page().getByRole("heading", { name: titulo, exact: true }),
  })
}

/** Valor exacto del indicador: la tarjeta lo trae entre paréntesis junto a la cifra animada. */
async function valorExacto(tarjetaKpi: Locator): Promise<string> {
  const texto = await tarjetaKpi.getByRole("paragraph").first().innerText()
  const exacto = texto.match(/\(([^)]+)\)/)?.[1]
  if (!exacto) throw new Error(`El indicador no muestra un valor: «${texto}»`)
  return exacto
}

function grafico(page: Page, titulo: string): Locator {
  return page.getByRole("region", { name: titulo, exact: true })
}

test.describe("panel interno", () => {
  test.use({ storageState: sesion("interno") })

  test("muestra los indicadores con valor, los gráficos y los hallazgos", async ({
    page,
  }) => {
    await page.goto("/inicio")
    await expect(
      page.getByRole("heading", { level: 1, name: saludoDe("Lectura") })
    ).toBeVisible()
    await expect(page.getByText(/^Así va el marketplace · /)).toBeVisible()

    const indicadores = page.getByRole("region", {
      name: "Indicadores del periodo",
    })
    await expect(indicadores.getByRole("article")).toHaveCount(8)
    for (const titulo of [
      "GMV verificado",
      "Comisión generada",
      "Negocios cerrados",
      "Tasa de llenado",
      "Tasa de cumplimiento",
      "Alcance total",
      "Medios activos",
      "Anunciantes activos",
    ]) {
      expect(await valorExacto(tarjeta(indicadores, titulo)), titulo).toMatch(
        /[1-9]/
      )
    }
    await expect(
      tarjeta(indicadores, "GMV verificado").getByText(
        /frente al periodo anterior/
      )
    ).toBeVisible()

    for (const titulo of [
      "GMV verificado y comisión",
      "Embudo de asignaciones",
      "GMV por plataforma",
      "GMV por formato",
      "Actividad por día y hora",
    ]) {
      await esperarGraficoDibujado(grafico(page, titulo))
    }
    // Cada gráfico trae su tabla equivalente para lectores de pantalla.
    await expect(
      page.getByRole("table", { name: "GMV por plataforma" })
    ).toBeAttached()

    await expect(
      page
        .getByRole("list", { name: "Departamentos con más GMV" })
        .getByRole("link")
        .first()
    ).toHaveAccessibleName(/Abrir en el explorador$/)
    await expect(
      page.getByRole("region", { name: "Lo que cambió en el periodo" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("region", { name: "Actividad reciente" })
        .getByRole("link", { name: "Ver la bitácora" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })

  test("cambiar el periodo actualiza la URL, el encabezado y las cifras", async ({
    page,
  }) => {
    await page.goto("/inicio")
    const gmv = tarjeta(
      page.getByRole("region", { name: "Indicadores del periodo" }),
      "GMV verificado"
    )
    const fechas = page.getByText(/^Así va el marketplace · /)
    const antes = {
      gmv: await valorExacto(gmv),
      fechas: await fechas.innerText(),
    }

    await elegirPeriodoRapido(page, PERIODO_CORTO.etiqueta)
    await expect
      .poll(() => parametro(page, "periodo"))
      .toBe(PERIODO_CORTO.clave)
    await expect(
      page.getByRole("button", { name: `Periodo: ${PERIODO_CORTO.etiqueta}` })
    ).toBeVisible()
    await expect(fechas).not.toHaveText(antes.fechas)
    await expect.poll(() => valorExacto(gmv)).not.toBe(antes.gmv)
    await expect(gmv.getByText("vs. 7 días previos")).toBeVisible()

    // El periodo viaja en la URL: recargar conserva la vista.
    await page.reload()
    await expect(
      page.getByRole("button", { name: `Periodo: ${PERIODO_CORTO.etiqueta}` })
    ).toBeVisible()
  })

  test("un hallazgo lleva a la sección filtrada", async ({ page }) => {
    await page.goto("/inicio")
    await page
      .getByRole("region", { name: "Salud de los medios" })
      .getByRole("link", { name: "Ver medios en riesgo" })
      .click()
    await expect(page).toHaveURL(/\/operacion\/medios\?segmento=en_riesgo$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Medios" })
    ).toBeVisible()
  })
})

test.describe("panel del anunciante", () => {
  test.use({ storageState: sesion("anunciante") })

  test("muestra su pauta: indicadores, gráficos, facturas y cobertura", async ({
    page,
  }) => {
    await page.goto("/inicio")
    await expect(
      page.getByRole("heading", { level: 1, name: CUALQUIER_SALUDO })
    ).toBeVisible()
    await expect(page.getByText(/^Así rinde tu pauta · /)).toBeVisible()

    const indicadores = page.getByRole("region", {
      name: "Indicadores de tu pauta",
    })
    await expect(indicadores.getByRole("article")).toHaveCount(8)
    for (const titulo of ["Inversión", "Alcance", "Impresiones"]) {
      expect(await valorExacto(tarjeta(indicadores, titulo)), titulo).toMatch(
        /[1-9]/
      )
    }
    await esperarGraficoDibujado(grafico(page, "Inversión y alcance"))
    await esperarGraficoDibujado(grafico(page, "Inversión por plataforma"))
    await expect(
      page.getByRole("region", { name: "Facturas por pagar" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Cobertura territorial" })
    ).toBeVisible()

    // Nada del panel interno llega al anunciante.
    await expect(
      page.getByRole("region", { name: "Actividad reciente" })
    ).toHaveCount(0)
    expect(await page.content()).not.toContain("Así va el marketplace")
    await esperarSinDesbordeHorizontal(page)
  })

  test("cambiar el periodo actualiza sus cifras", async ({ page }) => {
    await page.goto("/inicio")
    const inversion = tarjeta(
      page.getByRole("region", { name: "Indicadores de tu pauta" }),
      "Inversión"
    )
    const antes = await valorExacto(inversion)
    await elegirPeriodoRapido(page, PERIODO_CORTO.etiqueta)
    await expect
      .poll(() => parametro(page, "periodo"))
      .toBe(PERIODO_CORTO.clave)
    await expect.poll(() => valorExacto(inversion)).not.toBe(antes)
  })
})

test.describe("panel del medio", () => {
  test.use({ storageState: sesion("medio") })

  test("muestra sus ganancias, su avance y sus pendientes", async ({
    page,
  }, info) => {
    await page.goto("/inicio")
    await expect(
      page.getByRole("heading", { level: 1, name: CUALQUIER_SALUDO })
    ).toBeVisible()

    const ganado = page.getByRole("region", { name: "Ganado este mes" })
    await expect(ganado.getByText("Pendiente de pago")).toBeVisible()
    await expect(ganado.getByText("Pagado a la fecha")).toBeVisible()
    await esperarGraficoDibujado(grafico(page, "Tus ganancias"))
    for (const titulo of [
      "Negocios en curso",
      "Próximas acciones",
      "Tope anual de tu nivel",
      "Tu reputación",
    ]) {
      await expect(grafico(page, titulo)).toBeVisible()
    }
    await expect(
      page.getByRole("meter", { name: "Avance del tope anual" })
    ).toBeVisible()

    // Agrupar por meses redibuja la serie sin salir de la página.
    const agrupar = page.getByRole("group", {
      name: "Agrupar las ganancias por",
    })
    await agrupar.getByRole("button", { name: "Meses" }).click()
    await expect(
      agrupar.getByRole("button", { name: "Meses" })
    ).toHaveAttribute("aria-pressed", "true")

    const barraInferior = page.getByRole("navigation", {
      name: "Accesos directos",
    })
    if (info.project.name !== PROYECTO_MOVIL) {
      await expect(barraInferior).toBeHidden()
      return
    }
    // El medio trabaja desde el celular: barra inferior fija con sus accesos.
    await expect(
      barraInferior.getByRole("link", { name: "Inicio" })
    ).toBeVisible()
    await expect(
      barraInferior.getByRole("link", { name: "Perfil" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
    await barraInferior.getByRole("link", { name: /^Avisos/ }).click()
    await expect(page).toHaveURL(/\/notificaciones$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Notificaciones" })
    ).toBeVisible()
  })
})
