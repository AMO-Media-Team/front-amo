import { readFileSync } from "node:fs"

import {
  REPORTES,
  rutaReporte,
  SLUGS_REPORTE,
} from "../src/features/reportes/catalogo"
import {
  type Anunciante,
  anuncianteDemo,
  anunciantesAjenos,
  clienteDeLectura,
} from "./utilidades/datos-demo"
import {
  elegirPeriodoRapido,
  esperarGraficoDibujado,
  esperarSinDesbordeHorizontal,
  parametro,
} from "./utilidades/interfaz"
import { expect, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Centro de reportes y los siete reportes contra `pnpm build && pnpm start` y
 * los datos demo reales. Las exportaciones quedan en la bitácora (inmutable).
 */

const FORMATOS = [
  {
    opcion: /^Excel \(\.xlsx\)/,
    extension: "xlsx",
    firma: "PK",
    aviso: "Excel descargado",
  },
  {
    opcion: /^PDF \(\.pdf\)/,
    extension: "pdf",
    firma: "%PDF-",
    aviso: "PDF descargado",
  },
] as const

function paginacion(page: Page) {
  return page.getByRole("navigation", { name: "Paginación de la tabla" })
}

test.describe("equipo interno", () => {
  test.use({ storageState: sesion("interno") })

  test("el centro lista los siete reportes y abre el elegido", async ({
    page,
  }) => {
    await page.goto("/reportes")
    await expect(
      page.getByRole("heading", { level: 1, name: "Reportes" })
    ).toBeVisible()
    for (const slug of SLUGS_REPORTE) {
      await expect(
        page.getByRole("link", {
          name: new RegExp(`^${REPORTES[slug].titulo} `),
        })
      ).toHaveAttribute("href", rutaReporte(slug))
    }
    for (const grupo of [
      "Negocio y finanzas",
      "Territorio y medios",
      "Seguridad",
    ]) {
      await expect(page.getByRole("region", { name: grupo })).toBeVisible()
    }

    await page.getByRole("link", { name: /^Cartera / }).click()
    await expect(page).toHaveURL(/\/reportes\/cartera$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Cartera" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^Fecha de corte: / })
    ).toBeVisible()
  })

  for (const slug of SLUGS_REPORTE) {
    const { titulo, indicadores } = REPORTES[slug]

    test(`«${titulo}» se dibuja con datos`, async ({ page }) => {
      await page.goto(rutaReporte(slug))
      await expect(
        page.getByRole("heading", { level: 1, name: titulo, exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole("navigation", { name: "Ruta de navegación" })
      ).toContainText(titulo)

      const tarjetas = page
        .getByRole("region", { name: "Indicadores del reporte" })
        .getByRole("article")
      await expect(tarjetas).toHaveCount(indicadores)
      await expect(tarjetas.first().getByRole("paragraph").first()).toHaveText(
        /[1-9]/
      )
      await esperarGraficoDibujado(
        page.getByRole("region", { name: "Gráficos" })
      )
      // La tabla de detalle trae filas (escritorio) o tarjetas (móvil).
      await expect(paginacion(page)).toContainText(/1–\d+ de [\d.]+/)
      await expect(
        page.getByRole("button", { name: "Exportar", exact: true })
      ).toBeEnabled()
      await esperarSinDesbordeHorizontal(page)
    })
  }

  test("los filtros viajan en la URL y sobreviven a una recarga", async ({
    page,
  }) => {
    await page.goto(rutaReporte("cobertura-territorial"))
    await page
      .getByRole("button", { name: "Departamento: Todo el país" })
      .click()
    await page.getByRole("option", { name: "Antioquia", exact: true }).click()
    await expect.poll(() => parametro(page, "departamento")).toBe("05")
    const filtroDepartamento = page.getByRole("button", {
      name: "Departamento: Antioquia",
    })
    await expect(filtroDepartamento).toBeVisible()

    await elegirPeriodoRapido(page, "Este mes")
    await expect.poll(() => parametro(page, "periodo")).toBe("esteMes")
    expect(parametro(page, "departamento")).toBe("05")

    await page.reload()
    await expect(filtroDepartamento).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Periodo: Este mes" })
    ).toBeVisible()
    await expect(paginacion(page)).toContainText(/1–\d+ de [\d.]+/)
  })

  test("exporta el reporte a Excel y a PDF", async ({ page }) => {
    await page.goto(rutaReporte("cartera"))
    await expect(paginacion(page)).toBeVisible()

    for (const { opcion, extension, firma, aviso } of FORMATOS) {
      const descarga = page.waitForEvent("download")
      await page.getByRole("button", { name: "Exportar", exact: true }).click()
      await page.getByRole("menuitem", { name: opcion }).click()
      const archivo = await descarga

      expect(archivo.suggestedFilename()).toMatch(
        new RegExp(`^cartera-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`)
      )
      const contenido = readFileSync(await archivo.path())
      expect(contenido.byteLength).toBeGreaterThan(5_000)
      expect(contenido.subarray(0, firma.length).toString("latin1")).toBe(firma)
      await expect(page.getByText(aviso, { exact: true })).toBeVisible()
    }
  })
})

test.describe("anunciante", () => {
  test.use({ storageState: sesion("anunciante") })

  let propio: Anunciante
  let ajenos: Awaited<ReturnType<typeof anunciantesAjenos>>

  test.beforeAll(async () => {
    const servicio = clienteDeLectura()
    propio = await anuncianteDemo(servicio)
    ajenos = await anunciantesAjenos(servicio, propio)
  })

  test("solo encuentra su reporte, y solo con sus campañas", async ({
    page,
  }) => {
    await page.goto("/reportes")
    await expect(
      page.getByRole("region", { name: "Tu reporte" }).getByRole("link")
    ).toHaveCount(1)
    await expect(page.getByRole("link", { name: /^Finanzas / })).toHaveCount(0)

    // Ni pidiendo en la URL el anunciante de otra empresa salen datos ajenos.
    await page.goto(
      `${rutaReporte("desempeno-campanas")}?periodo=esteTrimestre&anunciante=${ajenos[0].id}`
    )
    await expect(
      page.getByRole("heading", { level: 1, name: "Desempeño de campañas" })
    ).toBeVisible()
    await expect(paginacion(page)).toContainText(/1–\d+ de [\d.]+/)
    await expect(
      page.getByRole("button", { name: /^Anunciante: / })
    ).toHaveCount(0)
    const html = await page.content()
    for (const ajeno of ajenos) {
      expect(html, `datos de ${ajeno.nombre}`).not.toContain(ajeno.nombre)
    }
  })

  test("los reportes internos responden 403 sin enviar datos", async ({
    page,
  }) => {
    for (const slug of ["finanzas", "cartera", "usuarios-accesos"] as const) {
      await page.goto(rutaReporte(slug))
      await expect(
        page.getByRole("heading", {
          name: "No tienes permiso para ver esta sección",
        })
      ).toBeVisible()
      const html = await page.content()
      expect(html).not.toContain("Indicadores del reporte")
      for (const ajeno of ajenos) expect(html).not.toContain(ajeno.nombre)
    }
  })
})
