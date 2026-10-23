import { imagenDePrueba } from "./utilidades/archivos"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { ingresarComoMedio } from "./utilidades/medios"
import {
  aceptarOfertaE2E,
  aprobarMetricaE2E,
  cargarMetricaE2E,
  crearOfertaPautaE2E,
  diasAtrasParaCorte,
  entregarContenidoE2E,
  leerAsignacionE2E,
  prepararAsignacionE2E,
  publicarEvidenciaE2E,
  publicarNuevaVersionCreativoE2E,
  rechazarEvidenciaE2E,
  restablecerPautaMedioE2E,
  validarEvidenciaE2E,
} from "./utilidades/pauta"
import { PROYECTO_PAUTA_MEDIO } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * Evidencia y métricas del medio (paquete EV: MED-013, MED-014, INT-001,
 * INT-002, INT-005) contra `pnpm build && pnpm start`, con el «Medio E2E» y
 * las fábricas de pauta (solo en el proyecto «pauta-medio», a 390 px y en
 * serie):
 *
 * - Evidencia: un enlace de Instagram que no es una publicación, uno de otra
 *   red y la historia de otra cuenta se rechazan en pantalla; sin la etiqueta
 *   de publicidad no se envía; completa (enlace, fecha, captura), la
 *   asignación queda PUBLICADA con la URL canónica y la captura en su carpeta.
 * - Una evidencia rechazada muestra las observaciones y se corrige conservando
 *   la captura (con una hora posterior a la descarga del contenido); con una
 *   versión nueva del contenido sin descargar, la BD exige descargarla.
 * - Métricas: sin captura no se registran; un corte de 72 h con menos alcance
 *   que el de 24 h se bloquea en el formulario; corregido, el último corte deja
 *   la asignación en METRICAS_CARGADAS. Un corte que aún no se cumple espera
 *   con su cuenta regresiva; el personalizado no reemplaza a los requeridos; una
 *   métrica aprobada ya no se edita.
 */

function rutaEvidencia(asignacionId: string, numero?: number): string {
  const base = `/mis-campanas/${asignacionId}/evidencia`
  return numero ? `${base}?numero=${numero}` : base
}

function rutaMetricas(
  asignacionId: string,
  corte: "H24" | "H72" | "D7" | "PERSONALIZADO",
  numero = 1
): string {
  return `/mis-campanas/${asignacionId}/metricas?numero=${numero}&corte=${corte}`
}

/** URL de un post de Instagram que no se repite entre corridas. */
/**
 * Por rol y no por etiqueta: mientras React termina el streaming, la copia del
 * servidor sigue un instante oculta en el DOM y `getByLabel` también la cuenta.
 */
function campoEnlace(page: Page): Locator {
  return page.getByRole("textbox", { name: "Enlace de la publicación" })
}

function urlUnica(): string {
  const codigo = `EV${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  return `https://www.instagram.com/p/${codigo}/`
}

function seccion(page: Page, nombre: string): Locator {
  return page.getByRole("region", { name: nombre })
}

/** Hora actual de Colombia ('HH:mm'): la de una publicación de ahora mismo. */
function horaBogotaAhora(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date())
}

/** Elige una captura del panel y espera a que quede subida y verificada. */
async function elegirCaptura(page: Page): Promise<void> {
  const zona = seccion(page, "Captura de las estadísticas")
  const [selector] = await Promise.all([
    page.waitForEvent("filechooser"),
    zona.getByRole("button", { name: "Elegir archivo" }).click(),
  ])
  await selector.setFiles(
    await imagenDePrueba({ ancho: 540, alto: 960, nombre: "estadisticas.png" })
  )
  await expect(zona.getByText("Lista para enviar")).toBeVisible()
}

/** Oferta de la pauta aceptada, con el contenido descargado y la evidencia cargada. */
async function asignacionConEvidencia({
  cortes,
  haceHoras,
  validada = true,
}: {
  cortes: ("H24" | "H72" | "D7")[]
  haceHoras: number
  validada?: boolean
}) {
  const oferta = await crearOfertaPautaE2E({
    cortes,
    diasAtras: Math.max(...cortes.map((corte) => diasAtrasParaCorte(corte))),
  })
  const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
  await entregarContenidoE2E({ asignacionId })
  await publicarEvidenciaE2E({ asignacionId, numero: 1, haceHoras })
  if (validada) await validarEvidenciaE2E({ asignacionId })
  return { oferta, asignacionId }
}

/** Escribe las cifras de Instagram (post del feed) en el formulario. */
async function escribirCifras(
  page: Page,
  cifras: Record<string, string>
): Promise<void> {
  const panel = seccion(page, "Cifras del panel")
  for (const [etiqueta, valor] of Object.entries(cifras)) {
    await panel
      .getByRole("textbox", { name: etiqueta, exact: true })
      .fill(valor)
  }
}

const CIFRAS_H72 = {
  Alcance: "16.800",
  Impresiones: "25.200",
  "Me gusta": "840",
  Comentarios: "63",
  Guardados: "35",
  Compartidos: "42",
}

test.describe("ejecución · pauta del Medio E2E", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeEach(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_PAUTA_MEDIO,
      "Ejecuta ofertas con el Medio E2E: corre solo en el proyecto «pauta-medio», en serie."
    )
    await restablecerPautaMedioE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_PAUTA_MEDIO) return
    await restablecerPautaMedioE2E()
  })

  test("evidencia: valida el enlace por red y formato, exige la etiqueta y queda publicada", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })

    await ingresarComoMedio(page, { destino: rutaEvidencia(asignacionId) })
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Evidencia de tu publicación",
      })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const enlace = campoEnlace(page)
    const enviar = page.getByRole("button", { name: "Enviar evidencia" })

    // MED-013: un enlace de Instagram que no es un post, reel o historia.
    await enlace.fill("https://www.instagram.com/explore/tags/pasto/")
    await enviar.click()
    await expect(
      page.getByText(
        "Ese enlace de Instagram no lleva a una publicación, un reel o una historia. Para esta oferta, copia el enlace de la publicación."
      )
    ).toBeVisible()
    await expect(enlace).toBeFocused()

    // INT-002: un enlace de otra red.
    await enlace.fill("https://www.facebook.com/reel/1234567890123456")
    await enviar.click()
    await expect(
      page.getByText(
        "Ese enlace es de Facebook, pero la publicación debe estar en Instagram."
      )
    ).toBeVisible()

    // S2: la historia de otra cuenta (la BD tampoco la acepta).
    await enlace.fill(
      "https://www.instagram.com/stories/otra.cuenta.e2e/3456789012345678901"
    )
    await enviar.click()
    await expect(
      page.getByText(
        /^El enlace es de @otra\.cuenta\.e2e y esta campaña es con @.+\. Pega el enlace de la publicación en tu cuenta\.$/
      )
    ).toBeVisible()

    // Sin la etiqueta de publicidad no se envía.
    const url = urlUnica()
    await enlace.fill(`${url}?igsh=compartido`)
    await elegirCaptura(page)
    await enviar.click()
    await expect(
      page.getByText(
        "Confirma que tu publicación lleva la etiqueta de publicidad."
      )
    ).toBeVisible()
    expect((await leerAsignacionE2E(asignacionId)).publicaciones).toEqual([])
    await esperarSinDesbordeHorizontal(page)

    await page
      .getByRole("checkbox", {
        name: "Mi publicación lleva la etiqueta de publicidad",
      })
      .check()
    await enviar.click()
    await expect(page).toHaveURL(
      (direccion) => direccion.pathname === `/mis-campanas/${asignacionId}`
    )
    await expect(page.getByText(/Enviaste tu evidencia/)).toBeVisible()

    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.estado).toBe("PUBLICADA")
    const [publicacion] = asignacion.publicaciones
    // Se guarda la forma canónica: sin parámetros de rastreo ni barra final.
    expect(publicacion?.url).toBe(url.replace(/\/$/, ""))
    expect(publicacion?.estado).toBe("PENDIENTE")
    expect(publicacion?.capturaPath).toMatch(
      new RegExp(
        `^asignacion/${asignacionId}/publicacion/[0-9a-f-]{36}\\.(webp|jpg)$`
      )
    )
  })

  test("evidencia rechazada: muestra las observaciones y se corrige conservando la captura", async ({
    page,
  }) => {
    const { asignacionId } = await prepararAsignacionE2E({
      hasta: "PUBLICADA",
      oferta: { cortes: ["H24"] },
    })
    const observaciones = "El enlace no abre: la publicación es privada."
    await rechazarEvidenciaE2E({ asignacionId, observaciones })
    const anterior = (await leerAsignacionE2E(asignacionId)).publicaciones[0]

    await ingresarComoMedio(page, { destino: rutaEvidencia(asignacionId, 1) })
    await expect(
      page.getByText("El equipo AMO pidió corregir tu evidencia")
    ).toBeVisible()
    await expect(page.getByText(observaciones)).toBeVisible()
    await expect(campoEnlace(page)).toHaveValue(anterior?.url ?? "")
    await expect(page.getByText("Se conserva si no eliges otra.")).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const nueva = urlUnica()
    await campoEnlace(page).fill(nueva)
    // La fábrica declara la publicación un minuto antes de ahora, antes de la
    // descarga del contenido: la corrección la declara ahora (N2).
    await seccion(page, "¿Cuándo publicaste?")
      .getByLabel("Hora")
      .fill(horaBogotaAhora())
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Enviar la corrección" }).click()
    await expect(page).toHaveURL(
      (direccion) => direccion.pathname === `/mis-campanas/${asignacionId}`
    )

    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.estado).toBe("PUBLICADA")
    expect(asignacion.publicaciones[0]).toMatchObject({
      estado: "PENDIENTE",
      url: nueva.replace(/\/$/, ""),
      capturaPath: anterior?.capturaPath,
    })
  })

  test("versión nueva del contenido sin descargar: se avisa y la BD exige descargarla", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarNuevaVersionCreativoE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page, { destino: rutaEvidencia(asignacionId) })
    await expect(
      page.getByText("Hay una versión nueva del contenido")
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Ver el contenido" })
    ).toHaveAttribute("href", `/mis-campanas/${asignacionId}/contenido`)

    await campoEnlace(page).fill(urlUnica())
    await elegirCaptura(page)
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Enviar evidencia" }).click()
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Descarga la versión vigente y publica con ella/ })
    ).toBeVisible()
    expect((await leerAsignacionE2E(asignacionId)).estado).toBe(
      "CONTENIDO_ENTREGADO"
    )
  })

  test("métricas: captura obligatoria, coherencia entre cortes y METRICAS_CARGADAS con el último", async ({
    page,
  }) => {
    const { asignacionId } = await asignacionConEvidencia({
      cortes: ["H24", "H72"],
      haceHoras: 73,
    })
    // El corte de 24 h ya está cargado: alcance 12.000, impresiones 18.000.
    await cargarMetricaE2E({ asignacionId, numero: 1, corte: "H24" })

    await ingresarComoMedio(page, {
      destino: rutaMetricas(asignacionId, "H72"),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: "Métricas de 72 horas" })
    ).toBeVisible()
    await expect(
      page.getByRole("navigation", { name: "Cortes de métricas" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        name: "Lo que ya cargaste de esta publicación",
      })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const enviar = page.getByRole("button", { name: "Enviar métricas" })

    // INT-001: sin captura no se registra.
    await escribirCifras(page, CIFRAS_H72)
    await enviar.click()
    await expect(
      page.getByText(
        "Carga la captura del panel de estadísticas, con la fecha visible."
      )
    ).toBeVisible()

    // INT-005: un 72 h con menos alcance que el de 24 h (12.000, tolerancia del 2 %).
    await escribirCifras(page, { Alcance: "11.000" })
    await elegirCaptura(page)
    await enviar.click()
    await expect(
      page.getByText(
        /^En el corte de 24 horas, el alcance fue 12\.000\. Un corte posterior no puede quedar por debajo/
      )
    ).toBeVisible()
    await expect(
      seccion(page, "Cifras del panel").getByRole("textbox", {
        name: "Alcance",
        exact: true,
      })
    ).toHaveAttribute("aria-invalid", "true")
    expect(
      (await leerAsignacionE2E(asignacionId)).metricas.map((m) => m.corte)
    ).toEqual(["H24"])
    await esperarSinDesbordeHorizontal(page)

    // Corregido, se registra; era el último corte con la evidencia validada.
    await escribirCifras(page, { Alcance: "16.800" })
    await enviar.click()
    await expect(page).toHaveURL(
      (direccion) => direccion.pathname === `/mis-campanas/${asignacionId}`
    )
    await expect(
      page.getByText(
        "¡Listo! Cargaste todas las métricas. El equipo AMO las verificará."
      )
    ).toBeVisible()
    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.estado).toBe("METRICAS_CARGADAS")
    expect(asignacion.metricas.map((m) => m.corte).sort()).toEqual([
      "H24",
      "H72",
    ])
  })

  test("un corte que aún no se cumple espera su hora con la cuenta regresiva", async ({
    page,
  }) => {
    const { asignacionId } = await asignacionConEvidencia({
      cortes: ["H24", "H72"],
      haceHoras: 25,
    })
    await ingresarComoMedio(page, {
      destino: rutaMetricas(asignacionId, "H72"),
    })
    await expect(
      page.getByText("Las métricas de 72 horas aún no están listas")
    ).toBeVisible()
    await expect(page.getByText(/Se habilita en /)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Enviar métricas" })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("el corte personalizado queda aparte y no reemplaza los requeridos", async ({
    page,
  }) => {
    const { asignacionId } = await asignacionConEvidencia({
      cortes: ["H24"],
      haceHoras: 25,
    })
    await ingresarComoMedio(page, {
      destino: rutaMetricas(asignacionId, "PERSONALIZADO"),
    })
    await expect(
      page.getByRole("heading", { name: "Periodo que reportas" })
    ).toBeVisible()
    await escribirCifras(page, {
      Alcance: "9.000",
      Impresiones: "13.000",
      "Me gusta": "400",
      Comentarios: "20",
      Guardados: "15",
      Compartidos: "10",
    })
    await elegirCaptura(page)
    await page.getByRole("button", { name: "Enviar métricas" }).click()
    await expect(page).toHaveURL(
      (direccion) => direccion.pathname === `/mis-campanas/${asignacionId}`
    )
    await expect(
      page.getByText("Enviaste las métricas del periodo personalizado.")
    ).toBeVisible()

    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.metricas.map((m) => m.corte)).toEqual(["PERSONALIZADO"])
    // El corte de 24 h sigue pendiente: la asignación no pasa a METRICAS_CARGADAS.
    expect(asignacion.estado).toBe("EVIDENCIA_VALIDADA")
  })

  test("una métrica aprobada ya no se edita", async ({ page }) => {
    const { asignacionId } = await prepararAsignacionE2E({
      hasta: "METRICAS_CARGADAS",
    })
    await aprobarMetricaE2E({ asignacionId })

    await ingresarComoMedio(page, {
      destino: rutaMetricas(asignacionId, "H24"),
    })
    await expect(
      page.getByText("Las métricas de 24 horas fueron aprobadas")
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Enviar/ })).toHaveCount(0)
    await expect(
      page.getByRole("region", { name: "Métricas de 24 horas" })
    ).toContainText("Aprobada")
    await esperarSinDesbordeHorizontal(page)
  })
})
