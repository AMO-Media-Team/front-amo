import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from "nuqs/adapters/testing"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { ModoGestion } from "@/features/campanas/rutas-gestion"
import { exito } from "@/lib/result"

import { FORMATO_RETIRADO, OFERTA_CAMBIO_ESTADO } from "../errores"
import {
  CAMPANA,
  CATALOGO,
  CONFIGURACION,
  IDS,
  valoresCompletos,
} from "../fixtures"
import { requisitosDeFormato } from "../formatos"
import { valoresNuevos } from "../persistencia"
import type { ValoresOferta } from "../schemas"
import type {
  CampanaAsistente,
  FormatoAsistente,
  OfertaEnCurso,
} from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  guardarOfertas: vi.fn(),
  enviarOfertasARevision: vi.fn(),
  descartarOferta: vi.fn(),
  estimarOferta: vi.fn(),
  buscarMediosExcluibles: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const territorio = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => territorio)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => enrutador,
  usePathname: () => "/campanas/x/ofertas/nueva",
}))
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
// El panel de creativos es de otro paquete: aquí solo avisa que quedó listo.
vi.mock("@/features/creativos/components/panel-creativo", () => ({
  PanelCreativo: ({
    ofertaId,
    alCambiar,
  }: {
    ofertaId: string
    alCambiar?: (estado: {
      listo: boolean
      archivos: number
      faltan: string[]
    }) => void
  }) => (
    <button
      type="button"
      onClick={() => alCambiar?.({ listo: true, archivos: 1, faltan: [] })}
    >
      Cargar creativo {ofertaId}
    </button>
  ),
}))

import { AsistenteOferta } from "./asistente-oferta"

const AHORA = new Date("2026-10-22T15:00:00Z")
/** Versiones (`updated_at`) como las devuelve PostgREST. */
const V1 = "2026-10-22T15:00:00.123456+00:00"
const V2 = "2026-10-22T15:05:00.654321+00:00"

function enCurso(
  ofertaId: string,
  formatoId: string,
  estado: OfertaEnCurso["estado"],
  actualizadaAt = V1
): OfertaEnCurso {
  return { ofertaId, formatoId, estado, actualizadaAt }
}

/** Un formato que AMO retiró después de crear la oferta. */
const CARRUSEL: FormatoAsistente = {
  id: "01a16525-06d7-7000-8000-00000000ca55",
  plataforma: "INSTAGRAM",
  clave: "CARRUSEL",
  nombre: "Carrusel",
  orden: 2,
  requisitos: requisitosDeFormato({ mime: ["image/jpeg"] }),
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
  // Solo el reloj: los temporizadores siguen siendo reales.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  territorio.listarDepartamentosActivos.mockResolvedValue(exito([]))
  territorio.listarMunicipiosActivos.mockResolvedValue(exito([]))
  acciones.estimarOferta.mockResolvedValue(
    exito([
      {
        franjaId: IDS.f1,
        mediosElegibles: 40,
        precioMediano: 350_000,
        inversionEstimada: 350_000,
        alcanceMediano: 6_000,
      },
      // Menos medios de los configurados: la BD no dice cuántos.
      {
        franjaId: IDS.f2,
        mediosElegibles: null,
        precioMediano: null,
        inversionEstimada: null,
        alcanceMediano: null,
      },
      {
        franjaId: IDS.f3,
        mediosElegibles: null,
        precioMediano: null,
        inversionEstimada: null,
        alcanceMediano: null,
      },
    ])
  )
  acciones.buscarMediosExcluibles.mockResolvedValue(exito([]))
})

function pintar({
  modo = "nueva",
  campana = CAMPANA,
  valores = valoresNuevos({
    campana: CAMPANA,
    configuracion: CONFIGURACION,
    ahora: AHORA,
  }),
  ofertas = [],
  retirados = [],
  busqueda = "",
  alActualizar,
  empresaVerificada = true,
  creativos = {},
  gestion,
}: {
  campana?: CampanaAsistente
  gestion?: ModoGestion
  retirados?: FormatoAsistente[]
  empresaVerificada?: boolean
  creativos?: Record<
    string,
    { listo: boolean; archivos: number; faltan: string[] }
  >
  modo?: "nueva" | "editar"
  valores?: ValoresOferta
  ofertas?: OfertaEnCurso[]
  busqueda?: string
  alActualizar?: OnUrlUpdateFunction
} = {}) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <NuqsTestingAdapter
        searchParams={busqueda}
        hasMemory
        onUrlUpdate={alActualizar}
      >
        <AsistenteOferta
          modo={modo}
          campana={campana}
          empresaVerificada={empresaVerificada}
          catalogo={CATALOGO}
          formatosRetirados={retirados}
          configuracion={CONFIGURACION}
          valoresIniciales={valores}
          ofertasIniciales={ofertas}
          creativosIniciales={creativos}
          ahora={AHORA.toISOString()}
          gestion={gestion}
        />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  )
}

const paso = (nombre: RegExp) => screen.getByRole("heading", { name: nombre })
const grupo = (nombre: string) => screen.getByRole("group", { name: nombre })

async function siguiente(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: /Siguiente/ }))
}

describe("AsistenteOferta · recorrido completo", () => {
  it("Reel de Instagram + Video de TikTok: crea dos borradores, quita el corte de 72 h y al enviar sin creativo lleva al paso creativo", async () => {
    const usuario = userEvent.setup()
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    acciones.guardarOfertas.mockResolvedValue(
      exito([
        enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR"),
        enCurso(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
      ])
    )
    acciones.enviarOfertasARevision.mockResolvedValue(
      exito({
        ofertas: [
          enCurso(IDS.ofertaA, IDS.igReel, "EN_REVISION", V2),
          enCurso(IDS.ofertaB, IDS.ttVideo, "BORRADOR", V2),
        ],
        enviadas: [IDS.ofertaA],
        rechazos: [
          {
            ofertaId: IDS.ofertaB,
            paso: "creativo",
            mensaje: "Carga el paquete creativo con al menos un archivo.",
          },
        ],
      })
    )
    pintar({ alActualizar })

    // Paso 1: cada plataforma ofrece solo sus formatos.
    expect(paso(/Paso 1 de 6: Qué se publica/)).toBeVisible()
    const tiktok = within(grupo("TikTok"))
    expect(tiktok.queryByRole("checkbox", { name: "Historia" })).toBeNull()
    expect(
      within(grupo("Instagram")).getByRole("checkbox", { name: "Historia" })
    ).toBeInTheDocument()
    await usuario.click(
      within(grupo("Instagram")).getByRole("checkbox", { name: "Reel" })
    )
    await usuario.click(tiktok.getByRole("checkbox", { name: "Video" }))
    await usuario.type(
      screen.getByRole("textbox", { name: "Título de la oferta" }),
      "Lanzamiento de jugos"
    )
    await siguiente(usuario)

    // Paso 2: el mínimo efectivo nunca baja del umbral.
    await waitFor(() =>
      expect(paso(/Paso 2 de 6: A quién le llega/)).toHaveFocus()
    )
    await usuario.type(screen.getByLabelText(/Mínimo de seguidores/), "20000")
    expect(
      screen.getByText("Mínimo efectivo: 30.000 seguidores")
    ).toBeInTheDocument()
    // Las franjas con menos de 5 medios no dicen cuántos: «al menos».
    await waitFor(() =>
      expect(screen.getAllByText("Al menos 40 medios elegibles")).toHaveLength(
        2
      )
    )
    await siguiente(usuario)

    // Paso 3: los cortes de la configuración, quitando el de 72 h.
    await waitFor(() => expect(paso(/Paso 3 de 6: Cuándo/)).toHaveFocus())
    const setentaYDos = screen.getByRole("checkbox", { name: "72 horas" })
    expect(setentaYDos).toBeChecked()
    await usuario.click(setentaYDos)
    await siguiente(usuario)

    // Paso 4: presupuesto y cupos por formato, con el estimador.
    await waitFor(() => expect(paso(/Paso 4 de 6: Cuánto/)).toHaveFocus())
    for (const nombre of ["Reel · Instagram", "Video · TikTok"]) {
      const tarjeta = within(screen.getByRole("region", { name: nombre }))
      await usuario.type(
        tarjeta.getByLabelText("Presupuesto máximo"),
        "3000000"
      )
      await usuario.type(
        tarjeta.getByRole("textbox", {
          name: "Cupos en la franja 30.000 – 60.000",
        }),
        "5"
      )
      await waitFor(() =>
        expect(tarjeta.getAllByText("Sin estimación").length).toBeGreaterThan(0)
      )
      expect(tarjeta.getAllByText("Menos de 5")).toHaveLength(2)
    }
    await siguiente(usuario)

    // Al salir del paso 4 se crean los borradores (uno por formato).
    await waitFor(() =>
      expect(paso(/Paso 5 de 6: Paquete creativo/)).toHaveFocus()
    )
    expect(acciones.guardarOfertas).toHaveBeenCalledTimes(1)
    const [entrada] = acciones.guardarOfertas.mock.calls[0]
    expect(entrada.campanaId).toBe(CAMPANA.id)
    expect(entrada.existentes).toEqual([])
    expect(entrada.valores.que.formatoIds).toEqual([IDS.igReel, IDS.ttVideo])
    expect(entrada.valores.cuando.cortes).toEqual(["H24", "D7"])
    expect(entrada.valores.quien.seguidoresMinimos).toBe("20000")
    expect(
      entrada.valores.cuanto.formatos.map(
        (f: { presupuestoMaximo: string }) => f.presupuestoMaximo
      )
    ).toEqual(["3000000", "3000000"])
    await waitFor(() => {
      const url = alActualizar.mock.lastCall?.[0].searchParams
      expect(url?.get("ofertas")).toBe(`${IDS.ofertaA},${IDS.ofertaB}`)
      expect(url?.get("paso")).toBe("creativo")
    })
    expect(screen.getByRole("tab", { name: /Reel · Instagram/ })).toBeVisible()
    await siguiente(usuario)

    // Paso 6: resumen con los cortes elegidos.
    await waitFor(() =>
      expect(paso(/Paso 6 de 6: Revisión y envío/)).toHaveFocus()
    )
    const cuando = within(screen.getByRole("region", { name: "Cuándo" }))
    expect(cuando.getByText("24 horas y 7 días")).toBeInTheDocument()
    expect(
      screen.getByText("Etiqueta de publicidad: siempre obligatoria")
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )

    // La BD dice qué falta: el asistente lleva al paso con el mensaje.
    await waitFor(() =>
      expect(paso(/Paso 5 de 6: Paquete creativo/)).toBeVisible()
    )
    expect(acciones.enviarOfertasARevision).toHaveBeenCalledWith(
      expect.objectContaining({
        existentes: [
          { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
          { formatoId: IDS.ttVideo, ofertaId: IDS.ofertaB, actualizadaAt: V1 },
        ],
      })
    )
    const alerta = screen.getByRole("alert")
    // Un solo anuncio: la alerta del paso (no se repite en una región de estado).
    for (const region of screen.queryAllByRole("status")) {
      expect(region).not.toHaveTextContent("Falta completar")
    }
    expect(alerta).toHaveTextContent("Falta completar: Paquete creativo")
    expect(alerta).toHaveTextContent(
      "Video · TikTok: Carga el paquete creativo con al menos un archivo."
    )
    expect(alerta).toHaveTextContent("La otra oferta ya quedó en revisión.")
    expect(screen.getByRole("tab", { name: /Video · TikTok/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(enrutador.push).not.toHaveBeenCalled()
    // La oferta enviada ya descuenta del disponible: se vuelve a leer.
    await waitFor(() => expect(enrutador.refresh).toHaveBeenCalledTimes(1))

    // Con el paquete listo, el aviso desaparece.
    await usuario.click(
      screen.getByRole("button", { name: `Cargar creativo ${IDS.ofertaB}` })
    )
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })
})

describe("AsistenteOferta · borradores", () => {
  it("«Guardar borrador» sin lo indispensable no guarda y dice qué falta", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: /Guardar/ }))
    await waitFor(() => expect(avisos.error).toHaveBeenCalled())
    expect(acciones.guardarOfertas).not.toHaveBeenCalled()
    expect(avisos.error.mock.calls[0][1]).toEqual({
      description: "Completa lo marcado en «Qué se publica».",
    })
  })

  it("quitar un formato con borrador pide confirmación y lo descarta", async () => {
    const usuario = userEvent.setup()
    acciones.descartarOferta.mockResolvedValue(exito())
    const base = valoresCompletos()
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA},${IDS.ofertaB}`,
      valores: valoresCompletos({
        que: { formatoIds: [IDS.igReel, IDS.ttVideo] },
        cuanto: {
          formatos: [
            base.cuanto.formatos[0],
            { ...base.cuanto.formatos[0], formatoId: IDS.ttVideo },
          ],
        },
      }),
      ofertas: [
        enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR"),
        enCurso(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
      ],
    })
    const video = within(grupo("TikTok")).getByRole("checkbox", {
      name: "Video",
    })
    await usuario.click(video)
    const dialogo = await screen.findByRole("alertdialog")
    expect(dialogo).toHaveTextContent(
      "¿Descartar el borrador de Video · TikTok?"
    )
    expect(dialogo).toHaveAccessibleDescription(
      /se quita de la campaña junto con su paquete creativo/
    )
    // Hasta confirmar, sigue elegido.
    expect(video).toBeChecked()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar borrador" })
    )
    await waitFor(() =>
      expect(acciones.descartarOferta).toHaveBeenCalledWith({
        ofertaId: IDS.ofertaB,
      })
    )
    await waitFor(() => expect(video).not.toBeChecked())
    expect(avisos.success).toHaveBeenCalledWith("Borrador descartado")
  })

  it("una oferta ya enviada no se quita desde el asistente", () => {
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA}`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "EN_REVISION")],
    })
    const reel = within(grupo("Instagram")).getByRole("checkbox", {
      name: "Reel",
    })
    expect(reel).toBeChecked()
    expect(reel).toHaveAttribute("aria-disabled", "true")
  })
})

describe("AsistenteOferta · editar", () => {
  it("el formato es fijo y todos los pasos de datos vienen completos", async () => {
    const usuario = userEvent.setup()
    pintar({
      modo: "editar",
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA")],
    })
    expect(screen.getByText("Formato: Reel · Instagram")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: "Historia" })).toBeNull()
    expect(
      screen.getByRole("button", { name: /Guardar cambios/ })
    ).toBeInTheDocument()
    // Del primero se puede saltar al paquete creativo desde el indicador.
    const pasos = within(screen.getByRole("list", { name: "Pasos" }))
    await usuario.click(pasos.getByRole("button", { name: /Paquete creativo/ }))
    await waitFor(() =>
      expect(paso(/Paso 5 de 6: Paquete creativo/)).toHaveFocus()
    )
  })
})

describe("AsistenteOferta · revisión", () => {
  it("con la empresa sin verificar lo explica antes de enviar", () => {
    pintar({
      empresaVerificada: false,
      busqueda: `?ofertas=${IDS.ofertaA}&paso=envio`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
      creativos: { [IDS.ofertaA]: { listo: true, archivos: 1, faltan: [] } },
    })
    expect(paso(/Paso 6 de 6: Revisión y envío/)).toBeVisible()
    expect(
      screen.getByText("Tu empresa aún no está verificada")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver el estado de mi empresa" })
    ).toHaveAttribute("href", "/empresa")
    expect(
      screen.getByText("Paquete creativo listo (1 archivo)")
    ).toBeInTheDocument()
  })

  it("sin paquete creativo la URL no abre la revisión: queda en el paso creativo", () => {
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA}&paso=envio`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    expect(paso(/Paso 5 de 6: Paquete creativo/)).toBeVisible()
  })
})

describe("AsistenteOferta · estado compartido con el equipo", () => {
  it("si la oferta cambió de estado mientras se editaba, no dice «Cambios guardados»", async () => {
    const usuario = userEvent.setup()
    // Un compañero la reenvió a revisión: el servidor no la tocó.
    acciones.guardarOfertas.mockResolvedValue(
      exito([enCurso(IDS.ofertaA, IDS.igReel, "EN_REVISION", V2)])
    )
    pintar({
      modo: "editar",
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA")],
    })
    await usuario.click(screen.getByRole("button", { name: /Guardar cambios/ }))
    await waitFor(() =>
      expect(avisos.error).toHaveBeenCalledWith(
        "Esta oferta ya no se puede editar",
        { description: OFERTA_CAMBIO_ESTADO }
      )
    )
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("si al enviar resulta que otra persona la cambió de estado, no anuncia éxito ni sale", async () => {
    const usuario = userEvent.setup()
    acciones.enviarOfertasARevision.mockResolvedValue(
      exito({
        ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "CANCELADA", V2)],
        enviadas: [],
        rechazos: [],
      })
    )
    pintar({
      modo: "editar",
      busqueda: "?paso=envio",
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA")],
      creativos: { [IDS.ofertaA]: { listo: true, archivos: 1, faltan: [] } },
    })
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos enviar a revisión")
    expect(alerta).toHaveTextContent(OFERTA_CAMBIO_ESTADO)
    expect(avisos.success).not.toHaveBeenCalled()
    expect(enrutador.push).not.toHaveBeenCalled()
  })

  it("lo escrito mientras se guarda sigue pendiente (y se guarda después, con la versión nueva)", async () => {
    const usuario = userEvent.setup()
    let responder: (valor: unknown) => void = () => {}
    acciones.guardarOfertas.mockImplementationOnce(
      () => new Promise((resolver) => (responder = resolver))
    )
    acciones.guardarOfertas.mockResolvedValue(
      exito([enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA", V2)])
    )
    pintar({
      modo: "editar",
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA")],
    })
    await usuario.click(screen.getByRole("button", { name: /Guardar cambios/ }))
    await waitFor(() =>
      expect(acciones.guardarOfertas).toHaveBeenCalledTimes(1)
    )
    // Mientras tanto se sigue escribiendo.
    await usuario.type(
      screen.getByRole("textbox", { name: "Título de la oferta" }),
      " ya"
    )
    responder(exito([enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA", V2)]))
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith("Cambios guardados")
    )
    expect(acciones.guardarOfertas.mock.calls[0][0].valores.que.titulo).toBe(
      "Lanzamiento de la nueva línea"
    )

    // Al salir de «Cuánto» se guarda lo pendiente (antes se daba por guardado).
    const pasos = within(screen.getByRole("list", { name: "Pasos" }))
    await usuario.click(pasos.getByRole("button", { name: /Cuánto/ }))
    await waitFor(() => expect(paso(/Paso 4 de 6: Cuánto/)).toHaveFocus())
    await siguiente(usuario)
    await waitFor(() =>
      expect(acciones.guardarOfertas).toHaveBeenCalledTimes(2)
    )
    const [segunda] = acciones.guardarOfertas.mock.calls[1]
    expect(segunda.valores.que.titulo).toBe("Lanzamiento de la nueva línea ya")
    expect(segunda.existentes).toEqual([
      { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V2 },
    ])
  })

  it("si se pierde la respuesta al crear, el reintento pide adoptar lo creado en vez de duplicarlo", async () => {
    const usuario = userEvent.setup()
    acciones.guardarOfertas.mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    )
    acciones.guardarOfertas.mockResolvedValue(
      exito([enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")])
    )
    pintar({ valores: valoresCompletos() })
    const guardar = () =>
      usuario.click(screen.getByRole("button", { name: /Guardar borrador/ }))

    await guardar()
    await waitFor(() => expect(avisos.error).toHaveBeenCalled())
    expect(acciones.guardarOfertas.mock.calls[0][0]).not.toHaveProperty(
      "segundosDesdeFallo"
    )

    await guardar()
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith("Borrador guardado")
    )
    const [reintento] = acciones.guardarOfertas.mock.calls[1]
    expect(reintento.existentes).toEqual([])
    expect(reintento.segundosDesdeFallo).toEqual(expect.any(Number))
    expect(reintento.segundosDesdeFallo).toBeGreaterThanOrEqual(0)

    // Con respuesta, el asistente ya conoce sus borradores.
    await guardar()
    await waitFor(() =>
      expect(acciones.guardarOfertas).toHaveBeenCalledTimes(3)
    )
    const [tercero] = acciones.guardarOfertas.mock.calls[2]
    expect(tercero).not.toHaveProperty("segundosDesdeFallo")
    expect(tercero.existentes).toEqual([
      { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
    ])
  })

  it("con borradores en curso y la URL sin ?ofertas= (tras «Atrás»), la vuelve a escribir", async () => {
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    const base = valoresCompletos()
    pintar({
      busqueda: "?paso=cuanto",
      alActualizar,
      valores: valoresCompletos({
        que: { formatoIds: [IDS.igReel, IDS.ttVideo] },
        cuanto: {
          formatos: [
            base.cuanto.formatos[0],
            { ...base.cuanto.formatos[0], formatoId: IDS.ttVideo },
          ],
        },
      }),
      ofertas: [
        enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR"),
        enCurso(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
      ],
    })
    await waitFor(() => {
      const evento = alActualizar.mock.lastCall?.[0]
      expect(evento?.searchParams.get("ofertas")).toBe(
        `${IDS.ofertaA},${IDS.ofertaB}`
      )
      expect(evento?.searchParams.get("paso")).toBe("cuanto")
      // Sin otra entrada en el historial.
      expect(evento?.options.history).toBe("replace")
    })
  })
})

describe("AsistenteOferta · formatos retirados", () => {
  it("editar: explica cómo seguir y lleva a la ficha; al avanzar lo anuncia", async () => {
    const usuario = userEvent.setup()
    const base = valoresCompletos()
    pintar({
      modo: "editar",
      retirados: [CARRUSEL],
      valores: valoresCompletos({
        que: { formatoIds: [CARRUSEL.id] },
        cuanto: {
          formatos: [{ ...base.cuanto.formatos[0], formatoId: CARRUSEL.id }],
        },
      }),
      ofertas: [enCurso(IDS.ofertaA, CARRUSEL.id, "DEVUELTA")],
    })
    expect(
      screen.getByText("Formato: Carrusel · Instagram (ya no disponible)")
    ).toBeInTheDocument()
    expect(screen.getByText(FORMATO_RETIRADO)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ir a la ficha de la oferta" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA.id}/ofertas/${IDS.ofertaA}`)
    await siguiente(usuario)
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(FORMATO_RETIRADO)
    )
  })

  it("nueva: el borrador de un formato retirado se descarta desde su aviso", async () => {
    const usuario = userEvent.setup()
    acciones.descartarOferta.mockResolvedValue(exito())
    const base = valoresCompletos()
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA},${IDS.ofertaB}`,
      retirados: [CARRUSEL],
      valores: valoresCompletos({
        que: { formatoIds: [CARRUSEL.id, IDS.ttVideo] },
        cuanto: {
          formatos: [
            { ...base.cuanto.formatos[0], formatoId: CARRUSEL.id },
            { ...base.cuanto.formatos[0], formatoId: IDS.ttVideo },
          ],
        },
      }),
      ofertas: [
        enCurso(IDS.ofertaA, CARRUSEL.id, "BORRADOR"),
        enCurso(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
      ],
    })
    const aviso = within(
      screen.getByRole("region", {
        name: "Formatos que ya no están disponibles",
      })
    )
    await usuario.click(
      aviso.getByRole("button", {
        name: "Descartar el borrador de Carrusel · Instagram",
      })
    )
    const dialogo = await screen.findByRole("alertdialog")
    expect(dialogo).toHaveTextContent(
      "¿Descartar el borrador de Carrusel · Instagram?"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar borrador" })
    )
    await waitFor(() =>
      expect(acciones.descartarOferta).toHaveBeenCalledWith({
        ofertaId: IDS.ofertaA,
      })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Formatos que ya no están disponibles",
        })
      ).toBeNull()
    )
    // Su botón ya no existe: el foco queda en el grupo «Formatos».
    await waitFor(() =>
      expect(document.getElementById("asistente-formatos")).toContainElement(
        document.activeElement as HTMLElement
      )
    )
  })
})

describe("AsistenteOferta · accesibilidad y avisos", () => {
  it("el error de «Formatos» se anuncia con cada casilla y el de los cortes, con los suyos", async () => {
    const usuario = userEvent.setup()
    pintar()
    await siguiente(usuario)
    await waitFor(() =>
      expect(
        within(grupo("Instagram")).getByRole("checkbox", {
          name: "Post de feed",
        })
      ).toHaveAccessibleDescription(/Elige al menos un formato\./)
    )

    const valores = valoresCompletos()
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA}&paso=cuando`,
      valores,
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    for (const nombre of ["24 horas", "72 horas", "7 días"]) {
      await usuario.click(screen.getAllByRole("checkbox", { name: nombre })[0])
    }
    await waitFor(() =>
      expect(
        screen.getAllByRole("checkbox", { name: "24 horas" })[0]
      ).toHaveAccessibleDescription(/Exige al menos un corte de métricas\./)
    )
  })

  it("el exceso sobre lo disponible se anuncia junto con la suma", () => {
    const base = valoresCompletos()
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA}&paso=cuanto`,
      valores: valoresCompletos({
        cuanto: {
          formatos: [
            { ...base.cuanto.formatos[0], presupuestoMaximo: "25.000.000" },
          ],
        },
      }),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    const exceso = screen.getByText(
      "Supera lo disponible: baja algún presupuesto."
    )
    const region = exceso.closest("[aria-live]")
    expect(region).not.toBeNull()
    expect(region).toHaveTextContent(/25\.000\.000/)
  })

  it("avisa si el precio mediano supera el tope por medio y explica por qué no hay cifras", async () => {
    pintar({
      // $2.000.000 con tope del 15 %: ningún medio pasa de $300.000.
      campana: { ...CAMPANA, presupuestoTotal: 2_000_000 },
      busqueda: `?ofertas=${IDS.ofertaA}&paso=cuanto`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    expect(
      await screen.findByText(
        /^En la franja 30\.000 – 60\.000 el precio mediano .* supera el tope por medio/
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /excluir menos de 5 medios de una franja no cambia la estimación/
      )
    ).toBeInTheDocument()
  })

  it("el mínimo de seguidores dice con cuánto se estima (múltiplos de 5.000)", async () => {
    const usuario = userEvent.setup()
    pintar({
      busqueda: `?ofertas=${IDS.ofertaA}&paso=quien`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    await usuario.type(screen.getByLabelText(/Mínimo de seguidores/), "47300")
    expect(screen.getByText(/Para estimar se usa 45\.000/)).toBeInTheDocument()
  })
})

describe("AsistenteOferta · gestión asistida (ADM-014)", () => {
  const ASISTIDO: ModoGestion = {
    modo: "asistido",
    anuncianteId: CAMPANA.anuncianteId,
    anunciante: "Jugos del Valle",
  }

  it("con la empresa sin verificar lo dice de ella y enlaza a su ficha interna", () => {
    pintar({
      gestion: ASISTIDO,
      empresaVerificada: false,
      busqueda: `?ofertas=${IDS.ofertaA}&paso=envio`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
      creativos: { [IDS.ofertaA]: { listo: true, archivos: 1, faltan: [] } },
    })
    expect(
      screen.getByText("La empresa aún no está verificada")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver la ficha del anunciante" })
    ).toHaveAttribute("href", `/operacion/anunciantes/${CAMPANA.anuncianteId}`)
    expect(screen.queryByText(/tu empresa/i)).not.toBeInTheDocument()
  })

  it("«Cuándo» no le habla al anunciante («tu sector»)", () => {
    pintar({
      gestion: ASISTIDO,
      busqueda: `?ofertas=${IDS.ofertaA}&paso=cuando`,
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "BORRADOR")],
    })
    expect(
      screen.getByText(/no publica para otras marcas del mismo sector/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/tu sector/)).not.toBeInTheDocument()
  })

  it("enviada, va a la ficha interna de la oferta y dice que queda en la cola de moderación", async () => {
    const usuario = userEvent.setup()
    acciones.enviarOfertasARevision.mockResolvedValue(
      exito({
        ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "EN_REVISION", V2)],
        enviadas: [IDS.ofertaA],
        rechazos: [],
      })
    )
    pintar({
      gestion: ASISTIDO,
      modo: "editar",
      busqueda: "?paso=envio",
      valores: valoresCompletos(),
      ofertas: [enCurso(IDS.ofertaA, IDS.igReel, "DEVUELTA")],
      creativos: { [IDS.ofertaA]: { listo: true, archivos: 1, faltan: [] } },
    })
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    await waitFor(() =>
      expect(enrutador.push).toHaveBeenCalledWith(
        `/operacion/ofertas/${IDS.ofertaA}`
      )
    )
    expect(avisos.success).toHaveBeenCalledWith("Oferta enviada a revisión", {
      description:
        "Queda en la cola de moderación; Jugos del Valle recibe un aviso.",
    })
  })
})
