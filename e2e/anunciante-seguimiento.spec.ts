import { readFileSync } from "node:fs"

import { formatearCOP, formatearNumero } from "../src/lib/format"
import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import { anuncianteDemo, clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import { CUENTA_MEDIO_VERIFICADO, MEDIO_VERIFICADO } from "./utilidades/medios"
import {
  type AsignacionPreparadaE2E,
  aprobarMetricaE2E,
  borrarPautaE2E,
  PREFIJO_PAUTA_ANUNCIANTE,
  prepararAsignacionE2E,
  valoresMetricaE2E,
  verificarAsignacionE2E,
} from "./utilidades/pauta"
import {
  PROYECTO_ANUNCIANTE,
  PROYECTO_ESCRITORIO,
} from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Seguimiento y métricas de una campaña del anunciante (paquete SG: ANU-011,
 * ANU-012) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil; sesión demo del anunciante), con
 *   una campaña demo que tiene negocios verificados en tres o más municipios:
 *   el corte «Municipio» muestra los indicadores de cada municipio con su
 *   tamaño de muestra; el seguimiento lista los medios y su ficha pública no
 *   trae datos privados. Nada se desborda a lo ancho. En escritorio, además,
 *   exporta el PDF y el Excel de marca.
 * - Escribe (solo en el proyecto «anunciante», en serie), con «Anunciante E2E»
 *   y una asignación real del «Medio E2E» (fábricas de pauta, campañas
 *   «Seguimiento E2E…»): el enlace del aviso abre la asignación con su enlace
 *   al post y su captura firmada; la ficha del medio no muestra documentos,
 *   datos bancarios ni lo que recibe; desde el aviso de resultados parciales
 *   de «Métricas», «Ver el seguimiento» cambia de pestaña sin dejar el foco en
 *   el `<body>`; el corte que aprueba el equipo AMO aparece solo al minuto
 *   (reloj de Playwright) sin quitarle el foco a «Actualizar», y la
 *   verificación al tocarlo; ya verificada, entra al consolidado de «Métricas».
 */

const ESTADOS_CUMPLIDOS = ["VERIFICADA", "LIQUIDADA", "PAGADA"] as const

/** El rótulo «Vence en…» y las cifras usan espacios duros: se comparan sin ellos. */
function sinEspaciosDuros(texto: string): string {
  return texto.replace(/[  ]/g, " ")
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function pestanaSeguimiento(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Seguimiento" })
}

function pestanaMetricas(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Métricas" })
}

function tarjetaDelMedio(page: Page, nombre: string): Locator {
  return pestanaSeguimiento(page).getByRole("article", {
    name: nombre,
    exact: true,
  })
}

interface CampanaDemo {
  id: string
  nombre: string
  municipios: number
}

/** Municipios distintos de los medios con negocios verificados en la campaña. */
async function municipiosVerificados(campanaId: string): Promise<number> {
  const { data, error } = await clienteDeLectura()
    .from("asignaciones")
    .select("medio:medios!inner ( municipio_codigo )")
    .eq("campana_id", campanaId)
    .in("estado", [...ESTADOS_CUMPLIDOS])
    .limit(1000)
  if (error) throw new Error(`No se pudo leer la campaña: ${error.message}`)
  return new Set(
    data.flatMap((fila) =>
      fila.medio.municipio_codigo ? [fila.medio.municipio_codigo] : []
    )
  ).size
}

/**
 * Una campaña de la empresa demo con negocios verificados en al menos tres
 * municipios distintos (el criterio de ANU-012), entre las verificadas más
 * recientemente. El conteo final se hace sobre toda la campaña.
 */
async function campanaDemoConMunicipios(minimo = 3): Promise<CampanaDemo> {
  const servicio = clienteDeLectura()
  const anunciante = await anuncianteDemo(servicio)
  const { data, error } = await servicio
    .from("asignaciones")
    .select(
      "campana_id, medio:medios!inner ( municipio_codigo ), campana:campanas!inner ( nombre, deleted_at )"
    )
    .eq("anunciante_id", anunciante.id)
    .in("estado", [...ESTADOS_CUMPLIDOS])
    .is("campana.deleted_at", null)
    .order("verificada_at", { ascending: false })
    .limit(1000)
  if (error) {
    throw new Error(`No se pudieron leer las asignaciones: ${error.message}`)
  }
  const porCampana = new Map<
    string,
    { nombre: string; municipios: Set<string> }
  >()
  for (const fila of data) {
    const campana = porCampana.get(fila.campana_id) ?? {
      nombre: fila.campana.nombre,
      municipios: new Set<string>(),
    }
    if (fila.medio.municipio_codigo) {
      campana.municipios.add(fila.medio.municipio_codigo)
    }
    porCampana.set(fila.campana_id, campana)
  }
  for (const [id, campana] of porCampana) {
    if (campana.municipios.size >= minimo) {
      return {
        id,
        nombre: campana.nombre,
        municipios: await municipiosVerificados(id),
      }
    }
  }
  throw new Error(
    `La empresa demo no tiene campañas verificadas en ${minimo} municipios (¿faltan los datos demo?).`
  )
}

// ── Solo lectura: empresa demo ───────────────────────────────────────────────

test.describe("seguimiento y métricas · solo lectura", () => {
  test.use({ storageState: sesion("anunciante") })

  let campana: CampanaDemo

  test.beforeAll(async () => {
    campana = await campanaDemoConMunicipios()
  })

  test("el corte «Municipio» muestra cada municipio con su tamaño de muestra (ANU-012)", async ({
    page,
  }) => {
    await page.goto(`/campanas/${campana.id}?pestana=metricas`)
    await expect(
      page.getByRole("heading", { level: 1, name: campana.nombre })
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: "Métricas" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const metricas = pestanaMetricas(page)
    await expect(
      metricas.getByRole("heading", { name: "Resultados de la campaña" })
    ).toBeVisible()
    const consolidado = metricas.getByRole("region", { name: "Consolidado" })
    for (const indicador of [
      "Inversión verificada",
      "Alcance acumulado",
      "Impresiones",
      "Interacciones",
      "Reproducciones",
      "Clics en el enlace",
    ]) {
      await expect(
        consolidado.getByRole("heading", { name: indicador })
      ).toBeVisible()
    }
    const eficiencia = metricas.getByRole("region", {
      name: "Costo por resultado y engagement",
    })
    for (const indicador of [
      "CPM efectivo",
      "Costo por interacción",
      "Engagement",
      "Costo por persona alcanzada",
    ]) {
      await expect(
        eficiencia.getByRole("heading", { name: indicador, exact: true })
      ).toBeVisible()
    }

    await metricas
      .getByRole("group", { name: "Ver por" })
      .getByRole("button", { name: "Municipio" })
      .click()
    await expect.poll(() => parametro(page, "corte")).toBe("municipio")

    const tabla = metricas.getByRole("table", {
      name: /Resultados por municipio/,
    })
    await expect(
      tabla.getByRole("columnheader", { name: "Negocios (n)" })
    ).toBeVisible()
    const filas = tabla.locator("tbody tr")
    await expect(filas).toHaveCount(campana.municipios)
    // Cada municipio con su n (un entero de al menos un negocio).
    const columnaN = await tabla
      .getByRole("columnheader")
      .allInnerTexts()
      .then((titulos) => titulos.findIndex((t) => t.trim() === "Negocios (n)"))
    for (const fila of await filas.all()) {
      const celdas = fila.locator("th, td")
      await expect(celdas.nth(columnaN)).toHaveText(/^\d[\d.]*/)
    }
    await expect(
      tabla.locator("tfoot").getByRole("rowheader", { name: "Toda la campaña" })
    ).toBeVisible()
    await expect(
      metricas.getByRole("heading", { name: "Municipios con más alcance" })
    ).toBeVisible()

    await test.step("al recargar conserva el corte elegido", async () => {
      await page.reload()
      await expect(
        pestanaMetricas(page)
          .getByRole("group", { name: "Ver por" })
          .getByRole("button", { name: "Municipio" })
      ).toHaveAttribute("aria-pressed", "true")
    })
    await esperarSinDesbordeHorizontal(page)
  })

  test("el seguimiento lista los medios y su ficha pública no trae datos privados (ANU-011)", async ({
    page,
  }) => {
    await page.goto(`/campanas/${campana.id}?pestana=seguimiento`)
    const seguimiento = pestanaSeguimiento(page)
    await expect(
      seguimiento.getByRole("heading", { name: "Seguimiento de los medios" })
    ).toBeVisible()
    const filtro = seguimiento.getByRole("group", {
      name: "Filtrar las asignaciones por estado",
    })
    await expect(filtro.getByRole("button", { name: /Todas/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await filtro.getByRole("button", { name: /Cumplidas/ }).click()
    await expect(
      seguimiento.getByRole("list", { name: "Asignaciones: Cumplidas" })
    ).toBeVisible()

    const primera = seguimiento.getByRole("article").first()
    await expect(primera.getByText("Cumplida", { exact: true })).toBeVisible()
    await primera.getByRole("heading", { level: 3 }).getByRole("button").click()
    const ficha = page.getByRole("dialog")
    await expect(
      ficha.getByText(/AMO no comparte los documentos, los datos de contacto/)
    ).toBeVisible()
    await expect(ficha.getByText("Cumplimiento")).toBeVisible()
    // La nota de privacidad nombra lo que no se comparte; nada de eso aparece.
    await expect(ficha).not.toContainText(/\bNIT\b|cédula|ahorros|corriente/i)
    await page.keyboard.press("Escape")
    await expect(ficha).toBeHidden()
    await esperarSinDesbordeHorizontal(page)
  })

  test("exporta las métricas a PDF y a Excel con la marca AMO (ANU-012)", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== PROYECTO_ESCRITORIO,
      "Cada descarga queda en la bitácora: basta con un proyecto."
    )
    await page.goto(`/campanas/${campana.id}?pestana=metricas&corte=municipio`)
    const metricas = pestanaMetricas(page)
    await expect(
      metricas.getByRole("table", { name: /Resultados por municipio/ })
    ).toBeVisible()

    for (const { opcion, extension, firma, aviso } of [
      {
        opcion: /^PDF \(\.pdf\)/,
        extension: "pdf",
        firma: "%PDF-",
        aviso: "PDF descargado",
      },
      {
        opcion: /^Excel \(\.xlsx\)/,
        extension: "xlsx",
        firma: "PK",
        aviso: "Excel descargado",
      },
    ] as const) {
      const descarga = page.waitForEvent("download")
      await metricas
        .getByRole("button", { name: "Exportar", exact: true })
        .click()
      await page.getByRole("menuitem", { name: opcion }).click()
      const archivo = await descarga
      expect(archivo.suggestedFilename()).toMatch(
        new RegExp(`^metricas-.+-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`)
      )
      const contenido = readFileSync(await archivo.path())
      expect(contenido.subarray(0, firma.length).toString("latin1")).toBe(firma)
      if (extension === "pdf") {
        // Logo de marca y gráficos: imágenes incrustadas (las cifras y los
        // filtros van en el texto comprimido del documento).
        const imagenes = contenido
          .toString("latin1")
          .match(/\/Subtype\s*\/Image/g)
        expect(imagenes?.length ?? 0).toBeGreaterThanOrEqual(3)
        expect(contenido.byteLength).toBeGreaterThan(20_000)
      }
      await expect(page.getByText(aviso, { exact: true })).toBeVisible()
    }
  })
})

// ── Escribe: «Anunciante E2E» con una asignación del «Medio E2E» ─────────────

test.describe("seguimiento y métricas · asignación real", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let preparada: AsignacionPreparadaE2E
  let campanaId = ""

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Crea campañas y asignaciones del Anunciante E2E: corre solo en el proyecto «anunciante», en serie."
    )
    info.setTimeout(240_000)
    await borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })
    // Evidencia publicada hace 25 h y validada, con el corte de 24 h cargado
    // (aún sin aprobar: el anunciante todavía no lo ve).
    preparada = await prepararAsignacionE2E({
      hasta: "METRICAS_CARGADAS",
      oferta: { prefijo: PREFIJO_PAUTA_ANUNCIANTE },
    })
    if (!preparada.oferta) throw new Error("La fábrica no creó la oferta.")
    campanaId = preparada.oferta.campana.id
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })
  })

  test("el enlace del aviso abre la asignación con el enlace al post y la captura (ANU-011)", async ({
    page,
  }) => {
    const [evidencia] = preparada.publicaciones
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campanaId}?pestana=seguimiento&asignacion=${preparada.asignacionId}`,
    })
    await expect(
      page.getByRole("tab", { name: "Seguimiento" })
    ).toHaveAttribute("aria-selected", "true")
    const tarjeta = tarjetaDelMedio(page, MEDIO_VERIFICADO.nombre)
    await expect(tarjeta).toBeFocused()
    await expect(tarjeta.getByText("Métricas en revisión")).toBeVisible()
    await expect(
      tarjeta.getByText(
        `${formatearNumero(CUENTA_MEDIO_VERIFICADO.seguidores)} seguidores al aceptar`,
        { exact: false }
      )
    ).toBeVisible()
    await expect(
      tarjeta.getByText(
        sinEspaciosDuros(formatearCOP(preparada.aceptacion.montoBruto))
      )
    ).toBeVisible()

    const post = tarjeta.getByRole("link", { name: /^Ver publicación/ })
    await expect(post).toHaveAttribute("href", evidencia.url)
    await expect(post).toHaveAttribute("target", "_blank")

    // Abierta por el enlace: la captura firmada como usuario (carpeta de la asignación).
    const desplegar = tarjeta.getByRole("button", {
      name: "Evidencia, métricas y línea de tiempo",
    })
    await expect(desplegar).toHaveAttribute("aria-expanded", "true")
    const captura = tarjeta.getByRole("img", {
      name: `Captura de la publicación de @${CUENTA_MEDIO_VERIFICADO.handle}`,
    })
    await expect(captura).toBeVisible()
    await expect(captura).toHaveAttribute(
      "src",
      new RegExp(
        `/storage/v1/object/sign/evidencias/asignacion/${preparada.asignacionId}/`
      )
    )
    await expect
      .poll(() => captura.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    // El corte de 24 h sigue pendiente: el anunciante aún no lo ve.
    await expect(
      tarjeta.getByText("Aún no hay cortes de métricas aprobados.", {
        exact: false,
      })
    ).toBeVisible()

    await test.step("la captura se abre en grande y se puede descargar", async () => {
      await captura.click()
      const visor = page.getByRole("dialog", {
        name: `Captura de la publicación de @${CUENTA_MEDIO_VERIFICADO.handle}`,
      })
      await expect(visor.getByRole("img")).toBeVisible()
      await expect(
        visor.getByRole("button", { name: "Descargar" })
      ).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(visor).toBeHidden()
    })

    // Nunca lo que recibe el medio.
    const montoMedio = sinEspaciosDuros(
      formatearCOP(preparada.aceptacion.montoMedio)
    )
    if (preparada.aceptacion.montoMedio !== preparada.aceptacion.montoBruto) {
      await expect(pestanaSeguimiento(page)).not.toContainText(
        new RegExp(escaparRegex(montoMedio).replace(/ /g, "\\s"))
      )
    }
    await esperarSinDesbordeHorizontal(page)
  })

  test("la ficha del medio no muestra documentos, datos bancarios ni lo que recibe (ANU-011)", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campanaId}?pestana=seguimiento`,
    })
    const tarjeta = tarjetaDelMedio(page, MEDIO_VERIFICADO.nombre)
    await tarjeta
      .getByRole("button", { name: MEDIO_VERIFICADO.nombre, exact: true })
      .click()
    const ficha = page.getByRole("dialog", { name: MEDIO_VERIFICADO.nombre })
    await expect(ficha.getByText("Página de noticias")).toBeVisible()
    await expect(
      ficha.getByText("Cuenta con la que aceptó en esta campaña")
    ).toBeVisible()
    await expect(
      ficha.getByText(/AMO no comparte los documentos, los datos de contacto/)
    ).toBeVisible()
    for (const privado of [
      "Bancolombia",
      "40900012345",
      "1099000001",
      "pagos.medio.e2e@amo.test",
      "Titular Medio E2E",
    ]) {
      await expect(ficha).not.toContainText(privado)
    }
    if (preparada.aceptacion.montoMedio !== preparada.aceptacion.montoBruto) {
      await expect(ficha).not.toContainText(
        formatearNumero(preparada.aceptacion.montoMedio)
      )
    }
    // Al cerrar, el foco vuelve al nombre del medio.
    await page.keyboard.press("Escape")
    await expect(
      tarjeta.getByRole("button", {
        name: MEDIO_VERIFICADO.nombre,
        exact: true,
      })
    ).toBeFocused()
  })

  test("desde «Métricas», «Ver el seguimiento» cambia de pestaña sin perder el foco (ANU-012)", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campanaId}?pestana=metricas`,
    })
    // La asignación sigue en ejecución: el consolidado es parcial.
    await pestanaMetricas(page)
      .getByRole("complementary", { name: "Resultados parciales" })
      .getByRole("link", { name: "Ver el seguimiento" })
      .click()
    await expect.poll(() => parametro(page, "pestana")).toBe("seguimiento")
    await expect(
      page.getByRole("tab", { name: "Seguimiento" })
    ).toHaveAttribute("aria-selected", "true")
    // El título del panel o, si aún carga, la pestaña; nunca el `<body>`.
    await expect(page.locator(":focus")).toHaveAccessibleName(/^Seguimiento/)
    await expect(tarjetaDelMedio(page, MEDIO_VERIFICADO.nombre)).toBeVisible()
  })

  test("se actualiza sola cada minuto y al tocar «Actualizar» (ANU-011)", async ({
    page,
  }) => {
    // Reloj de Playwright desde antes de cargar: el minuto se adelanta sin esperas fijas.
    await page.clock.install()
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campanaId}?pestana=seguimiento&asignacion=${preparada.asignacionId}`,
    })
    const tarjeta = tarjetaDelMedio(page, MEDIO_VERIFICADO.nombre)
    await expect(tarjeta.getByText("Métricas en revisión")).toBeVisible()

    await test.step("el corte que aprueba el equipo AMO aparece al minuto", async () => {
      expect(
        await aprobarMetricaE2E({ asignacionId: preparada.asignacionId })
      ).toBeGreaterThan(0)
      // El sondeo no deshabilita «Actualizar»: quien está en él no pierde el foco.
      const actualizar = pestanaSeguimiento(page).getByRole("button", {
        name: "Actualizar",
      })
      await actualizar.focus()
      await page.clock.fastForward("01:05")
      const tabla = tarjeta.getByRole("table", { name: /Métricas aprobadas/ })
      await expect(tabla).toBeVisible()
      await expect(actualizar).toBeFocused()
      const valores = valoresMetricaE2E("INSTAGRAM", "H24")
      const fila = tabla.getByRole("row").filter({ hasText: "24 horas" })
      await expect(fila).toContainText(formatearNumero(valores.alcance ?? 0))
      await expect(fila).toContainText(
        formatearNumero(valores.impresiones ?? 0)
      )
      await expect(tarjeta.getByText("Con novedades")).toBeVisible()
      await expect(
        page.getByText("Seguimiento actualizado: 1 asignación con novedades.")
      ).toBeAttached()
    })

    await test.step("«Actualizar» trae la verificación sin esperar", async () => {
      await verificarAsignacionE2E({ asignacionId: preparada.asignacionId })
      await pestanaSeguimiento(page)
        .getByRole("button", { name: "Actualizar" })
        .click()
      await expect(tarjeta.getByText("Cumplida", { exact: true })).toBeVisible()
    })
  })

  test("ya verificada, entra al consolidado de «Métricas» (ANU-012)", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campanaId}?pestana=metricas`,
    })
    const metricas = pestanaMetricas(page)
    const valores = valoresMetricaE2E("INSTAGRAM", "H24")
    const consolidado = metricas.getByRole("region", { name: "Consolidado" })
    await expect(
      consolidado.getByRole("article").filter({
        has: page.getByRole("heading", { name: "Alcance acumulado" }),
      })
    ).toContainText(formatearNumero(valores.alcance ?? 0))
    await expect(
      metricas.getByRole("complementary", { name: "Resultados parciales" })
    ).toHaveCount(0)

    await metricas
      .getByRole("group", { name: "Ver por" })
      .getByRole("button", { name: "Medio" })
      .click()
    const tabla = metricas.getByRole("table", { name: /Resultados por medio/ })
    await expect(
      tabla.getByRole("rowheader", { name: MEDIO_VERIFICADO.nombre })
    ).toBeVisible()
    await expect(tabla.locator("tbody tr")).toHaveCount(1)
    await esperarSinDesbordeHorizontal(page)
  })
})
