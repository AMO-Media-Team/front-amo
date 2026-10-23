// @vitest-environment node
/**
 * Server Actions de «Mi empresa» con el DAL, Supabase y Storage simulados:
 * autorizan primero, toman la empresa de la sesión, no dejan cambiar la
 * identificación de una empresa verificada, no pisan cambios ajenos, escriben
 * solo lo que cambió y validan rutas del logo en el servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

import type { EntradaMiEmpresa } from "./schemas"

const EMPRESA = "0192f1c2-5b6a-7d00-8000-000000000001"
const OTRA = "0192f1c2-5b6a-7d00-8000-000000000002"
const SECTOR = "0192f1c2-5b6a-7d00-8000-0000000000c1"
const OTRO_SECTOR = "0192f1c2-5b6a-7d00-8000-0000000000c2"
const V1 = "2026-10-22T15:00:00.000000+00:00"
const V2 = "2026-10-22T15:05:00.000000+00:00"
const LOGO = `anunciante/${EMPRESA}/logo-0192f1c2-5b6a-7d00-8000-0000000000d1.webp`
const LOGO_ANTERIOR = `anunciante/${EMPRESA}/logo-0192f1c2-5b6a-7d00-8000-0000000000d0.webp`

interface Respuesta {
  data: unknown
  error: { code?: string; message?: string; details?: string } | null
}

/**
 * Consulta encadenable de PostgREST: registra tablas, filtros y escrituras y
 * responde en orden (a `maybeSingle`, `single` o al esperar la cadena).
 */
function crearCliente() {
  const respuestas: Respuesta[] = []
  const llamadas = {
    tablas: [] as string[],
    filtros: [] as [string, unknown][],
    actualizaciones: [] as unknown[],
    inserciones: [] as unknown[],
  }
  const siguiente = async () =>
    respuestas.shift() ?? { data: null, error: null }
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn((columna: string, valor: unknown) => {
      llamadas.filtros.push([columna, valor])
      return consulta
    }),
    is: vi.fn(() => consulta),
    update: vi.fn((fila: unknown) => {
      llamadas.actualizaciones.push(fila)
      return consulta
    }),
    insert: vi.fn((fila: unknown) => {
      llamadas.inserciones.push(fila)
      return consulta
    }),
    maybeSingle: vi.fn(siguiente),
    single: vi.fn(siguiente),
    then: (
      resolver: (valor: Respuesta) => unknown,
      rechazar: (motivo: unknown) => unknown
    ) => siguiente().then(resolver, rechazar),
  }
  const cliente = {
    from: vi.fn((tabla: string) => {
      llamadas.tablas.push(tabla)
      return consulta
    }),
  }
  return { cliente, respuestas, llamadas }
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: {
    id: "u1",
    anuncianteId: null as string | null,
  },
  cliente: null as unknown,
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  informarStorage: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => ({
    actorId: "u1",
    sessionId: "s1",
    admin: {
      rpc: simulados.rpc,
      storage: { from: vi.fn(() => ({ remove: simulados.remove })) },
    },
  })),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    estado.orden.push("cliente")
    return estado.cliente
  }),
}))
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: simulados.prepararSubidaFirmada,
  confirmarObjeto: simulados.confirmarObjeto,
}))
vi.mock("@/lib/storage/cliente", () => ({
  informarStorage: simulados.informarStorage,
}))

const {
  confirmarLogo,
  editarMiEmpresa,
  enviarEmpresaAVerificacion,
  guardarContactoEmpresa,
  prepararSubidaLogo,
  quitarLogo,
} = await import("./actions")
const errores = await import("./errores")

/** La fila de `anunciantes` como la lee la acción. */
function fila(cambios: Record<string, unknown> = {}) {
  return {
    razon_social: "Comercializadora Andina S.A.S.",
    nombre_comercial: "Andina",
    sector_id: SECTOR,
    pais_iso2: "CO",
    nit: "900123456",
    digito_verificacion: "8",
    municipio_codigo: "11001",
    identificacion_extranjera: null,
    ciudad_extranjera: null,
    datos_facturacion: { email_facturacion: "facturas@andina.co" },
    estado_verificacion: "PENDIENTE",
    updated_at: V1,
    deleted_at: null,
    ...cambios,
  }
}

/** Lo que tenía el formulario al abrirse (igual a `fila()`). */
const ORIGINAL: EntradaMiEmpresa = {
  razonSocial: "Comercializadora Andina S.A.S.",
  nombreComercial: "Andina",
  sectorId: SECTOR,
  paisIso2: "CO",
  nit: "900.123.456",
  digitoVerificacion: "8",
  municipioCodigo: "11001",
  identificacionExtranjera: "",
  ciudadExtranjera: "",
  emailFacturacion: "facturas@andina.co",
  regimen: "",
  granContribuyente: false,
  autorretenedor: false,
  actualizadoAt: V1,
}

let supabase: ReturnType<typeof crearCliente>

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = { id: "u1", anuncianteId: EMPRESA }
  supabase = crearCliente()
  estado.cliente = supabase.cliente
})

describe("editarMiEmpresa", () => {
  it("autoriza primero; sin empresa vinculada no toca la BD", async () => {
    estado.usuario = { id: "u1", anuncianteId: null }
    expect(await editarMiEmpresa(ORIGINAL, ORIGINAL)).toEqual(
      fallo(errores.SIN_EMPRESA)
    )
    expect(estado.orden).toEqual(["dal:anunciantes.editar_propio"])
  })

  it("escribe solo lo que cambió, con bloqueo optimista, y repinta", async () => {
    supabase.respuestas.push(
      { data: fila(), error: null },
      { data: [{ updated_at: V2 }], error: null }
    )
    const resultado = await editarMiEmpresa(
      {
        ...ORIGINAL,
        nombreComercial: "Andina Express",
        regimen: "RESPONSABLE_IVA",
      },
      ORIGINAL
    )
    expect(resultado).toEqual(exito({ actualizadoAt: V2 }))
    expect(estado.orden[0]).toBe("dal:anunciantes.editar_propio")
    expect(supabase.llamadas.actualizaciones).toEqual([
      {
        nombre_comercial: "Andina Express",
        datos_facturacion: {
          email_facturacion: "facturas@andina.co",
          regimen: "RESPONSABLE_IVA",
        },
      },
    ])
    expect(supabase.llamadas.filtros).toContainEqual(["updated_at", V1])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("sin cambios no escribe ni mueve la versión", async () => {
    supabase.respuestas.push({ data: fila(), error: null })
    expect(await editarMiEmpresa(ORIGINAL, ORIGINAL)).toEqual(
      exito({ actualizadoAt: V1 })
    )
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("un DV incorrecto vuelve a su campo sin escribir", async () => {
    supabase.respuestas.push({ data: fila(), error: null })
    const resultado = await editarMiEmpresa(
      { ...ORIGINAL, digitoVerificacion: "7" },
      ORIGINAL
    )
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.erroresCampo?.digitoVerificacion?.[0]).toMatch(
        /No corresponde al NIT/
      )
    }
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("verificada: rechaza un cambio de identificación y repinta la página", async () => {
    supabase.respuestas.push({
      data: fila({ estado_verificacion: "VERIFICADO" }),
      error: null,
    })
    expect(
      await editarMiEmpresa(
        { ...ORIGINAL, razonSocial: "Otra Razón S.A.S." },
        ORIGINAL
      )
    ).toEqual(fallo(errores.IDENTIFICACION_YA_VERIFICADA))
    expect(supabase.llamadas.actualizaciones).toEqual([])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("verificada: guarda lo demás sin escribir la identificación", async () => {
    supabase.respuestas.push(
      { data: fila({ estado_verificacion: "SUSPENDIDO" }), error: null },
      { data: [{ updated_at: V2 }], error: null }
    )
    const resultado = await editarMiEmpresa(
      // Espacios y mayúsculas distintas no son un cambio de razón social.
      {
        ...ORIGINAL,
        razonSocial: " comercializadora  andina s.a.s.",
        nombreComercial: "Andina 2",
      },
      ORIGINAL
    )
    expect(resultado.ok).toBe(true)
    expect(supabase.llamadas.actualizaciones).toEqual([
      { nombre_comercial: "Andina 2" },
    ])
  })

  it("si otra persona cambió lo mismo desde que se abrió, no lo pisa", async () => {
    supabase.respuestas.push({
      data: fila({ nombre_comercial: "Andina (AMO)", updated_at: V2 }),
      error: null,
    })
    expect(
      await editarMiEmpresa(
        { ...ORIGINAL, nombreComercial: "Andina Express" },
        ORIGINAL
      )
    ).toEqual(fallo(errores.EMPRESA_DESACTUALIZADA))
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("si solo cambió otra columna (el logo, el envío), guarda con la versión vigente", async () => {
    supabase.respuestas.push(
      { data: fila({ updated_at: V2 }), error: null },
      { data: [{ updated_at: "v3" }], error: null }
    )
    const resultado = await editarMiEmpresa(
      { ...ORIGINAL, nombreComercial: "Andina Express" },
      ORIGINAL
    )
    expect(resultado).toEqual(exito({ actualizadoAt: "v3" }))
    expect(supabase.llamadas.filtros).toContainEqual(["updated_at", V2])
  })

  it("un sector nuevo debe seguir activo", async () => {
    supabase.respuestas.push(
      { data: fila(), error: null },
      { data: null, error: null }
    )
    const resultado = await editarMiEmpresa(
      { ...ORIGINAL, sectorId: OTRO_SECTOR },
      ORIGINAL
    )
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.erroresCampo?.sectorId).toBeDefined()
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("si la escritura no toca filas (otra ganó entre lectura y escritura), avisa", async () => {
    supabase.respuestas.push(
      { data: fila(), error: null },
      { data: [], error: null }
    )
    expect(
      await editarMiEmpresa(
        { ...ORIGINAL, nombreComercial: "Andina Express" },
        ORIGINAL
      )
    ).toEqual(fallo(errores.EMPRESA_DESACTUALIZADA))
  })
})

describe("guardarContactoEmpresa", () => {
  const CONTACTO = {
    nombre: "Laura Gómez",
    correo: "laura@andina.co",
    celular: "300 123 4567",
    direccion: "",
    version: "",
  }

  it("valida antes de tocar la BD", async () => {
    const resultado = await guardarContactoEmpresa({
      ...CONTACTO,
      correo: "laura@",
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:anunciantes.editar_propio"])
  })

  it("lo crea con la sesión si aún no existe", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: { updated_at: V1 }, error: null }
    )
    expect(await guardarContactoEmpresa(CONTACTO)).toEqual(
      exito({ actualizadoAt: V1 })
    )
    expect(supabase.llamadas.inserciones).toEqual([
      {
        anunciante_id: EMPRESA,
        contacto_nombre: "Laura Gómez",
        contacto_email: "laura@andina.co",
        contacto_celular: "+57 300 123 4567",
        direccion: null,
      },
    ])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("si otra persona lo creó mientras tanto (23505), pide cargar lo vigente", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "anunciantes_privado_pkey"',
        },
      }
    )
    expect(await guardarContactoEmpresa(CONTACTO)).toEqual(
      fallo(errores.CONTACTO_DESACTUALIZADO)
    )
  })

  it("con otra versión no pisa lo guardado", async () => {
    supabase.respuestas.push({
      data: {
        contacto_nombre: "Otra persona",
        contacto_email: "otra@andina.co",
        contacto_celular: null,
        direccion: null,
        updated_at: V2,
      },
      error: null,
    })
    expect(await guardarContactoEmpresa({ ...CONTACTO, version: V1 })).toEqual(
      fallo(errores.CONTACTO_DESACTUALIZADO)
    )
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("actualiza solo lo que cambió, con la versión", async () => {
    supabase.respuestas.push(
      {
        data: {
          contacto_nombre: "Laura Gómez",
          contacto_email: "laura@andina.co",
          contacto_celular: null,
          direccion: null,
          updated_at: V1,
        },
        error: null,
      },
      { data: [{ updated_at: V2 }], error: null }
    )
    expect(await guardarContactoEmpresa({ ...CONTACTO, version: V1 })).toEqual(
      exito({ actualizadoAt: V2 })
    )
    expect(supabase.llamadas.actualizaciones).toEqual([
      { contacto_celular: "+57 300 123 4567" },
    ])
    expect(supabase.llamadas.filtros).toContainEqual(["updated_at", V1])
  })
})

describe("logo", () => {
  const SUBIDO: ArchivoSubido = {
    nombre: "logo.webp",
    tipo: "image/webp",
    tamano: 40_000,
    sha256: null,
    dimensiones: { ancho: 512, alto: 512 },
    duracionSeg: null,
    conMiniatura: false,
    bucket: "avatares",
    ruta: LOGO,
    rutaMiniatura: null,
  }

  it("prepara una ruta `logo-{uuid}` en la carpeta de la empresa", async () => {
    simulados.prepararSubidaFirmada.mockResolvedValue(
      exito({ bucket: "avatares", ruta: "x", token: "t", miniatura: null })
    )
    const { bucket: _b, ruta: _r, rutaMiniatura: _m, ...descripcion } = SUBIDO
    await prepararSubidaLogo(descripcion)
    const [opciones] = simulados.prepararSubidaFirmada.mock.calls[0]
    expect(opciones.bucket).toBe("avatares")
    expect(opciones.ruta).toMatch(
      new RegExp(`^anunciante/${EMPRESA}/logo-[0-9a-f-]{36}\\.webp$`)
    )
  })

  it("rechaza un logo que no es de la empresa sin tocar Storage", async () => {
    expect(
      await confirmarLogo({ ...SUBIDO, ruta: LOGO.replace(EMPRESA, OTRA) })
    ).toEqual(fallo(errores.LOGO_NO_COINCIDE))
    expect(simulados.confirmarObjeto).not.toHaveBeenCalled()
  })

  it("verifica el objeto, guarda la ruta y borra el anterior como servicio", async () => {
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    supabase.respuestas.push(
      { data: { logo_path: LOGO_ANTERIOR }, error: null },
      { data: [{ id: EMPRESA }], error: null }
    )
    simulados.remove.mockResolvedValue({ data: [], error: null })
    expect(await confirmarLogo(SUBIDO)).toEqual(exito())
    expect(supabase.llamadas.actualizaciones).toEqual([{ logo_path: LOGO }])
    expect(simulados.remove).toHaveBeenCalledWith([LOGO_ANTERIOR])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("es idempotente: si ya es el logo vigente no escribe ni borra", async () => {
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    supabase.respuestas.push({ data: { logo_path: LOGO }, error: null })
    expect(await confirmarLogo(SUBIDO)).toEqual(exito())
    expect(supabase.llamadas.actualizaciones).toEqual([])
    expect(simulados.remove).not.toHaveBeenCalled()
  })

  it("si el objeto no está, no guarda nada", async () => {
    simulados.confirmarObjeto.mockResolvedValue(fallo("no-subido"))
    expect(await confirmarLogo(SUBIDO)).toEqual(fallo("no-subido"))
    expect(supabase.llamadas.actualizaciones).toEqual([])
  })

  it("quitar deja la empresa sin logo y borra el objeto", async () => {
    supabase.respuestas.push(
      { data: { logo_path: LOGO_ANTERIOR }, error: null },
      { data: [{ id: EMPRESA }], error: null }
    )
    simulados.remove.mockResolvedValue({ data: [], error: null })
    expect(await quitarLogo()).toEqual(exito())
    expect(supabase.llamadas.actualizaciones).toEqual([{ logo_path: null }])
    expect(simulados.remove).toHaveBeenCalledWith([LOGO_ANTERIOR])
  })

  it("nunca borra una ruta que no sea un logo de la empresa", async () => {
    supabase.respuestas.push(
      { data: { logo_path: `anunciante/${OTRA}/logo-x.webp` }, error: null },
      { data: [{ id: EMPRESA }], error: null }
    )
    expect(await quitarLogo()).toEqual(exito())
    expect(simulados.remove).not.toHaveBeenCalled()
  })
})

describe("enviarEmpresaAVerificacion", () => {
  it("sin persona de contacto no llama a la BD", async () => {
    supabase.respuestas.push({ data: null, error: null })
    expect(await enviarEmpresaAVerificacion()).toEqual(
      fallo(errores.CONTACTO_INCOMPLETO)
    )
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("envía con el actor y su sesión, y repinta", async () => {
    supabase.respuestas.push({
      data: { contacto_nombre: "Laura", contacto_email: "laura@andina.co" },
      error: null,
    })
    simulados.rpc.mockResolvedValue({ data: null, error: null })
    expect(await enviarEmpresaAVerificacion()).toEqual(exito())
    expect(simulados.rpc).toHaveBeenCalledWith(
      "enviar_anunciante_a_verificacion_srv",
      { p_anunciante_id: EMPRESA, p_actor_id: "u1", p_session_id: "s1" }
    )
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("si faltan documentos, muestra el `detail` de la BD", async () => {
    supabase.respuestas.push({
      data: { contacto_nombre: "Laura", contacto_email: "laura@andina.co" },
      error: null,
    })
    simulados.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Antes de enviar carga: RUT, Cámara de Comercio.",
      },
    })
    expect(await enviarEmpresaAVerificacion()).toEqual(
      fallo("Antes de enviar carga: RUT, Cámara de Comercio.")
    )
  })
})
