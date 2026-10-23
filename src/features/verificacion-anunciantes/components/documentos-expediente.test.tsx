import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { DocumentoExpediente, ExpedienteAnunciante } from "../tipos"

const acciones = vi.hoisted(() => ({
  aprobarDocumentoAnunciante: vi.fn(),
  rechazarDocumentoAnunciante: vi.fn(),
  firmarDocumentoAnunciante: vi.fn(),
  prepararCargaDocumentoAnunciante: vi.fn(),
  confirmarCargaDocumentoAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)
// El motor de subida real (Storage, TUS) no se monta en jsdom.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { DocumentosExpediente } from "./documentos-expediente"

const HOY = "2026-10-22"
const EMPRESA_ID = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"
const EMPRESA = {
  nombreComercial: "Café del Sur",
  razonSocial: "Café del Sur S.A.S.",
  identificacion: "900.123.456-7",
  colombiana: true,
}

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
    venceAt: null,
    subidoAt: new Date(Date.UTC(2026, 9, 1) + secuencia * 60_000).toISOString(),
    observaciones: null,
    validadoAt: null,
    mime: "application/pdf",
    ...extra,
  }
}

function expediente(
  documentos: DocumentoExpediente[],
  identificacionCambiadaAt: string | null = null
): ExpedienteAnunciante {
  return {
    anunciante: {
      id: EMPRESA_ID,
      nombreComercial: EMPRESA.nombreComercial,
      razonSocial: EMPRESA.razonSocial,
      identificacion: EMPRESA.identificacion,
      tipoIdentificacion: "NIT",
      paisIso2: "CO",
      pais: "Colombia",
      ciudad: "Pasto",
      sector: null,
      estado: "PENDIENTE",
      motivoEstado: null,
      enviadoAt: "2026-10-21T15:00:00.000Z",
      verificadoAt: null,
      verificadoPor: null,
      identificacionCambiadaAt,
    },
    documentos,
    hoy: HOY,
  }
}

function renderizar(
  documentos: DocumentoExpediente[],
  puedeCargar = false,
  cambio: string | null = null
) {
  const usuario = userEvent.setup()
  render(
    <DocumentosExpediente
      expediente={expediente(documentos, cambio)}
      empresa={EMPRESA}
      puedeCargar={puedeCargar}
    />
  )
  return usuario
}

function fila(titulo: string): HTMLElement {
  return screen
    .getByRole("heading", { level: 3, name: titulo })
    .closest("li") as HTMLElement
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  acciones.aprobarDocumentoAnunciante.mockResolvedValue(exito())
  acciones.rechazarDocumentoAnunciante.mockResolvedValue(exito())
  acciones.firmarDocumentoAnunciante.mockResolvedValue(
    exito({ url: "https://x/firmada/rut", vigenciaSegundos: 300 })
  )
})

describe("DocumentosExpediente", () => {
  it("lista lo exigido (aunque falte) y lo adicional, con su situación", () => {
    renderizar([
      documento("RUT", "PENDIENTE"),
      documento("CERT_BANCARIA", "APROBADO"),
    ])
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((titulo) => titulo.textContent)
    ).toEqual(["RUT", "Cámara de Comercio", "Certificado bancarioAdicional"])
    expect(within(fila("RUT")).getByText("Por revisar")).toBeInTheDocument()
    expect(
      within(fila("Cámara de Comercio")).getByText(
        "La empresa aún no lo carga."
      )
    ).toBeInTheDocument()
    expect(
      within(fila("Cámara de Comercio")).getByText("Sin cargar")
    ).toBeInTheDocument()
  })

  it("muestra el motivo de un rechazo y el reemplazo que espera revisión", () => {
    renderizar([
      documento("RUT", "RECHAZADO", { observaciones: "RUT ilegible." }),
      documento("CAMARA_COMERCIO", "APROBADO"),
      documento("CAMARA_COMERCIO", "PENDIENTE"),
    ])
    expect(within(fila("RUT")).getByText("RUT ilegible.")).toBeInTheDocument()
    expect(
      within(fila("Cámara de Comercio")).getByText(
        "Cargó un reemplazo que espera revisión."
      )
    ).toBeInTheDocument()
  })

  it("«Revisar» abre la hoja con el archivo firmado y lo que hay que comprobar", async () => {
    const rut = documento("RUT", "PENDIENTE")
    const usuario = renderizar([rut])
    await usuario.click(screen.getByRole("button", { name: "Revisar RUT" }))
    const hoja = screen.getByRole("dialog", { name: "Revisar RUT" })
    expect(
      await within(hoja).findByRole("link", { name: /Abrir PDF/ })
    ).toHaveAttribute("href", "https://x/firmada/rut")
    expect(acciones.firmarDocumentoAnunciante).toHaveBeenCalledWith({
      documentoId: rut.id,
    })
    expect(
      within(hoja).getByText(
        "El NIT coincide con el registrado: 900.123.456-7."
      )
    ).toBeInTheDocument()
  })

  it("aprobar envía la vigencia del atajo y cierra la hoja", async () => {
    const rut = documento("RUT", "PENDIENTE")
    const usuario = renderizar([rut])
    await usuario.click(screen.getByRole("button", { name: "Revisar RUT" }))
    const hoja = screen.getByRole("dialog", { name: "Revisar RUT" })
    await usuario.click(within(hoja).getByRole("button", { name: "1 año" }))
    expect(within(hoja).getByLabelText(/Vigente hasta/)).toHaveValue(
      "2027-10-22"
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(acciones.aprobarDocumentoAnunciante).toHaveBeenCalledWith({
      documentoId: rut.id,
      fechaVencimiento: "2027-10-22",
      observaciones: "",
    })
  })

  it("aprobado, el foco vuelve al mismo botón de la fila, ahora «Ver»", async () => {
    const rut = documento("RUT", "PENDIENTE")
    const usuario = userEvent.setup()
    const vista = render(
      <DocumentosExpediente
        expediente={expediente([rut])}
        empresa={EMPRESA}
        puedeCargar={false}
      />
    )
    // Como la Server Action: el expediente se refresca antes de cerrar la hoja.
    acciones.aprobarDocumentoAnunciante.mockImplementation(async () => {
      vista.rerender(
        <DocumentosExpediente
          expediente={expediente([
            { ...rut, estado: "APROBADO", validadoAt: "2026-10-22T15:00:00Z" },
          ])}
          empresa={EMPRESA}
          puedeCargar={false}
        />
      )
      return exito()
    })
    const revisar = screen.getByRole("button", { name: "Revisar RUT" })
    await usuario.click(revisar)
    const hoja = screen.getByRole("dialog", { name: "Revisar RUT" })
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    const ver = screen.getByRole("button", { name: "Ver RUT" })
    expect(ver).toBe(revisar)
    await waitFor(() => expect(ver).toHaveFocus())
  })

  it("un aprobado de antes del cambio de identificación se marca desactualizado", () => {
    renderizar(
      [
        documento("RUT", "APROBADO", {
          validadoAt: "2026-10-10T15:00:00.000Z",
        }),
      ],
      true,
      "2026-10-15T12:00:00.000Z"
    )
    const rut = fila("RUT")
    expect(within(rut).getByText("Desactualizado")).toBeInTheDocument()
    expect(
      within(rut).getByText(
        /^Aprobado el 10 de oct de 2026, antes de que la identificación de la empresa cambiara \(el 15 de oct de 2026\): debe cargarse y aprobarse de nuevo\.$/
      )
    ).toBeInTheDocument()
    expect(
      within(rut).getByRole("button", { name: "Cargar RUT por la empresa" })
    ).toBeInTheDocument()
  })

  it("un error de la BD sobre la vigencia se marca en su campo", async () => {
    acciones.aprobarDocumentoAnunciante.mockResolvedValue(
      fallo("La vigencia no puede ser anterior a hoy.", {
        fechaVencimiento: ["La vigencia no puede ser anterior a hoy."],
      })
    )
    const usuario = renderizar([documento("RUT", "PENDIENTE")])
    await usuario.click(screen.getByRole("button", { name: "Revisar RUT" }))
    const hoja = screen.getByRole("dialog", { name: "Revisar RUT" })
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    const campo = within(hoja).getByLabelText(/Vigente hasta/)
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"))
    expect(campo).toHaveAccessibleDescription(
      /La vigencia no puede ser anterior a hoy\./
    )
  })

  it("rechazar un documento exige motivo y lo envía", async () => {
    const camara = documento("CAMARA_COMERCIO", "PENDIENTE")
    const usuario = renderizar([camara])
    await usuario.click(
      screen.getByRole("button", { name: "Revisar Cámara de Comercio" })
    )
    const hoja = screen.getByRole("dialog", {
      name: "Revisar Cámara de Comercio",
    })
    await usuario.click(within(hoja).getByRole("button", { name: "Rechazar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Rechazar Cámara de Comercio?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: /más de 30 días/ })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar documento" })
    )
    await waitFor(() =>
      expect(acciones.rechazarDocumentoAnunciante).toHaveBeenCalledWith({
        documentoId: camara.id,
        motivo: expect.stringMatching(/más de 30 días/),
      })
    )
  })

  it("un documento ya revisado solo se consulta", async () => {
    const usuario = renderizar([documento("RUT", "APROBADO")])
    await usuario.click(screen.getByRole("button", { name: "Ver RUT" }))
    const hoja = screen.getByRole("dialog", { name: "RUT" })
    expect(
      within(hoja).queryByRole("button", { name: "Aprobar" })
    ).not.toBeInTheDocument()
    expect(
      within(hoja).queryByRole("button", { name: "Rechazar" })
    ).not.toBeInTheDocument()
  })

  it("la carga por cuenta de la empresa solo se ofrece con el permiso", async () => {
    renderizar([documento("RUT", "RECHAZADO")])
    expect(
      screen.queryByRole("button", { name: "Cargar documento" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^Cargar RUT/ })
    ).not.toBeInTheDocument()
  })

  it("con el permiso, «Cargar» abre la hoja con el tipo que falta", async () => {
    const usuario = renderizar([documento("RUT", "APROBADO")], true)
    await usuario.click(
      screen.getByRole("button", {
        name: "Cargar Cámara de Comercio por la empresa",
      })
    )
    const hoja = screen.getByRole("dialog", { name: "Cargar documento" })
    expect(
      within(hoja).getByRole("radio", { name: /^Cámara de Comercio/ })
    ).toBeChecked()
  })
})
