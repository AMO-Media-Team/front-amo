// @vitest-environment node
/**
 * Server Actions de «Mi medio» con el DAL, Supabase y el cifrado simulados:
 * autorizan antes que nada, toman el medio de la sesión (nunca de la
 * entrada), validan con lo que el servidor relee de la BD, cifran en el
 * servidor y no escriben si otra edición ganó.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { pagoFijo, SIN_PAGO } from "./fixtures"
import type { EntradaDatosPago, EntradaPerfilMedio } from "./schemas"
import type { PagoResumen } from "./tipos"

const MEDIO = "0192f1c2-5b6a-7d00-8000-000000000001"
const OTRO_MEDIO = "0192f1c2-5b6a-7d00-8000-000000000002"
const VERSION = "2026-10-22T12:00:00.000000+00:00"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: { id: "u1", medioId: null as string | null },
  pago: null as unknown,
  rpc: { error: null as unknown },
  tablas: {} as Record<string, { data: unknown; error: unknown }>,
  escrituras: [] as string[],
  filtros: [] as [string, string, unknown][],
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  rpc: vi.fn(),
}))

/**
 * Consulta encadenable de PostgREST: responde lo configurado para su tabla y
 * anota cualquier escritura (que en estas pruebas no debe ocurrir).
 */
function consulta(tabla: string) {
  const respuesta = () =>
    estado.tablas[tabla] ?? { data: null, error: { code: "sin-dato" } }
  const anotar = (operacion: string) => () => {
    estado.escrituras.push(`${operacion}:${tabla}`)
    return cadena
  }
  const cadena: Record<string, unknown> = {
    select: () => cadena,
    eq: (columna: string, valor: unknown) => {
      estado.filtros.push([tabla, columna, valor])
      return cadena
    },
    is: () => cadena,
    in: () => cadena,
    update: anotar("update"),
    insert: anotar("insert"),
    delete: anotar("delete"),
    maybeSingle: async () => respuesta(),
    then: (resolver: (valor: unknown) => unknown) =>
      Promise.resolve(respuesta()).then(resolver),
  }
  return cadena
}

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    return {
      actorId: actor.id,
      sessionId: "s1",
      admin: { rpc: simulados.rpc },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    estado.orden.push("cliente")
    return { from: (tabla: string) => consulta(tabla) }
  }),
}))
vi.mock("./queries", () => ({
  pagoResumen: vi.fn(async (medioId: string) => {
    estado.orden.push(`pagoResumen:${medioId}`)
    return estado.pago
  }),
}))
// Cifrado de mentiras pero verificable: deja ver el contexto con que se cifró
// y nunca el texto claro.
vi.mock("@/lib/cifrado", async (original) => ({
  ...(await original<typeof import("@/lib/cifrado")>()),
  cifrar: (texto: string, contexto?: string) =>
    `v1:${Buffer.from(contexto ?? "").toString("base64")}:${texto.length}:x`,
  huella: (texto: string) =>
    Buffer.from(texto).toString("hex").padEnd(64, "0").slice(0, 64),
}))

const { enviarMedioAVerificacion, guardarDatosPagoMedio, guardarPerfilMedio } =
  await import("./actions")
const { DOCUMENTO_DUPLICADO, PERFIL_DESACTUALIZADO, SIN_MEDIO } =
  await import("./errores")

const CEDULA = "1.023.456.789"
const CELULAR = "300 123 4821"

function entradaPago(
  parcial: Partial<EntradaDatosPago> = {}
): EntradaDatosPago {
  return {
    titularNombre: "Ana María Pérez",
    tipoDocumento: "CC",
    numeroDocumento: CEDULA,
    cambiarCuenta: false,
    metodoPago: "BILLETERA",
    banco: "",
    bancoOtro: "",
    tipoCuenta: "",
    numeroCuenta: "",
    billetera: "Nequi",
    billeteraOtra: "",
    numeroBilletera: CELULAR,
    esDeclarante: true,
    obligadoFacturar: false,
    responsableIva: false,
    ...parcial,
  }
}

function argumentosRpc(): {
  nombre: string
  args: {
    p_medio_id: string
    p_actor_id: string
    p_session_id: string
    p_datos?: Record<string, unknown>
  }
} {
  const [nombre, args] = simulados.rpc.mock.calls[0]
  return { nombre, args }
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = { id: "u1", medioId: MEDIO }
  estado.pago = SIN_PAGO satisfies PagoResumen
  estado.tablas = {}
  estado.escrituras = []
  estado.filtros = []
  simulados.rpc.mockImplementation(async () => estado.rpc)
  estado.rpc = { error: null }
})

describe("guardarDatosPagoMedio", () => {
  it("autoriza antes que nada y relee lo guardado del medio de la sesión", async () => {
    await guardarDatosPagoMedio(entradaPago())
    expect(estado.orden).toEqual([
      "dal:medios.editar_propio",
      `pagoResumen:${MEDIO}`,
      "contexto",
    ])
  })

  it("sin medio en la sesión no lee ni escribe nada", async () => {
    estado.usuario = { id: "u1", medioId: null }
    const resultado = await guardarDatosPagoMedio(entradaPago())
    expect(resultado).toEqual({ ok: false, error: SIN_MEDIO })
    expect(estado.orden).toEqual(["dal:medios.editar_propio"])
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("cifra en el servidor con el contexto de su fila y no envía números en claro", async () => {
    const resultado = await guardarDatosPagoMedio(entradaPago())
    expect(resultado).toEqual({
      ok: true,
      datos: { cuentaNueva: true, metodo: "BILLETERA" },
    })
    const { nombre, args } = argumentosRpc()
    expect(nombre).toBe("guardar_datos_pago_medio_srv")
    expect(args).toMatchObject({
      p_medio_id: MEDIO,
      p_actor_id: "u1",
      p_session_id: "s1",
    })
    const datos = args.p_datos ?? {}
    const contexto = (valor: unknown) =>
      Buffer.from(String(valor).split(":")[1], "base64").toString()
    expect(contexto(datos.numero_documento_cifrado)).toBe(
      `medios_privado:${MEDIO}:numero_documento_cifrado`
    )
    expect(contexto(datos.datos_pago_cifrados)).toBe(
      `medios_privado:${MEDIO}:datos_pago_cifrados`
    )
    // Huella de `tipo:número normalizado` y resúmenes enmascarados.
    expect(datos.numero_documento_hash).toBe(
      Buffer.from("CC:1023456789").toString("hex").padEnd(64, "0").slice(0, 64)
    )
    expect(datos.numero_documento_resumen).toBe("•••• 6789")
    expect(datos.datos_pago_resumen).toBe("Nequi •••• 4821")
    expect(datos.metodo_pago).toBe("BILLETERA")
    const enviado = JSON.stringify(args)
    expect(enviado).not.toContain("1023456789")
    expect(enviado).not.toContain("3001234821")
    expect(simulados.refresh).toHaveBeenCalledOnce()
  })

  it("con número y cuenta ya cifrados y vacíos, los conserva (no los envía)", async () => {
    estado.pago = pagoFijo()
    const resultado = await guardarDatosPagoMedio(
      entradaPago({ numeroDocumento: "", numeroBilletera: "", billetera: "" })
    )
    expect(resultado).toEqual({
      ok: true,
      datos: { cuentaNueva: false, metodo: null },
    })
    const datos = argumentosRpc().args.p_datos ?? {}
    expect(Object.keys(datos).sort()).toEqual([
      "es_declarante",
      "obligado_facturar",
      "responsable_iva",
      "tipo_documento",
      "titular_nombre",
    ])
  })

  it("valida con lo que relee la BD, no con lo que diga el navegador", async () => {
    // Sin documento guardado, dejarlo vacío no es «conservar».
    const resultado = await guardarDatosPagoMedio(
      entradaPago({ numeroDocumento: "" })
    )
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.erroresCampo).toHaveProperty(
      "numeroDocumento"
    )
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("documento ya registrado en otro medio: el error va a su campo", async () => {
    estado.rpc = {
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "medios_privado_numero_documento_hash_key"',
      },
    }
    const resultado = await guardarDatosPagoMedio(entradaPago())
    expect(resultado).toEqual({
      ok: false,
      error: DOCUMENTO_DUPLICADO,
      erroresCampo: { numeroDocumento: [DOCUMENTO_DUPLICADO] },
    })
    expect(simulados.refresh).not.toHaveBeenCalled()
  })
})

describe("enviarMedioAVerificacion", () => {
  it("autoriza antes que nada y envía el medio de la sesión", async () => {
    const resultado = await enviarMedioAVerificacion()
    expect(resultado).toEqual({ ok: true, datos: undefined })
    expect(estado.orden).toEqual(["dal:medios.editar_propio", "contexto"])
    expect(argumentosRpc()).toEqual({
      nombre: "enviar_medio_a_verificacion_srv",
      args: { p_medio_id: MEDIO, p_actor_id: "u1", p_session_id: "s1" },
    })
  })

  it("si falta algo, muestra lo que dice la BD", async () => {
    estado.rpc = {
      error: {
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Antes de enviar completa: una cuenta social.",
      },
    }
    const resultado = await enviarMedioAVerificacion()
    expect(resultado).toEqual({
      ok: false,
      error: "Antes de enviar completa: una cuenta social.",
    })
  })

  it("sin medio en la sesión no llama a la BD", async () => {
    estado.usuario = { id: "u1", medioId: null }
    expect(await enviarMedioAVerificacion()).toEqual({
      ok: false,
      error: SIN_MEDIO,
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })
})

describe("guardarPerfilMedio", () => {
  const entradaPerfil = (
    parcial: Partial<EntradaPerfilMedio> = {}
  ): EntradaPerfilMedio => ({
    actualizadoAt: VERSION,
    nombre: "Noticias del Sur",
    tipo: "PAGINA_NOTICIAS",
    municipioCodigo: "76001",
    descripcionAudiencia: "Jóvenes de Cali.",
    categoriaIds: [],
    audiencia: [],
    ...parcial,
  })

  beforeEach(() => {
    estado.tablas = {
      medios: {
        data: {
          nombre: "Noticias del Sur",
          tipo: "PAGINA_NOTICIAS",
          municipio_codigo: "76001",
          descripcion_audiencia: "Jóvenes de Cali.",
          updated_at: VERSION,
        },
        error: null,
      },
      medio_categorias: { data: [], error: null },
      medio_audiencia_paises: { data: [], error: null },
    }
  })

  it("autoriza antes de abrir el cliente y sin medio no lee nada", async () => {
    estado.usuario = { id: "u1", medioId: null }
    expect(await guardarPerfilMedio(entradaPerfil())).toEqual({
      ok: false,
      error: SIN_MEDIO,
    })
    expect(estado.orden).toEqual(["dal:medios.editar_propio"])
  })

  it("si otra edición ganó (versión distinta), no escribe nada", async () => {
    const resultado = await guardarPerfilMedio(
      entradaPerfil({
        actualizadoAt: "2026-10-21T08:00:00.000000+00:00",
        nombre: "Otro nombre",
      })
    )
    expect(resultado).toEqual({ ok: false, error: PERFIL_DESACTUALIZADO })
    expect(estado.escrituras).toEqual([])
  })

  it("sin cambios no escribe ni mueve la versión", async () => {
    const resultado = await guardarPerfilMedio(entradaPerfil())
    expect(resultado).toEqual({
      ok: true,
      datos: { actualizadoAt: VERSION, advertencia: null },
    })
    expect(estado.escrituras).toEqual([])
  })

  it("el medio que se escribe es el de la sesión, aunque la entrada traiga otro", async () => {
    const entrada = { ...entradaPerfil(), medioId: OTRO_MEDIO }
    await guardarPerfilMedio(entrada as EntradaPerfilMedio)
    const porMedio = estado.filtros.filter(
      ([, columna]) => columna === "id" || columna === "medio_id"
    )
    expect(porMedio.map(([tabla]) => tabla).sort()).toEqual([
      "medio_audiencia_paises",
      "medio_categorias",
      "medios",
    ])
    expect(porMedio.every(([, , valor]) => valor === MEDIO)).toBe(true)
  })
})
