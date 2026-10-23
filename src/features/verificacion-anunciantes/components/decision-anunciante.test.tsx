import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { DocumentoExpediente, ExpedienteAnunciante } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  verificarAnunciante: vi.fn(),
  rechazarAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { DecisionAnunciante } from "./decision-anunciante"

const HOY = "2026-10-22"
const EMPRESA_ID = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

let secuencia = 0
function documento(
  tipo: DocumentoExpediente["tipo"],
  estado: DocumentoExpediente["estado"],
  validadoAt: string | null = null
): DocumentoExpediente {
  secuencia += 1
  return {
    id: `0192f3a4-5b6c-7d8e-9f01-${String(secuencia).padStart(12, "0")}`,
    tipo,
    estado,
    venceAt: null,
    subidoAt: new Date(Date.UTC(2026, 9, 1) + secuencia * 60_000).toISOString(),
    observaciones: null,
    validadoAt,
    mime: "application/pdf",
  }
}

function expediente(
  cambios: Partial<ExpedienteAnunciante["anunciante"]> = {},
  documentos: DocumentoExpediente[] = [
    documento("RUT", "APROBADO"),
    documento("CAMARA_COMERCIO", "PENDIENTE"),
  ]
): ExpedienteAnunciante {
  return {
    anunciante: {
      id: EMPRESA_ID,
      nombreComercial: "Café del Sur",
      razonSocial: "Café del Sur S.A.S.",
      identificacion: "900.123.456-7",
      tipoIdentificacion: "NIT",
      paisIso2: "CO",
      pais: "Colombia",
      ciudad: "Pasto",
      sector: "Alimentos",
      estado: "PENDIENTE",
      motivoEstado: null,
      enviadoAt: "2026-10-21T15:00:00.000Z",
      verificadoAt: null,
      verificadoPor: null,
      identificacionCambiadaAt: null,
      ...cambios,
    },
    documentos,
    hoy: HOY,
  }
}

function renderizar(
  datos = expediente(),
  permitidas: ("verificar" | "rechazar")[] = ["verificar", "rechazar"]
) {
  const usuario = userEvent.setup()
  render(<DecisionAnunciante expediente={datos} acciones={permitidas} />)
  return usuario
}

beforeEach(() => {
  acciones.verificarAnunciante.mockReset().mockResolvedValue(exito())
  acciones.rechazarAnunciante.mockReset().mockResolvedValue(exito())
})

describe("DecisionAnunciante", () => {
  it("muestra la situación y lo que exige su país con el avance", () => {
    renderizar()
    expect(screen.getByText("Espera tu decisión")).toBeInTheDocument()
    expect(screen.getByText("1 de 2 aprobados")).toBeInTheDocument()
    const requisitos = screen.getAllByRole("listitem")
    expect(requisitos.map((fila) => fila.textContent)).toEqual([
      "RUTAprobado",
      "Cámara de ComercioPor revisar",
    ])
    expect(
      screen.getByRole("button", { name: "Verificar empresa" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument()
  })

  it("en el exterior pide un documento de existencia de la empresa", () => {
    renderizar(
      expediente({ paisIso2: "US", pais: "Estados Unidos" }, [
        documento("CERT_BANCARIA", "APROBADO"),
      ])
    )
    expect(
      screen.getByText("Documento de existencia de la empresa")
    ).toBeInTheDocument()
    expect(screen.getByText("0 de 1 aprobados")).toBeInTheDocument()
  })

  it("lo que la BD dice que falta se muestra en el diálogo, que sigue abierto", async () => {
    acciones.verificarAnunciante.mockResolvedValue(
      fallo("Faltan documentos aprobados y vigentes: Cámara de Comercio.")
    )
    const usuario = renderizar()
    await usuario.click(
      screen.getByRole("button", { name: "Verificar empresa" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Verificar a Café del Sur?",
    })
    expect(dialogo).toHaveTextContent(/aún falta algún documento aprobado/)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar empresa" })
    )
    expect(
      await within(dialogo).findByText(
        "Faltan documentos aprobados y vigentes: Cámara de Comercio."
      )
    ).toBeInTheDocument()
    expect(acciones.verificarAnunciante).toHaveBeenCalledWith({
      anuncianteId: EMPRESA_ID,
    })
    expect(dialogo).toBeInTheDocument()
  })

  it("con todo aprobado verifica y cierra el diálogo", async () => {
    const usuario = renderizar(
      expediente({}, [
        documento("RUT", "APROBADO"),
        documento("CAMARA_COMERCIO", "APROBADO"),
      ])
    )
    await usuario.click(
      screen.getByRole("button", { name: "Verificar empresa" })
    )
    const dialogo = screen.getByRole("alertdialog")
    expect(dialogo).toHaveTextContent(/Podrá activar campañas/)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar empresa" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
  })

  it("rechazar exige un motivo y ofrece los frecuentes", async () => {
    const usuario = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Rechazar la verificación de Café del Sur?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar verificación" })
    )
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Describe el motivo (al menos 5 caracteres)."
    )
    expect(acciones.rechazarAnunciante).not.toHaveBeenCalled()

    await usuario.click(
      within(dialogo).getByRole("button", { name: /^El RUT está ilegible/ })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar verificación" })
    )
    await waitFor(() =>
      expect(acciones.rechazarAnunciante).toHaveBeenCalledWith({
        anuncianteId: EMPRESA_ID,
        motivo: expect.stringMatching(/^El RUT está ilegible/),
      })
    )
  })

  it("si la identificación cambió después de aprobar, no lo cuenta y lo avisa", () => {
    renderizar(
      expediente({ identificacionCambiadaAt: "2026-10-15T12:00:00.000Z" }, [
        documento("RUT", "APROBADO", "2026-10-10T15:00:00.000Z"),
        documento("CAMARA_COMERCIO", "APROBADO", "2026-10-16T15:00:00.000Z"),
      ])
    )
    expect(screen.getByText("1 de 2 aprobados")).toBeInTheDocument()
    expect(
      screen.getAllByRole("listitem").map((fila) => fila.textContent)
    ).toEqual(["RUTDesactualizado", "Cámara de ComercioAprobado"])
    expect(
      screen.getByText(
        /^La identificación de la empresa \(NIT, país o razón social\) cambió el 15 de octubre de 2026, después de aprobar uno de los documentos exigidos: debe cargarse y aprobarse de nuevo\./
      )
    ).toBeInTheDocument()
  })

  it("tras verificar, el foco va al titular de la situación (los botones desaparecen)", async () => {
    const usuario = userEvent.setup()
    const aprobados = [
      documento("RUT", "APROBADO"),
      documento("CAMARA_COMERCIO", "APROBADO"),
    ]
    const vista = render(
      <DecisionAnunciante
        expediente={expediente({}, aprobados)}
        acciones={["verificar", "rechazar"]}
      />
    )
    // Como la Server Action: la ficha se refresca antes de cerrar el diálogo.
    acciones.verificarAnunciante.mockImplementation(async () => {
      vista.rerender(
        <DecisionAnunciante
          expediente={expediente(
            { estado: "VERIFICADO", enviadoAt: null },
            aprobados
          )}
          acciones={[]}
        />
      )
      return exito()
    })
    await usuario.click(
      screen.getByRole("button", { name: "Verificar empresa" })
    )
    await usuario.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Verificar empresa",
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    await waitFor(() => expect(document.activeElement?.tagName).toBe("P"))
    expect(document.activeElement).toHaveAttribute("tabindex", "-1")
  })

  it("si se cierra sin decidir, el foco vuelve al botón", async () => {
    const usuario = renderizar()
    const rechazar = screen.getByRole("button", { name: "Rechazar" })
    await usuario.click(rechazar)
    await usuario.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancelar",
      })
    )
    await waitFor(() => expect(rechazar).toHaveFocus())
  })

  it("sin permiso (o fuera de PENDIENTE) no ofrece decisión", () => {
    renderizar(
      expediente({
        estado: "RECHAZADO",
        enviadoAt: null,
        motivoEstado: "RUT ilegible",
      }),
      []
    )
    expect(screen.getByText("Verificación rechazada")).toBeInTheDocument()
    expect(screen.getByText(/^Motivo: RUT ilegible\./)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
