import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { CAMPANA_DESACTUALIZADA } from "../errores"
import { reglasEdicion, reglasNuevaCampana } from "../formularios"
import type { OpcionAnuncianteGestion } from "../gestion"
import type { ModoGestion } from "../rutas-gestion"
import type { MiCampana } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  crearCampana: vi.fn(),
  editarCampana: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import {
  FormularioEditarCampana,
  FormularioNuevaCampana,
  FormularioNuevaCampanaAsistida,
} from "./formulario-campana"

const HOY = "2026-10-22"

const CAMPANA: MiCampana = {
  id: "0199f3a0-0000-7000-8000-00000000ca01",
  nombre: "Temporada navideña 2026",
  marca: "Café Sierra Alta",
  objetivo: "Dar a conocer la nueva presentación.",
  anuncianteId: "0199f3a0-0000-7000-8000-00000000a001",
  estado: "ACTIVA",
  fechaInicio: "2026-10-01",
  fechaFin: "2026-12-31",
  presupuestoTotal: 25_000_000,
  presupuestoComprometido: 1_200_000,
  disponible: 15_000_000,
  activadaAt: "2026-10-01T15:00:00Z",
  finalizadaAt: null,
  canceladaAt: null,
  creadaAt: "2026-09-28T15:00:00Z",
  actualizadaAt: "2026-10-21T15:00:00.123456+00:00",
  esDemo: false,
  gestionAsistida: false,
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

function pintarEdicion() {
  return render(
    <FormularioEditarCampana
      campana={CAMPANA}
      reglas={reglasEdicion(CAMPANA, [], HOY)}
    />
  )
}

describe("FormularioNuevaCampana", () => {
  it("valida antes de enviar y marca cada campo que falta", async () => {
    const usuario = userEvent.setup()
    render(<FormularioNuevaCampana reglas={reglasNuevaCampana(HOY)} />)

    await usuario.click(screen.getByRole("button", { name: "Crear campaña" }))

    expect(
      await screen.findByText("Escribe el nombre de la campaña.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Nombre de la campaña")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(
      screen.getByText(
        "Escribe la marca o el producto que promociona la campaña."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Elige la fecha de inicio.")).toBeInTheDocument()
    expect(screen.getByText("Elige la fecha de fin.")).toBeInTheDocument()
    expect(
      screen.getByText("Escribe el presupuesto total de la campaña.")
    ).toBeInTheDocument()
    expect(acciones.crearCampana).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/campanas"
    )
  })
})

describe("FormularioEditarCampana", () => {
  it("carga lo guardado y explica el piso del presupuesto", () => {
    pintarEdicion()
    expect(screen.getByLabelText("Nombre de la campaña")).toHaveValue(
      CAMPANA.nombre
    )
    expect(screen.getByLabelText("Presupuesto total")).toHaveValue("25.000.000")
    expect(
      screen.getByText(/No puede quedar por debajo de \$\s10\.000\.000/)
    ).toBeInTheDocument()
    expect(screen.getByText(/La campaña dura/)).toHaveTextContent(
      "La campaña dura 92 días."
    )
  })

  it("no deja bajar el presupuesto de lo comprometido", async () => {
    const usuario = userEvent.setup()
    pintarEdicion()
    const presupuesto = screen.getByLabelText("Presupuesto total")
    await usuario.clear(presupuesto)
    await usuario.type(presupuesto, "9.000.000")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(
      await screen.findByText(/^El presupuesto no puede quedar por debajo de/)
    ).toBeInTheDocument()
    expect(presupuesto).toHaveAttribute("aria-invalid", "true")
    expect(acciones.editarCampana).not.toHaveBeenCalled()
  })

  it("envía lo escrito con la versión del registro y vuelve a la ficha", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-22T15:00:00Z" })
    )
    pintarEdicion()
    const nombre = screen.getByLabelText("Nombre de la campaña")
    await usuario.clear(nombre)
    await usuario.type(nombre, "Navidad en la costa")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() => expect(acciones.editarCampana).toHaveBeenCalledTimes(1))
    expect(acciones.editarCampana.mock.calls[0][0]).toEqual({
      campanaId: CAMPANA.id,
      actualizadoAt: CAMPANA.actualizadaAt,
      nombre: "Navidad en la costa",
      marca: CAMPANA.marca,
      objetivo: CAMPANA.objetivo,
      fechaInicio: "2026-10-01",
      fechaFin: "2026-12-31",
      presupuesto: "25.000.000",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Guardamos los cambios de la campaña"
    )
    expect(enrutador.push).toHaveBeenCalledWith(`/campanas/${CAMPANA.id}`)
  })

  it("sin cambios no dice que guardó", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      exito({ actualizadoAt: CAMPANA.actualizadaAt })
    )
    pintarEdicion()
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() =>
      expect(avisos.info).toHaveBeenCalledWith("No había cambios que guardar")
    )
    expect(avisos.success).not.toHaveBeenCalled()
    expect(enrutador.push).toHaveBeenCalledWith(`/campanas/${CAMPANA.id}`)
  })

  it("un error del servidor en el presupuesto va a su campo", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      fallo("La campaña no tiene presupuesto disponible para este cambio.", {
        presupuesto: [
          "La campaña no tiene presupuesto disponible para este cambio.",
        ],
      })
    )
    pintarEdicion()
    await usuario.type(screen.getByLabelText("Marca o producto"), " Premium")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(
      await screen.findByText(
        "La campaña no tiene presupuesto disponible para este cambio."
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Presupuesto total")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(enrutador.push).not.toHaveBeenCalled()
  })

  it("si un compañero guardó antes, ofrece cargar lo vigente", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(fallo(CAMPANA_DESACTUALIZADA))
    pintarEdicion()
    await usuario.type(screen.getByLabelText("Marca o producto"), " Premium")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await usuario.click(
      await screen.findByRole("button", { name: "Cargar los datos vigentes" })
    )
    expect(enrutador.refresh).toHaveBeenCalledTimes(1)
  })
})

// ── Gestión asistida (ADM-014) ───────────────────────────────────────────────

const ANUNCIANTES: OpcionAnuncianteGestion[] = [
  {
    id: "0199f3a0-0000-7000-8000-00000000a001",
    nombre: "Café Sierra Alta",
    estado: "VERIFICADO",
  },
  {
    id: "0199f3a0-0000-7000-8000-00000000a002",
    nombre: "Jugos del Valle",
    estado: "PENDIENTE",
  },
]

const AVISO = () => screen.getByRole("note", { name: "Gestión asistida" })

describe("FormularioNuevaCampanaAsistida", () => {
  it("sin anunciante pide elegirlo y no deja crear", async () => {
    const usuario = userEvent.setup()
    render(
      <FormularioNuevaCampanaAsistida
        reglas={reglasNuevaCampana(HOY)}
        anunciantes={ANUNCIANTES}
        anuncianteInicial={null}
      />
    )
    expect(AVISO()).toHaveTextContent(
      "Elige la empresa por cuenta de la cual actúas."
    )
    await usuario.click(screen.getByRole("button", { name: "Crear campaña" }))

    expect(await screen.findByText("Elige el anunciante.")).toBeInTheDocument()
    const empresa = screen.getByRole("combobox", { name: "Empresa" })
    expect(empresa).toHaveAttribute("aria-invalid", "true")
    // Es el primer campo inválido: el foco va a él (ref del Controller).
    expect(empresa).toHaveFocus()
    expect(acciones.crearCampana).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/operacion/campanas"
    )
  })

  it("con el anunciante del enlace, el aviso lo nombra y dice hasta dónde se llega sin verificar", () => {
    render(
      <FormularioNuevaCampanaAsistida
        reglas={reglasNuevaCampana(HOY)}
        anunciantes={ANUNCIANTES}
        anuncianteInicial={ANUNCIANTES[1].id}
      />
    )
    expect(AVISO()).toHaveTextContent(
      "Estás actuando por cuenta de Jugos del Valle. Cada cambio queda en la bitácora a tu nombre. La empresa recibe un aviso cuando creas, activas o cancelas una campaña, y cuando envías, retiras o cancelas una oferta."
    )
    expect(AVISO()).toHaveTextContent(
      "Puedes preparar borradores; activar y enviar a revisión exige la empresa verificada."
    )
    expect(
      within(AVISO()).getByRole("link", { name: /Jugos del Valle/ })
    ).toHaveAttribute("href", `/operacion/anunciantes/${ANUNCIANTES[1].id}`)
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveTextContent(
      "Jugos del Valle"
    )
  })

  it("con todo lleno menos la empresa, el foco va al selector «Empresa»", async () => {
    const usuario = userEvent.setup()
    render(
      <FormularioNuevaCampanaAsistida
        reglas={reglasNuevaCampana(HOY)}
        anunciantes={ANUNCIANTES}
        anuncianteInicial={null}
      />
    )
    await usuario.type(
      screen.getByLabelText("Nombre de la campaña"),
      "Temporada navideña"
    )
    await usuario.type(screen.getByLabelText("Marca o producto"), "Café")
    await usuario.click(screen.getByRole("button", { name: "Crear campaña" }))

    expect(await screen.findByText("Elige el anunciante.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveFocus()
    expect(acciones.crearCampana).not.toHaveBeenCalled()
  })

  it("la ayuda del selector dice qué cambios se le avisan a la empresa", () => {
    render(
      <FormularioNuevaCampanaAsistida
        reglas={reglasNuevaCampana(HOY)}
        anunciantes={ANUNCIANTES}
        anuncianteInicial={null}
      />
    )
    expect(
      screen.getByText(
        "La empresa dueña de la campaña: la ve en «Mis campañas» y recibe un aviso cuando la creas, la activas o la cancelas."
      )
    ).toBeInTheDocument()
  })

  it("un anunciante del enlace que no está en la lista no se preselecciona", () => {
    render(
      <FormularioNuevaCampanaAsistida
        reglas={reglasNuevaCampana(HOY)}
        anunciantes={ANUNCIANTES}
        anuncianteInicial="0199f3a0-0000-7000-8000-00000000a0ff"
      />
    )
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveTextContent(
      "Elige el anunciante"
    )
  })
})

describe("FormularioEditarCampana · gestión asistida", () => {
  const ASISTIDO: ModoGestion = {
    modo: "asistido",
    anuncianteId: CAMPANA.anuncianteId,
    anunciante: "Café Sierra Alta",
  }

  it("habla de la empresa y vuelve a la ficha interna", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-22T15:00:00Z" })
    )
    render(
      <FormularioEditarCampana
        campana={CAMPANA}
        reglas={reglasEdicion(CAMPANA, [], HOY)}
        gestion={ASISTIDO}
      />
    )
    expect(screen.getByText(/Qué quiere lograr la empresa/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      `/operacion/campanas/${CAMPANA.id}`
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() =>
      expect(enrutador.push).toHaveBeenCalledWith(
        `/operacion/campanas/${CAMPANA.id}`
      )
    )
  })
})
