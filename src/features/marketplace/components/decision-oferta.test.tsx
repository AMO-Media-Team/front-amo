import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatearCOP } from "@/lib/format"

/** Testing Library normaliza los espacios del DOM (el de `$ 1.000` es duro). */
function cop(valor: number): string {
  return formatearCOP(valor).replace(/\s/g, " ")
}

import { interpretarErrorAceptar } from "../errores"
import { type ConsumoTopeMedio, disponibilidadAceptar } from "../presentacion"
import type {
  AsignacionEnOferta,
  CuentaCotizada,
  DetalleOfertaMedio,
} from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  aceptarOferta: vi.fn(),
  rechazarOferta: vi.fn(),
  registrarVistaOferta: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { DecisionOferta, ID_ESTADO_OFERTA } from "./decision-oferta"

const AHORA = new Date("2026-10-23T15:00:00.000Z")
const OFERTA = "01a16693-730a-7983-9254-666751ffcd3b"
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const CUENTA_A: CuentaCotizada = {
  cuentaSocialId: "01a16693-9006-7dcb-9c94-afaf8092c0d9",
  handle: "medio.e2e.amo",
  franjaClave: "F1",
  cuposRestantes: 4,
  cotizacion: {
    franjaClave: "F1",
    seguidores: 40_000,
    publicaciones: 1,
    multiplicadorCalidad: 1,
    multiplicadorGeografico: 1.05,
    multiplicadorExclusividad: 1,
    montoMedio: 96_000,
    desglose: {
      tarifaBase: 120_000,
      montoBruto: 120_000,
      porcentajeComision: 0.2,
      montoComision: 24_000,
    },
  },
  aviso: null,
  superaTopeCampana: false,
}

const CUENTA_B: CuentaCotizada = {
  ...CUENTA_A,
  cuentaSocialId: "01a16693-9006-7dcb-9c94-afaf8092c0e1",
  handle: "otra.cuenta",
  franjaClave: "F2",
  cuposRestantes: 1,
  cotizacion: {
    ...(CUENTA_A.cotizacion as NonNullable<CuentaCotizada["cotizacion"]>),
    franjaClave: "F2",
    seguidores: 80_000,
    montoMedio: 150_000,
    desglose: null,
  },
}

const PREVIA: AsignacionEnOferta = {
  id: "asig-previa",
  estado: "CONTENIDO_ENTREGADO",
  handle: "medio.e2e.amo",
  aceptadaAt: "2026-10-22T15:00:00.000Z",
  montoMedio: 96_000,
}

function detalle(
  cambios: Partial<DetalleOfertaMedio> = {}
): DetalleOfertaMedio {
  return {
    id: OFERTA,
    titulo: "Historia de Instagram · Convocatoria abierta",
    formato: "Historia",
    plataforma: "INSTAGRAM",
    publicacionesPorMedio: 1,
    permiteMultiplesCupos: false,
    ventanaInicio: "2026-10-24T05:00:00.000Z",
    ventanaFin: "2026-11-05T05:00:00.000Z",
    fechaLimiteAceptacion: "2026-10-25T22:00:00.000Z",
    permanenciaDias: 7,
    exclusividadDias: null,
    cortes: ["H24"],
    marca: "Supermercados La Cosecha",
    anunciante: "La Cosecha SAS",
    estado: "PUBLICADA",
    instrucciones: null,
    restricciones: null,
    cuentas: [CUENTA_A],
    asignaciones: [],
    chocaExclusividad: false,
    ...cambios,
  }
}

function renderizar({
  oferta = detalle(),
  consumo = null,
  puedeAceptar = true,
}: {
  oferta?: DetalleOfertaMedio
  consumo?: ConsumoTopeMedio | null
  puedeAceptar?: boolean
} = {}) {
  const usuario = userEvent.setup()
  render(
    <DecisionOferta
      oferta={oferta}
      disponibilidad={disponibilidadAceptar(oferta, AHORA)}
      consumo={consumo}
      puedeAceptar={puedeAceptar}
    >
      <p>Secciones del detalle</p>
    </DecisionOferta>
  )
  return usuario
}

function pie() {
  return within(
    screen.getByRole("region", { name: "Decisión sobre la oferta" })
  )
}

async function abrirYConfirmar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(pie().getByRole("button", { name: "Aceptar" }))
  const dialogo = await screen.findByRole("alertdialog")
  await usuario.click(
    within(dialogo).getByRole("button", { name: /Sí, acepto|Reintentar/ })
  )
  return dialogo
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("DecisionOferta · pago por cuenta", () => {
  it("con varias cuentas elige la que más paga y el pie dice cuánto recibe", async () => {
    const usuario = renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, CUENTA_B] }),
    })

    expect(
      screen.getByRole("heading", { name: "¿Con qué cuenta publicas?" })
    ).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /@otra\.cuenta/ })).toBeChecked()
    expect(pie().getByText(cop(150_000))).toBeInTheDocument()
    expect(pie().getByText("con @otra.cuenta")).toBeInTheDocument()

    await usuario.click(screen.getByRole("radio", { name: /@medio\.e2e\.amo/ }))
    expect(pie().getByText(cop(96_000))).toBeInTheDocument()
    // El desglose (comisión visible) de la cuenta elegida.
    expect(screen.getByText("Valor bruto")).toBeInTheDocument()
    expect(screen.getByText("Comisión AMO (20%)")).toBeInTheDocument()
    expect(screen.getByText("Pertinencia geográfica")).toBeInTheDocument()
  })

  it("una cuenta sin cupo se muestra pero no se elige", () => {
    renderizar({
      oferta: detalle({
        cuentas: [CUENTA_A, { ...CUENTA_B, cuposRestantes: 0 }],
      }),
    })
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(
      screen.getByRole("list", {
        name: "Cuentas que no puedes usar en esta oferta",
      })
    ).toHaveTextContent("Sin cupos en tu franja")
    expect(
      screen.getByRole("heading", { name: "Lo que recibes" })
    ).toBeVisible()
  })

  it("avisa «Cerca del tope» con el camino para subir de nivel", () => {
    renderizar({
      consumo: {
        consumido: 7_950_000,
        tope: 10_000_000,
        alerta: 0.8,
        bloqueo: 0.95,
      },
    })
    expect(screen.getByText("Cerca del tope")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Cómo subir de nivel" })
    ).toHaveAttribute("href", "/mi-medio/nivel")
  })
})

describe("DecisionOferta · aceptar (MED-010)", () => {
  it("acepta con la clave del intento y lleva a la asignación", async () => {
    acciones.aceptarOferta.mockResolvedValue({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: 96_000 },
    })
    const usuario = renderizar()

    const dialogo = await (async () => {
      await usuario.click(pie().getByRole("button", { name: "Aceptar" }))
      return screen.findByRole("alertdialog")
    })()
    expect(dialogo).toHaveTextContent("@medio.e2e.amo")
    expect(dialogo).toHaveTextContent(cop(96_000))
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, acepto" })
    )

    await waitFor(() =>
      expect(enrutador.push).toHaveBeenCalledWith("/mis-campanas/asig-1")
    )
    expect(acciones.aceptarOferta).toHaveBeenCalledWith({
      ofertaId: OFERTA,
      cuentaSocialId: CUENTA_A.cuentaSocialId,
      claveIdempotencia: expect.stringMatching(UUID_V4),
    })
    expect(avisos.success).toHaveBeenCalledWith("¡Aceptaste la oferta!", {
      description: expect.stringMatching(
        /^Descarga el contenido y publícalo antes del /
      ),
    })
  })

  it("si el pago congelado no es el que vio, el aviso lo dice con el monto real", async () => {
    acciones.aceptarOferta.mockResolvedValue({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: 90_000 },
    })
    const usuario = renderizar()

    await abrirYConfirmar(usuario)

    await waitFor(() =>
      expect(enrutador.push).toHaveBeenCalledWith("/mis-campanas/asig-1")
    )
    expect(avisos.success).toHaveBeenCalledWith("¡Aceptaste la oferta!", {
      description: expect.stringContaining(
        `Tu pago quedó congelado en ${formatearCOP(90_000)}, no en ${formatearCOP(96_000)}`
      ),
      duration: 15_000,
    })
  })

  it("un doble toque no cambia la clave: a lo sumo repite la misma solicitud", async () => {
    let responder: (valor: unknown) => void = () => {}
    acciones.aceptarOferta.mockImplementation(
      () => new Promise((resolver) => (responder = resolver))
    )
    const usuario = renderizar()

    await usuario.click(pie().getByRole("button", { name: "Aceptar" }))
    const dialogo = await screen.findByRole("alertdialog")
    const confirmar = within(dialogo).getByRole("button", {
      name: "Sí, acepto",
    })
    await usuario.dblClick(confirmar)
    expect(confirmar).toBeDisabled()
    responder({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: 96_000 },
    })

    await waitFor(() =>
      expect(enrutador.push).toHaveBeenCalledWith("/mis-campanas/asig-1")
    )
    const claves = new Set(
      acciones.aceptarOferta.mock.calls.map(
        ([entrada]) => entrada.claveIdempotencia
      )
    )
    expect(claves.size).toBe(1)
  })

  it("si la respuesta no llegó, «Reintentar» usa la MISMA clave", async () => {
    acciones.aceptarOferta
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        datos: { asignacionId: "asig-1", montoMedio: 96_000 },
      })
    const usuario = renderizar()

    const dialogo = await abrirYConfirmar(usuario)
    expect(
      await within(dialogo).findByText("No pudimos confirmar tu aceptación")
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reintentar" })
    )

    await waitFor(() => expect(acciones.aceptarOferta).toHaveBeenCalledTimes(2))
    const [primera, segunda] = acciones.aceptarOferta.mock.calls.map(
      ([entrada]) => entrada.claveIdempotencia
    )
    expect(segunda).toBe(primera)
  })

  it("tras una respuesta firme el siguiente intento usa OTRA clave", async () => {
    acciones.aceptarOferta.mockResolvedValue(
      interpretarErrorAceptar({
        code: "P0001",
        message: "AMO_IDEMPOTENCIA_INVALIDA",
      })
    )
    const usuario = renderizar()

    const dialogo = await abrirYConfirmar(usuario)
    expect(
      await within(dialogo).findByText("Vuelve a intentarlo")
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, acepto" })
    )

    await waitFor(() => expect(acciones.aceptarOferta).toHaveBeenCalledTimes(2))
    const [primera, segunda] = acciones.aceptarOferta.mock.calls.map(
      ([entrada]) => entrada.claveIdempotencia
    )
    expect(segunda).not.toBe(primera)
  })

  it("sin cupo: lo explica, deja el aviso en la ficha con el foco y la actualiza", async () => {
    acciones.aceptarOferta.mockResolvedValue(
      interpretarErrorAceptar({
        code: "P0001",
        message: "AMO_SIN_CUPO",
        details: "No quedan cupos en tu franja.",
      })
    )
    const usuario = renderizar()

    const dialogo = await abrirYConfirmar(usuario)
    expect(
      await within(dialogo).findByText("No quedan cupos en tu franja")
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByRole("link", { name: "Ver otras ofertas" })
    ).toHaveAttribute("href", "/ofertas")
    expect(
      within(dialogo).queryByRole("button", { name: "Sí, acepto" })
    ).not.toBeInTheDocument()

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Entendido" })
    )

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(enrutador.refresh).toHaveBeenCalledOnce()
    const titulo = document.getElementById(ID_ESTADO_OFERTA)
    expect(titulo).toHaveTextContent("No quedan cupos en tu franja")
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(
      pie().queryByRole("button", { name: "Aceptar" })
    ).not.toBeInTheDocument()
    expect(pie().getByRole("link", { name: "Ver otras ofertas" })).toBeVisible()
  })
})

describe("DecisionOferta · tope anual del nivel (MED-007)", () => {
  /** 150.000 de la cuenta B lo supera; 96.000 de la A cabe. */
  const CERCA: ConsumoTopeMedio = {
    consumido: 9_400_000,
    tope: 10_000_000,
    alerta: 0.8,
    bloqueo: 0.95,
  }

  it("por defecto elige la cuenta que más paga entre las que caben", () => {
    renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, CUENTA_B] }),
      consumo: CERCA,
    })
    expect(
      screen.getByRole("radio", { name: /@medio\.e2e\.amo/ })
    ).toBeChecked()
    expect(
      screen.getByRole("radio", { name: /@otra\.cuenta/ })
    ).toHaveAccessibleName(/superarías el tope anual de tu nivel/)
    expect(pie().getByRole("button", { name: "Aceptar" })).toBeEnabled()
  })

  it("con la cuenta que lo supera, «Aceptar» queda deshabilitado, descrito por el aviso, y sugiere la otra", async () => {
    const usuario = renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, CUENTA_B] }),
      consumo: CERCA,
    })
    await usuario.click(screen.getByRole("radio", { name: /@otra\.cuenta/ }))

    const aceptar = pie().getByRole("button", { name: "Aceptar" })
    expect(aceptar).toHaveAttribute("aria-disabled", "true")
    expect(aceptar).toHaveAccessibleDescription(
      /Superarías el tope anual de tu nivel.*Con @medio\.e2e\.amo recibes .* y sí cabe en tu tope\./
    )
    expect(
      pie().getByText("Superarías el tope anual de tu nivel")
    ).toBeVisible()
    await usuario.click(aceptar)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()

    await usuario.click(
      screen.getByRole("button", { name: "Publicar con @medio.e2e.amo" })
    )
    expect(
      screen.getByRole("radio", { name: /@medio\.e2e\.amo/ })
    ).toBeChecked()
    const habilitado = pie().getByRole("button", { name: "Aceptar" })
    expect(habilitado).toBeEnabled()
    expect(habilitado).not.toHaveAttribute("aria-describedby")
    expect(habilitado).toHaveFocus()
  })

  it("con una sola cuenta que lo supera, no ofrece otra y lleva a subir de nivel", () => {
    renderizar({ oferta: detalle({ cuentas: [CUENTA_B] }), consumo: CERCA })
    expect(pie().getByRole("button", { name: "Aceptar" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    expect(
      screen.queryByRole("button", { name: /^Publicar con/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Cómo subir de nivel" })
    ).toHaveAttribute("href", "/mi-medio/nivel")
  })

  it("si la BD responde AMO_TOPE_NIVEL y otra cuenta cabe, no bloquea la oferta entera", async () => {
    acciones.aceptarOferta.mockResolvedValue(
      interpretarErrorAceptar({
        code: "P0001",
        message: "AMO_TOPE_NIVEL",
        details: "Estás cerca del tope anual.",
      })
    )
    // Sin el consumo (no se pudo leer): la ficha no podía anticiparlo.
    const usuario = renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, CUENTA_B] }),
    })

    const dialogo = await abrirYConfirmar(usuario)
    expect(
      await within(dialogo).findByText(
        "Con esta cuenta superarías tu tope anual"
      )
    ).toBeInTheDocument()
    expect(dialogo).toHaveTextContent(
      `Con @medio.e2e.amo recibes ${cop(96_000)} y sí cabe`
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Entendido" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )

    expect(enrutador.refresh).not.toHaveBeenCalled()
    expect(document.getElementById(ID_ESTADO_OFERTA)).toBeNull()
    // La cuenta rechazada sigue elegida, con el aviso y la otra sugerida.
    expect(screen.getByRole("radio", { name: /@otra\.cuenta/ })).toBeChecked()
    expect(screen.getByRole("radiogroup")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    )
    const aceptar = pie().getByRole("button", { name: "Aceptar" })
    expect(aceptar).toHaveAttribute("aria-disabled", "true")
    await waitFor(() => expect(aceptar).toHaveFocus())

    await usuario.click(
      screen.getByRole("button", { name: "Publicar con @medio.e2e.amo" })
    )
    expect(pie().getByRole("button", { name: "Aceptar" })).toBeEnabled()
  })

  it("si la BD responde AMO_TOPE_NIVEL y ninguna otra cuenta cabe, bloquea como antes", async () => {
    acciones.aceptarOferta.mockResolvedValue(
      interpretarErrorAceptar({ code: "P0001", message: "AMO_TOPE_NIVEL" })
    )
    const usuario = renderizar()

    const dialogo = await abrirYConfirmar(usuario)
    await usuario.click(
      await within(dialogo).findByRole("button", { name: "Entendido" })
    )

    await waitFor(() => expect(enrutador.refresh).toHaveBeenCalledOnce())
    expect(document.getElementById(ID_ESTADO_OFERTA)).toHaveTextContent(
      "Llegaste al tope anual de tu nivel"
    )
    expect(
      pie().queryByRole("button", { name: "Aceptar" })
    ).not.toBeInTheDocument()
  })
})

describe("DecisionOferta · participación máxima en la campaña (AMO_TOPE_MEDIO)", () => {
  /** La cuenta B (la que más paga) superaría la participación máxima. */
  const B_EN_TOPE: CuentaCotizada = { ...CUENTA_B, superaTopeCampana: true }
  const MOTIVO =
    "Superarías la participación máxima de un medio en esta campaña"

  it("por defecto evita la cuenta que la supera, que lo dice en su opción", () => {
    renderizar({ oferta: detalle({ cuentas: [CUENTA_A, B_EN_TOPE] }) })
    expect(
      screen.getByRole("radio", { name: /@medio\.e2e\.amo/ })
    ).toBeChecked()
    expect(
      screen.getByRole("radio", { name: /@otra\.cuenta/ })
    ).toHaveAccessibleName(/superarías la participación máxima de un medio/)
    expect(pie().getByRole("button", { name: "Aceptar" })).toBeEnabled()
  })

  it("con la cuenta que la supera, «Aceptar» queda deshabilitado y enfocable, descrito por el motivo, y sugiere la otra", async () => {
    const usuario = renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, B_EN_TOPE] }),
    })
    await usuario.click(screen.getByRole("radio", { name: /@otra\.cuenta/ }))

    const aceptar = pie().getByRole("button", { name: "Aceptar" })
    expect(aceptar).toHaveAttribute("aria-disabled", "true")
    expect(aceptar).not.toBeDisabled()
    expect(aceptar).toHaveAccessibleDescription(
      new RegExp(
        `^${MOTIVO}.*Con @medio\\.e2e\\.amo recibes .* y con ella sí puedes aceptarla\\.$`
      )
    )
    expect(pie().getByText(MOTIVO)).toBeVisible()
    // Subir de nivel no amplía la participación en la campaña.
    expect(
      screen.queryByRole("link", { name: "Cómo subir de nivel" })
    ).not.toBeInTheDocument()
    aceptar.focus()
    expect(aceptar).toHaveFocus()
    await usuario.click(aceptar)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()

    await usuario.click(
      screen.getByRole("button", { name: "Publicar con @medio.e2e.amo" })
    )
    const habilitado = pie().getByRole("button", { name: "Aceptar" })
    expect(habilitado).toBeEnabled()
    expect(habilitado).not.toHaveAttribute("aria-describedby")
    expect(habilitado).toHaveFocus()
  })

  it("no sugiere una cuenta que superaría el tope anual", () => {
    // A cabe en la campaña, pero con este consumo supera el tope anual.
    renderizar({
      oferta: detalle({ cuentas: [CUENTA_A, B_EN_TOPE] }),
      consumo: {
        consumido: 9_450_000,
        tope: 10_000_000,
        alerta: 0.8,
        bloqueo: 0.95,
      },
    })
    // Ninguna cabe: la que más paga, con su motivo y sin otra sugerida.
    expect(screen.getByRole("radio", { name: /@otra\.cuenta/ })).toBeChecked()
    expect(pie().getByRole("button", { name: "Aceptar" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    expect(pie().getByText(MOTIVO)).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /^Publicar con/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("radio", { name: /@medio\.e2e\.amo/ })
    ).toHaveAccessibleName(/superarías el tope anual de tu nivel/)
  })
})

describe("DecisionOferta · exclusividad por sector (AMO_EXCLUSIVIDAD)", () => {
  it("no ofrece «Aceptar» y lo explica como el error, con el enlace a Mis campañas", () => {
    renderizar({
      oferta: detalle({
        cuentas: [CUENTA_A, CUENTA_B],
        chocaExclusividad: true,
      }),
    })
    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent("Choca con otra campaña del mismo sector")
    expect(aviso).toHaveTextContent(
      "Esta oferta o una que ya aceptaste pide exclusividad, y en esas fechas tienes pauta de otra marca del mismo sector."
    )
    expect(
      within(aviso).getByRole("link", { name: "Ir a Mis campañas" })
    ).toHaveAttribute("href", "/mis-campanas")
    expect(
      pie().queryByRole("button", { name: "Aceptar" })
    ).not.toBeInTheDocument()
    expect(
      pie().queryByRole("button", { name: "No me interesa" })
    ).not.toBeInTheDocument()
    expect(
      pie().getByText("Choca con otra campaña del mismo sector")
    ).toBeVisible()
    expect(pie().getByRole("link", { name: "Ver otras ofertas" })).toBeVisible()
    // Lo que recibiría se sigue viendo, sin poder elegir.
    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  })
})

describe("DecisionOferta · otros estados", () => {
  it("ya aceptada: enlaza a su asignación en Mis campañas", () => {
    renderizar({ oferta: detalle({ asignaciones: [PREVIA] }) })
    expect(
      screen.getByText("Ya aceptaste esta oferta", { selector: "div" })
    ).toBeVisible()
    for (const enlace of screen.getAllByRole("link", {
      name: /Ver en Mis campañas/,
    })) {
      expect(enlace).toHaveAttribute("href", "/mis-campanas/asig-previa")
    }
    expect(
      screen.queryByRole("button", { name: "Aceptar" })
    ).not.toBeInTheDocument()
  })

  it("con un cupo previo (varios por medio) no ofrece «No me interesa»", () => {
    renderizar({
      oferta: detalle({ permiteMultiplesCupos: true, asignaciones: [PREVIA] }),
    })
    expect(screen.getByText("Ya tienes 1 cupo en esta oferta")).toBeVisible()
    expect(pie().getByRole("button", { name: "Aceptar" })).toBeEnabled()
    expect(
      pie().queryByRole("button", { name: "No me interesa" })
    ).not.toBeInTheDocument()
  })

  it("sin permiso para aceptar solo ofrece volver a las ofertas", () => {
    renderizar({ puedeAceptar: false })
    expect(pie().queryByRole("button")).not.toBeInTheDocument()
    expect(pie().getByRole("link", { name: "Ver otras ofertas" })).toBeVisible()
  })

  it("«No me interesa» abre su diálogo", async () => {
    const usuario = renderizar()
    await usuario.click(pie().getByRole("button", { name: "No me interesa" }))
    expect(
      await screen.findByRole("alertdialog", {
        name: "¿No te interesa esta oferta?",
      })
    ).toBeVisible()
  })
})
