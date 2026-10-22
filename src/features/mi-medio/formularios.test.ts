import { describe, expect, it } from "vitest"

import { valoresPago, valoresPerfil } from "./formularios"
import { esquemaDatosPago, esquemaPerfilMedio } from "./schemas"
import type { PagoResumen, PerfilEditable } from "./tipos"

const CATEGORIA = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

const PERFIL: PerfilEditable = {
  medio: {
    id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a00",
    nombre: "Noticias del Sur",
    tipo: "PAGINA_NOTICIAS",
    municipioCodigo: "76001",
    descripcionAudiencia: null,
    estado: "PENDIENTE",
    nivel: 0,
    enviadoVerificacionAt: null,
    motivoEstado: null,
    verificadoAt: null,
    actualizadoAt: "2026-10-22T12:00:00.000000+00:00",
  },
  categoriaIds: [CATEGORIA],
  categorias: [{ id: CATEGORIA, nombre: "Noticias" }],
  audiencia: [
    { paisIso2: "CO", porcentaje: 87.5 },
    { paisIso2: "US", porcentaje: 1250 / 100 },
  ],
  audienciaVerificada: [],
  audienciaFija: { paises: [], porcentaje: 0 },
  paises: [],
}

const RESUMEN: PagoResumen = {
  titularNombre: "Ana María Pérez",
  tipoDocumento: "CC",
  numeroDocumentoResumen: "•••• 6789",
  metodoPago: "BILLETERA",
  cuentaResumen: "Nequi •••• 4821",
  esDeclarante: true,
  obligadoFacturar: false,
  responsableIva: true,
  documentoRegistrado: true,
  cuentaRegistrada: true,
  datosPagoCambiadosAt: "2026-10-22T12:00:00Z",
  actualizadoAt: "2026-10-22T12:00:00Z",
}

describe("valoresPerfil", () => {
  it("lleva lo guardado al formulario, con los porcentajes como se escriben", () => {
    expect(valoresPerfil(PERFIL)).toEqual({
      actualizadoAt: PERFIL.medio.actualizadoAt,
      nombre: "Noticias del Sur",
      tipo: "PAGINA_NOTICIAS",
      municipioCodigo: "76001",
      descripcionAudiencia: "",
      categoriaIds: [CATEGORIA],
      audiencia: [
        { paisIso2: "CO", porcentaje: "87,5" },
        { paisIso2: "US", porcentaje: "12,5" },
      ],
    })
  })

  it("lo que produce pasa el mismo esquema que valida el servidor", () => {
    expect(esquemaPerfilMedio().safeParse(valoresPerfil(PERFIL)).success).toBe(
      true
    )
  })
})

describe("valoresPago", () => {
  it("nunca trae números: solo lo que se puede volver a mostrar", () => {
    const valores = valoresPago(RESUMEN)
    expect(valores).toMatchObject({
      titularNombre: "Ana María Pérez",
      tipoDocumento: "CC",
      numeroDocumento: "",
      cambiarCuenta: false,
      metodoPago: "BILLETERA",
      numeroCuenta: "",
      numeroBilletera: "",
      esDeclarante: true,
      obligadoFacturar: false,
      responsableIva: true,
    })
    expect(JSON.stringify(valores)).not.toMatch(/\d{4}/)
  })

  it("con todo guardado, enviar sin cambios conserva documento y cuenta", () => {
    const datos = esquemaDatosPago({
      tipoDocumento: "CC",
      documentoRegistrado: true,
      cuentaRegistrada: true,
    }).parse(valoresPago(RESUMEN))
    expect(datos.numeroDocumento).toBeNull()
    expect(datos.cuenta).toBeNull()
  })

  it("sin nada guardado arranca vacío", () => {
    expect(
      valoresPago({
        ...RESUMEN,
        titularNombre: null,
        tipoDocumento: null,
        metodoPago: null,
        esDeclarante: false,
        responsableIva: false,
      })
    ).toMatchObject({ titularNombre: "", tipoDocumento: "", metodoPago: "" })
  })
})
