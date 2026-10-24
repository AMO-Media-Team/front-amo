import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { MENSAJES_CAMPOS, mensajeLargoCuds } from "../schemas"
import type { DocumentoSoporteFicha } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  emitirDocumentoSoporte: vi.fn(),
  generarArchivosDocumentoSoporte: vi.fn(),
  registrarCuds: vi.fn(),
  anularDocumentoSoporte: vi.fn(),
  registrarDocumentoExpedido: vi.fn(),
  registrarNotaAjuste: vi.fn(),
  prepararPdfDocumentoSoporte: vi.fn(),
  confirmarPdfDocumentoSoporte: vi.fn(),
  firmarArchivoDocumentoSoporte: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: avisos }))
// La subida directa a Storage (cliente de Supabase en el navegador) no corre en jsdom.
const subida = vi.hoisted(() => ({
  subir: vi.fn(),
  reintentar: vi.fn(),
  reiniciar: vi.fn(),
  cancelar: vi.fn(),
  estado: "en-cola",
  progreso: 0,
  error: null,
  intento: 0,
  reanudaEn: null,
  activa: false,
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: () => subida,
}))

import {
  ID_ESTADO_DOCUMENTO_SOPORTE,
  SeccionDocumentoSoporte,
  type SeccionDocumentoSoporteProps,
} from "./seccion-documento-soporte"

const LIQUIDACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const DOCUMENTO = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const ANTERIOR = "0192f3a4-5b6c-7d8e-9f01-0000000000d0"
const CUDS = "0123456789abcdef".repeat(6)

const EMITIDO: DocumentoSoporteFicha = {
  id: DOCUMENTO,
  estado: "EMITIDO",
  numero: "DS10",
  fechaEmision: "2026-10-17",
  valorTotal: 360000,
  cuds: null,
  cudsRegistradoAt: null,
  archivoPath: `documento_soporte/${DOCUMENTO}/a.pdf`,
  archivoProveedorPath: `documento_soporte/${DOCUMENTO}/b.json`,
  notaAjuste: null,
  anteriores: [],
}

function Seccion(cambios: Partial<SeccionDocumentoSoporteProps> = {}) {
  return (
    <SeccionDocumentoSoporte
      liquidacionId={LIQUIDACION}
      estadoLiquidacion="APROBADA"
      documento={EMITIDO}
      numeracion="PLATAFORMA"
      puedeGestionar
      {...cambios}
    />
  )
}

function estado(): HTMLElement {
  const elemento = document.getElementById(ID_ESTADO_DOCUMENTO_SOPORTE)
  if (!elemento) throw new Error("Sin el estado del documento")
  return elemento
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("SeccionDocumentoSoporte · emitir", () => {
  it("aprobada sin documento: lo exige y lo emite con la plataforma", async () => {
    acciones.emitirDocumentoSoporte.mockResolvedValue(
      exito({ documentoId: DOCUMENTO, numero: "DS10", aviso: null })
    )
    const usuario = userEvent.setup()
    render(<Seccion documento={null} />)

    expect(
      within(estado()).getByRole("heading", {
        name: "Documento soporte requerido",
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Registrar documento expedido" })
    ).not.toBeInTheDocument()

    await usuario.click(
      screen.getByRole("button", { name: "Emitir documento soporte" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Emitir el documento soporte?",
    })
    expect(dialogo).toHaveTextContent("no se vuelve a usar")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Emitir documento" })
    )

    await waitFor(() =>
      expect(acciones.emitirDocumentoSoporte).toHaveBeenCalledWith({
        liquidacionId: LIQUIDACION,
      })
    )
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith(
        "Documento soporte DS10 emitido"
      )
    )
    // El botón que lo abrió ya no existe: el foco va al estado del documento.
    await waitFor(() => expect(estado()).toHaveFocus())
  })

  it("si los archivos fallan, el documento queda emitido y se avisa qué hacer", async () => {
    acciones.emitirDocumentoSoporte.mockResolvedValue(
      exito({
        documentoId: DOCUMENTO,
        numero: "DS10",
        aviso:
          "El documento quedó emitido, pero sus archivos no: … Usa «Generar archivos».",
      })
    )
    const usuario = userEvent.setup()
    render(<Seccion documento={null} />)
    await usuario.click(
      screen.getByRole("button", { name: "Emitir documento soporte" })
    )
    await usuario.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Emitir documento",
      })
    )
    await waitFor(() =>
      expect(avisos.warning).toHaveBeenCalledWith(
        expect.stringMatching(/^El documento quedó emitido/),
        expect.anything()
      )
    )
  })

  it("un rechazo de la BD queda dentro del diálogo", async () => {
    acciones.emitirDocumentoSoporte.mockResolvedValue(
      fallo("Resolución agotada: no hay consecutivos disponibles.")
    )
    const usuario = userEvent.setup()
    render(<Seccion documento={null} />)
    await usuario.click(
      screen.getByRole("button", { name: "Emitir documento soporte" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Emitir documento" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      /^Resolución agotada: /
    )
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("con la numeración del proveedor ofrece registrar el documento expedido y valida cada campo", async () => {
    const usuario = userEvent.setup()
    render(<Seccion documento={null} numeracion="PROVEEDOR" />)
    expect(
      screen.queryByRole("button", { name: "Emitir documento soporte" })
    ).not.toBeInTheDocument()

    await usuario.click(
      screen.getByRole("button", { name: "Registrar documento expedido" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar documento expedido",
    })
    await usuario.type(within(dialogo).getByLabelText("CUDS"), "abc")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar documento" })
    )

    expect(
      within(dialogo).getByLabelText("Número")
    ).toHaveAccessibleDescription(MENSAJES_CAMPOS.consecutivoVacio)
    expect(
      within(dialogo).getByLabelText("Fecha de emisión")
    ).toHaveAccessibleDescription(MENSAJES_CAMPOS.fechaVacia)
    expect(within(dialogo).getByLabelText("CUDS")).toHaveAccessibleDescription(
      new RegExp(`^${mensajeLargoCuds(3)}`)
    )
    expect(
      within(dialogo).getByText(MENSAJES_CAMPOS.archivoRequerido)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialogo).getByLabelText("Número")).toHaveFocus()
    )
    expect(acciones.prepararPdfDocumentoSoporte).not.toHaveBeenCalled()
    expect(acciones.registrarDocumentoExpedido).not.toHaveBeenCalled()
  })
})

describe("SeccionDocumentoSoporte · emitido", () => {
  it("datos, descargas y registrar el CUDS (el error queda junto al campo)", async () => {
    acciones.registrarCuds.mockResolvedValue(exito({ aviso: null }))
    const usuario = userEvent.setup()
    render(<Seccion />)

    expect(
      within(estado()).getByRole("heading", {
        name: "Pendiente de transmisión a la DIAN",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("DS10")).toBeInTheDocument()
    expect(screen.getByText("17 de octubre de 2026")).toBeInTheDocument()
    const descargas = screen.getByRole("group", {
      name: "Descargas del documento soporte",
    })
    expect(within(descargas).getAllByRole("button")).toEqual([
      within(descargas).getByRole("button", {
        name: "PDF del documento (DS10)",
      }),
      within(descargas).getByRole("button", {
        name: "Archivo para el proveedor (DS10)",
      }),
    ])
    expect(
      screen.queryByRole("button", { name: "Registrar nota de ajuste" })
    ).not.toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: "Registrar CUDS" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el CUDS",
    })
    const campo = within(dialogo).getByLabelText("CUDS")
    await usuario.type(campo, "xyz")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar CUDS" })
    )
    expect(campo).toHaveAccessibleDescription(
      new RegExp(`^${MENSAJES_CAMPOS.cudsCaracteres}`)
    )
    expect(campo).toHaveFocus()
    expect(acciones.registrarCuds).not.toHaveBeenCalled()

    await usuario.clear(campo)
    await usuario.type(campo, CUDS.toUpperCase())
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar CUDS" })
    )
    await waitFor(() =>
      expect(acciones.registrarCuds).toHaveBeenCalledWith({
        documentoId: DOCUMENTO,
        cuds: CUDS.toUpperCase(),
      })
    )
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith("CUDS registrado", {
        description: "Documento soporte DS10.",
      })
    )
    await waitFor(() => expect(estado()).toHaveFocus())
  })

  it("con CUDS: lo muestra para copiar y pide la nota de ajuste antes de anular", () => {
    render(<Seccion documento={{ ...EMITIDO, cuds: CUDS }} />)
    expect(screen.getByText(CUDS)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Copiar el CUDS" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Registrar nota de ajuste" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Anular documento" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Registrar CUDS" })
    ).not.toBeInTheDocument()
  })

  it("con la nota de ajuste se anula con un motivo; un fallo queda en el diálogo", async () => {
    acciones.anularDocumentoSoporte
      .mockResolvedValueOnce(fallo("No tienes permiso para esta acción."))
      .mockResolvedValueOnce(exito())
    const usuario = userEvent.setup()
    render(
      <Seccion
        documento={{
          ...EMITIDO,
          cuds: CUDS,
          notaAjuste: {
            numero: "NA1",
            cude: null,
            archivoPath: `documento_soporte/${DOCUMENTO}/n.pdf`,
            registradaAt: "2026-10-18T15:00:00Z",
          },
        }}
      />
    )
    expect(
      within(
        screen.getByRole("group", { name: "Descargas del documento soporte" })
      ).getByRole("button", { name: /^Nota de ajuste/ })
    ).toBeInTheDocument()

    await usuario.click(
      screen.getByRole("button", { name: "Anular documento" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Anular el documento soporte DS10?",
    })
    expect(dialogo).toHaveTextContent("nota de ajuste NA1")
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Los datos del vendedor estaban mal.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Anular documento" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No tienes permiso para esta acción."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Anular documento" })
    )
    await waitFor(() =>
      expect(acciones.anularDocumentoSoporte).toHaveBeenLastCalledWith({
        documentoId: DOCUMENTO,
        motivo: "Los datos del vendedor estaban mal.",
      })
    )
    await waitFor(() => expect(estado()).toHaveFocus())
  })

  it("sin los archivos los genera; una descarga fallida lo dice", async () => {
    acciones.generarArchivosDocumentoSoporte.mockResolvedValue(
      exito({ numero: "DS10" })
    )
    acciones.firmarArchivoDocumentoSoporte.mockResolvedValue(
      fallo("No encontramos el archivo o no tienes acceso a él.")
    )
    const usuario = userEvent.setup()
    render(<Seccion documento={{ ...EMITIDO, archivoProveedorPath: null }} />)
    expect(
      screen.getByText(/^Faltan los archivos de este documento/)
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Generar archivos" })
    )
    await waitFor(() =>
      expect(acciones.generarArchivosDocumentoSoporte).toHaveBeenCalledWith({
        documentoId: DOCUMENTO,
      })
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Archivos generados",
      expect.anything()
    )

    await usuario.click(
      screen.getByRole("button", { name: "PDF del documento (DS10)" })
    )
    await waitFor(() =>
      expect(avisos.error).toHaveBeenCalledWith(
        "No encontramos el archivo o no tienes acceso a él.",
        {
          description:
            "Si es un documento de los datos de demostración, sus archivos no existen: usa «Generar archivos».",
        }
      )
    )
    expect(acciones.firmarArchivoDocumentoSoporte).toHaveBeenCalledWith({
      documentoId: DOCUMENTO,
      archivo: "pdf",
    })
  })
})

describe("SeccionDocumentoSoporte · nota de ajuste", () => {
  const CON_CUDS: DocumentoSoporteFicha = { ...EMITIDO, cuds: CUDS }
  const PDF = new File(["%PDF-1.4\n%prueba"], "nota-ajuste.pdf", {
    type: "application/pdf",
  })
  const CARGADO = {
    documentoId: DOCUMENTO,
    ruta: `documento_soporte/${DOCUMENTO}/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`,
  }

  async function abrirNota() {
    const usuario = userEvent.setup()
    render(<Seccion documento={CON_CUDS} />)
    await usuario.click(
      screen.getByRole("button", { name: "Registrar nota de ajuste" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar nota de ajuste",
    })
    return { usuario, dialogo }
  }

  it("sin número ni PDF lo dice junto a cada campo y no sube nada", async () => {
    const { usuario, dialogo } = await abrirNota()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar nota" })
    )
    expect(
      within(dialogo).getByRole("textbox", { name: "Número de la nota" })
    ).toHaveAccessibleDescription(MENSAJES_CAMPOS.numeroNotaVacio)
    expect(
      within(dialogo).getByText(MENSAJES_CAMPOS.archivoRequerido)
    ).toBeInTheDocument()
    expect(subida.subir).not.toHaveBeenCalled()
  })

  it("sube el PDF, registra la nota y, si la BD no encuentra el PDF, lo vuelve a subir", async () => {
    subida.subir.mockResolvedValue({ ok: true, datos: CARGADO, archivo: {} })
    acciones.registrarNotaAjuste
      .mockResolvedValueOnce(
        fallo(
          "El PDF no terminó de cargarse. Elígelo de nuevo y vuelve a intentarlo.",
          {
            archivo: [
              "El PDF no terminó de cargarse. Elígelo de nuevo y vuelve a intentarlo.",
            ],
          }
        )
      )
      .mockResolvedValueOnce(exito())
    const { usuario, dialogo } = await abrirNota()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Número de la nota" }),
      "na 12"
    )
    const entrada =
      dialogo.querySelector<HTMLInputElement>('input[type="file"]')
    await usuario.upload(entrada as HTMLInputElement, PDF)
    await waitFor(() =>
      expect(
        within(dialogo).getByRole("button", { name: "Quitar nota-ajuste.pdf" })
      ).toHaveFocus()
    )

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar nota" })
    )
    expect(await within(dialogo).findByText(/^El PDF no terminó/)).toBeVisible()
    expect(acciones.registrarNotaAjuste).toHaveBeenCalledWith({
      numero: "na 12",
      cude: "",
      documentoId: DOCUMENTO,
      archivoPath: CARGADO.ruta,
    })
    // Lo subido ya no sirve: el siguiente intento lo sube otra vez.
    expect(subida.reiniciar).toHaveBeenCalled()

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar nota" })
    )
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith(
        "Nota de ajuste NA 12 registrada",
        expect.anything()
      )
    )
    expect(subida.subir).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(estado()).toHaveFocus())
  })

  it("si la subida falla, lo dice sin registrar nada", async () => {
    subida.subir.mockResolvedValue({
      ok: false,
      error: "Sin conexión.",
      cancelada: false,
    })
    const { usuario, dialogo } = await abrirNota()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Número de la nota" }),
      "NA1"
    )
    await usuario.upload(
      dialogo.querySelector<HTMLInputElement>(
        'input[type="file"]'
      ) as HTMLInputElement,
      PDF
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar nota" })
    )
    expect(
      await within(dialogo).findByText(/^No pudimos subir el PDF/)
    ).toBeVisible()
    expect(acciones.registrarNotaAjuste).not.toHaveBeenCalled()
  })
})

describe("SeccionDocumentoSoporte · sin permiso, pagada e historial", () => {
  it("sin permiso solo se ve y se descarga", () => {
    render(<Seccion documento={null} puedeGestionar={false} />)
    expect(estado()).toHaveTextContent(
      "Lo hace quien puede aprobar liquidaciones."
    )
    expect(
      screen.queryByRole("group", { name: "Acciones del documento soporte" })
    ).not.toBeInTheDocument()
  })

  it("pagada: no se anula ni se corrige desde aquí", () => {
    render(
      <Seccion
        estadoLiquidacion="PAGADA"
        documento={{ ...EMITIDO, cuds: CUDS }}
      />
    )
    expect(
      within(estado()).getByRole("heading", { name: "Transmitido a la DIAN" })
    ).toBeInTheDocument()
    for (const nombre of [
      "Anular documento",
      "Registrar nota de ajuste",
      "Registrar CUDS",
    ]) {
      expect(
        screen.queryByRole("button", { name: nombre })
      ).not.toBeInTheDocument()
    }
  })

  it("los documentos anulados quedan en el historial con sus descargas", () => {
    render(
      <Seccion
        documento={{
          ...EMITIDO,
          anteriores: [
            {
              id: ANTERIOR,
              numero: "DS9",
              anuladoAt: "2026-10-16T15:00:00Z",
              notaAjusteNumero: "NA7",
            },
          ],
        }}
      />
    )
    const historial = screen.getByRole("region", {
      name: "Documentos anteriores",
    })
    expect(historial).toHaveTextContent("DS9")
    expect(historial).toHaveTextContent("nota de ajuste NA7")
    expect(
      within(historial).getByRole("button", { name: "PDF del documento DS9" })
    ).toBeInTheDocument()
    expect(
      within(historial).getByRole("button", {
        name: "Nota de ajuste del documento DS9",
      })
    ).toBeInTheDocument()
  })
})
