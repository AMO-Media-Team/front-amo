import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type {
  CuentaExpediente,
  DocumentoExpediente,
  ExpedienteMedio,
} from "../tipos"

const acciones = vi.hoisted(() => ({
  verificarMedio: vi.fn(),
  rechazarMedio: vi.fn(),
  cambiarNivelMedio: vi.fn(),
  aprobarDocumento: vi.fn(),
  rechazarDocumento: vi.fn(),
  firmarDocumento: vi.fn(),
  registrarVideollamada: vi.fn(),
  aprobarVerificacionCuenta: vi.fn(),
  rechazarVerificacionCuenta: vi.fn(),
  comprobarCodigoHistoria: vi.fn(),
  firmarCaptura: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { ExpedienteVerificacion } from "./expediente-verificacion"

const HOY = "2026-10-22"
const MEDIO_ID = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

let secuencia = 0
function documento(
  tipo: DocumentoExpediente["tipo"],
  estado: DocumentoExpediente["estado"],
  extra: Partial<DocumentoExpediente> = {}
): DocumentoExpediente {
  secuencia += 1
  return {
    id: `0192f3a4-5b6c-7d8e-9f01-${String(secuencia).padStart(12, "0")}`,
    tipo,
    estado,
    metodo: "ARCHIVO",
    venceAt: null,
    subidoAt: new Date(Date.UTC(2026, 9, 1) + secuencia * 60_000).toISOString(),
    observaciones: null,
    validadoAt: null,
    mime: "application/pdf",
    ...extra,
  }
}

const CUENTA_VIGENTE: CuentaExpediente = {
  id: "0192f3a4-5b6c-7d8e-9f01-000000000301",
  plataforma: "INSTAGRAM",
  handle: "radio.pasto",
  url: "https://www.instagram.com/radio.pasto",
  seguidoresVerificados: 45_000,
  ultimaVerificacionAt: "2026-09-01T15:00:00.000Z",
  verificada: true,
  vigencia: "vigente",
  venceAt: "2027-03-01T15:00:00.000Z",
  franja: "F1",
  pendiente: null,
}

const NIVELES: ExpedienteMedio["niveles"] = [
  {
    nivel: 1,
    nombre: "Persona natural informal",
    documentosRequeridos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
    tope: 30_000_000,
  },
  {
    nivel: 2,
    nombre: "Persona natural con RUT",
    documentosRequeridos: [
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
    ],
    tope: 120_000_000,
  },
]

function expediente(
  cambios: Omit<Partial<ExpedienteMedio>, "medio"> & {
    medio?: Partial<ExpedienteMedio["medio"]>
  } = {}
): ExpedienteMedio {
  const { medio, ...resto } = cambios
  return {
    medio: {
      id: MEDIO_ID,
      nombre: "Radio Pasto",
      estado: "PENDIENTE",
      nivel: 0,
      enviadoAt: "2026-10-21T15:00:00.000Z",
      motivoEstado: null,
      ...medio,
    },
    documentos: [
      documento("CEDULA_FRENTE", "APROBADO"),
      documento("CEDULA_REVERSO", "APROBADO"),
      documento("CERT_BANCARIA", "APROBADO"),
      documento("PRUEBA_VIDA", "PENDIENTE"),
    ],
    cuentas: [CUENTA_VIGENTE],
    niveles: NIVELES,
    franjas: [],
    hoy: HOY,
    ...resto,
  }
}

function renderizar(datos = expediente()) {
  const usuario = userEvent.setup()
  render(
    <ExpedienteVerificacion
      expediente={datos}
      pago={<p>Pago protegido</p>}
      perfil={<p>Perfil declarado</p>}
    />
  )
  return usuario
}

const decision = () =>
  screen
    .getByRole("heading", { name: "Decisión" })
    .closest("section") as HTMLElement

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  acciones.verificarMedio.mockResolvedValue(exito())
  acciones.cambiarNivelMedio.mockResolvedValue(exito())
  acciones.firmarDocumento.mockResolvedValue(
    exito({ url: "https://x/firmada", vigenciaSegundos: 300 })
  )
})

describe("ExpedienteVerificacion", () => {
  it("evalúa el nivel propuesto con sus requisitos y la cuenta vigente", () => {
    renderizar()
    const panel = decision()
    expect(within(panel).getByText("Espera tu decisión")).toBeInTheDocument()
    expect(within(panel).getByRole("radio", { name: "Nivel 1" })).toBeChecked()
    expect(within(panel).getByText("4 de 5 al día")).toBeInTheDocument()
    expect(
      within(panel).getByText("Una cuenta social verificada y vigente")
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole("button", { name: "Verificar en el nivel 1" })
    ).toBeInTheDocument()
  })

  it("los documentos siguen al nivel elegido", async () => {
    const usuario = renderizar()
    const documentos = screen
      .getByRole("heading", { name: "Documentos" })
      .closest("section") as HTMLElement
    expect(
      within(documentos).queryByRole("heading", { name: "RUT" })
    ).toBeNull()

    await usuario.click(screen.getByRole("radio", { name: "Nivel 2" }))
    expect(
      within(documentos).getByRole("heading", { name: "RUT" })
    ).toBeInTheDocument()
    expect(within(decision()).getByText("4 de 6 al día")).toBeInTheDocument()
  })

  it("lo que la BD dice que falta se muestra en el diálogo, que sigue abierto", async () => {
    acciones.verificarMedio.mockResolvedValue(
      fallo("Faltan documentos aprobados y vigentes: Prueba de vida.")
    )
    const usuario = renderizar()
    await usuario.click(
      screen.getByRole("button", { name: "Verificar en el nivel 1" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Verificar Radio Pasto en el nivel 1?",
    })
    expect(dialogo).toHaveTextContent(/aún falta algún requisito/)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar" })
    )
    expect(
      await within(dialogo).findByText(
        "Faltan documentos aprobados y vigentes: Prueba de vida."
      )
    ).toBeInTheDocument()
    expect(acciones.verificarMedio).toHaveBeenCalledWith({
      medioId: MEDIO_ID,
      nivel: 1,
    })
  })

  it("un medio verificado solo cambia a otro nivel, con motivo", async () => {
    const usuario = renderizar(
      expediente({ medio: { estado: "VERIFICADO", nivel: 2 } })
    )
    // En el tope configurado propone quedarse: no se puede «cambiar» al mismo.
    expect(
      screen.getByRole("button", { name: "Elige otro nivel para cambiarlo" })
    ).toBeDisabled()
    expect(screen.queryByRole("button", { name: /^Rechazar/ })).toBeNull()

    await usuario.click(screen.getByRole("radio", { name: "Nivel 1" }))
    await usuario.click(
      screen.getByRole("button", { name: "Cambiar al nivel 1" })
    )
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo del cambio"),
      "Venció su RUT y no lo renovó."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cambiar al nivel 1" })
    )
    await waitFor(() =>
      expect(acciones.cambiarNivelMedio).toHaveBeenCalledWith({
        medioId: MEDIO_ID,
        nivel: 1,
        motivo: "Venció su RUT y no lo renovó.",
      })
    )
  })

  it("un medio rechazado espera el reenvío: no hay acciones", () => {
    renderizar(
      expediente({
        medio: {
          estado: "RECHAZADO",
          motivoEstado: "La cédula no se lee",
        },
      })
    )
    expect(
      screen.getByText(/Motivo: La cédula no se lee\./)
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Verificar/ })).toBeNull()
  })

  it("sin permiso de datos sensibles no lista documentos y no afirma nada", () => {
    renderizar(expediente({ documentos: null }))
    expect(screen.getByText("Sin acceso a los documentos")).toBeInTheDocument()
    expect(
      screen.getByText(/la plataforma los comprobará igual/)
    ).toBeInTheDocument()
  })

  it("abre la revisión del documento pendiente y ofrece la videollamada", async () => {
    const usuario = renderizar()
    expect(
      screen.getByRole("button", { name: "Registrar videollamada" })
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Revisar prueba de vida" })
    )
    expect(
      screen.getByRole("dialog", { name: "Revisar prueba de vida" })
    ).toBeInTheDocument()
  })
})
