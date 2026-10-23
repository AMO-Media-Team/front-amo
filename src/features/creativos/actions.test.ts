// @vitest-environment node
/**
 * Server Actions del paquete creativo con el DAL, Supabase y Storage
 * simulados: autorizan primero, revalidan cada archivo contra su formato
 * antes de firmar, construyen y comprueban la ruta en el servidor, confirman
 * de forma idempotente, ordenan con un UPDATE por fila, descartan la versión
 * pendiente (y su carpeta) y activan con el actor y la sesión.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MIB } from "@/lib/archivos/formato"
import type { ArchivoSubido, DescripcionArchivo } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

import { MENSAJES_CREATIVO } from "./errores"
import type { FilaArchivo, FilaCreativo } from "./filas"
import { LIMITES_POR_DEFECTO } from "./formatos"
import { datosPrueba, FORMATOS_PRUEBA, versionPrueba } from "./fixtures"

const OFERTA = "01a16525-58de-707e-a365-2362638c6104"
const CREATIVO = "01a16525-58df-7261-945f-fdec04e83e70"
const ARCHIVO = "01a16525-58df-77d1-b2f6-e286cfbc9c83"
const RUTA = `oferta/${OFERTA}/${CREATIVO}/0192f1c2-5b6a-7d00-8000-0000000000bb.mp4`

interface Respuesta {
  data?: unknown
  error?: { code?: string; message?: string; details?: string } | null
  count?: number | null
}

/** Cliente de PostgREST encadenable: registra las llamadas y responde en orden. */
function crearCliente() {
  const respuestas: Respuesta[] = []
  const llamadas: { tabla: string; metodo: string; args: unknown[] }[] = []
  const siguiente = () => {
    const respuesta = respuestas.shift() ?? { data: null, error: null }
    return { data: null, error: null, count: null, ...respuesta }
  }
  function constructor(tabla: string) {
    const consulta: Record<string, unknown> = {}
    for (const metodo of [
      "select",
      "eq",
      "in",
      "limit",
      "order",
      "insert",
      "update",
      "delete",
    ]) {
      consulta[metodo] = vi.fn((...args: unknown[]) => {
        llamadas.push({ tabla, metodo, args })
        return consulta
      })
    }
    consulta.maybeSingle = vi.fn(async () => siguiente())
    consulta.single = vi.fn(async () => siguiente())
    consulta.then = (resolver: (valor: unknown) => unknown) =>
      Promise.resolve(siguiente()).then(resolver)
    return consulta
  }
  const cliente = {
    from: vi.fn((tabla: string) => constructor(tabla)),
  }
  return { cliente, respuestas, llamadas }
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: {
    id: "u1",
    anuncianteId: "a1" as string | null,
    rol: { tipo: "ANUNCIANTE" as string },
    permisos: ["ofertas.gestionar_propias"] as string[],
  },
  cliente: null as unknown,
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: vi.fn(),
  firmarDescarga: vi.fn(),
  firmarDescargas: vi.fn(),
  datosCreativo: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  list: vi.fn(),
  /** `from` del cliente de servicio (otra instancia de `crearCliente`). */
  desdeServicio: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permisos: string[]) => {
    estado.orden.push(`dal:${[...permisos].join("|")}`)
    return estado.usuario
  }),
  tieneAlgunPermiso: (
    usuario: { permisos: string[] },
    permisos: readonly string[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => ({
    actorId: "u1",
    sessionId: "s1",
    admin: {
      rpc: simulados.rpc,
      from: simulados.desdeServicio,
      storage: {
        from: () => ({
          remove: simulados.remove,
          copy: simulados.copy,
          list: simulados.list,
        }),
      },
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
  MENSAJES_SUBIDA: { noCoincide: "no-coincide" },
  prepararSubidaFirmada: simulados.prepararSubidaFirmada,
  confirmarObjeto: simulados.confirmarObjeto,
}))
vi.mock("@/lib/storage/descargas", () => ({
  MENSAJES_DESCARGA: { noEncontrado: "no-encontrado" },
  firmarDescarga: simulados.firmarDescarga,
  firmarDescargas: simulados.firmarDescargas,
}))
vi.mock("./queries", () => ({
  datosCreativo: simulados.datosCreativo,
  limitesCreativo: vi.fn(async () => LIMITES_POR_DEFECTO),
}))

const acciones = await import("./actions")

const VIDEO: DescripcionArchivo = {
  nombre: "reel.mp4",
  tipo: "video/mp4",
  tamano: 12 * MIB,
  sha256: "b".repeat(64),
  dimensiones: { ancho: 1080, alto: 1920 },
  duracionSeg: 30.456,
  conMiniatura: true,
}

const SUBIDO: ArchivoSubido = {
  ...VIDEO,
  bucket: "creativos",
  ruta: RUTA,
  rutaMiniatura: RUTA.replace(".mp4", "-min.webp"),
}

function filaArchivo(cambios: Partial<FilaArchivo> = {}): FilaArchivo {
  return {
    id: ARCHIVO,
    archivo_path: RUTA,
    mime: "video/mp4",
    tamano_bytes: 12 * MIB,
    ancho: 1080,
    alto: 1920,
    duracion_segundos: 30.46,
    orden: 0,
    sha256: "b".repeat(64),
    created_at: "2026-10-22T10:00:00+00:00",
    ...cambios,
  }
}

/** Fila de `creativos` con su oferta y formato (lo que lee `leerEdicion`). */
function filaEdicion(
  cambios: Partial<FilaCreativo> = {},
  estadoOferta = "BORRADOR"
) {
  return {
    id: CREATIVO,
    oferta_id: OFERTA,
    version: 1,
    tipo: "VIDEO",
    vigente: true,
    activado_at: "2026-10-22T09:00:00+00:00",
    copy_sugerido: null,
    hashtags: [],
    menciones: [],
    enlace_destino: null,
    created_at: "2026-10-22T09:00:00+00:00",
    archivos: [],
    ...cambios,
    oferta: {
      id: OFERTA,
      estado: estadoOferta,
      deleted_at: null,
      formato: {
        id: FORMATOS_PRUEBA.reel.id,
        plataforma: "INSTAGRAM",
        clave: "REEL",
        nombre: "Reel",
        requisitos: {
          mime: ["video/mp4", "video/quicktime"],
          peso_max_mb: 50,
          duracion_max_s: 90,
          relaciones_aspecto: ["9:16"],
        } as Record<string, unknown>,
      },
    },
  }
}

let supabase: ReturnType<typeof crearCliente>
let servicio: ReturnType<typeof crearCliente>

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = {
    id: "u1",
    anuncianteId: "a1",
    rol: { tipo: "ANUNCIANTE" },
    permisos: ["ofertas.gestionar_propias"],
  }
  supabase = crearCliente()
  estado.cliente = supabase.cliente
  servicio = crearCliente()
  simulados.desdeServicio.mockImplementation(servicio.cliente.from)
})

const TIPO_INCOHERENTE =
  "El tipo de creativo no corresponde al formato elegido."

describe("leerCreativoEditable", () => {
  it("autoriza consultar y dice si puede gestionar", async () => {
    simulados.datosCreativo.mockResolvedValue(datosPrueba())
    const resultado = await acciones.leerCreativoEditable({ ofertaId: OFERTA })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias|ofertas.gestionar|ofertas.ver"
    )
    // Como anunciante: también si su empresa puede activar versiones.
    expect(simulados.datosCreativo).toHaveBeenCalledWith(OFERTA, true, true)
    expect(resultado.ok).toBe(true)
  })

  it("al equipo AMO (modo asistido) no le pide la empresa verificada", async () => {
    estado.usuario = {
      id: "u2",
      anuncianteId: null,
      rol: { tipo: "ADMIN" },
      permisos: ["ofertas.gestionar"],
    }
    simulados.datosCreativo.mockResolvedValue(datosPrueba())
    await acciones.leerCreativoEditable({ ofertaId: OFERTA })
    expect(simulados.datosCreativo).toHaveBeenCalledWith(OFERTA, true, false)
  })

  it("quien solo ve ofertas no gestiona; una oferta ajena no existe", async () => {
    estado.usuario.permisos = ["ofertas.ver"]
    simulados.datosCreativo.mockResolvedValue(null)
    expect(await acciones.leerCreativoEditable({ ofertaId: OFERTA })).toEqual(
      fallo(MENSAJES_CREATIVO.ofertaNoEncontrada)
    )
    expect(simulados.datosCreativo).toHaveBeenCalledWith(OFERTA, false, true)
  })
})

describe("guardarCreativo", () => {
  it("crea la versión con su tipo y los textos normalizados", async () => {
    simulados.datosCreativo.mockResolvedValue(datosPrueba())
    supabase.respuestas.push({ data: filaEdicion(), error: null })
    const resultado = await acciones.guardarCreativo({
      ofertaId: OFERTA,
      tipo: "VIDEO",
      textos: {
        copySugerido: "",
        hashtags: ["Publicidad"],
        menciones: [],
        enlaceDestino: "mimarca.co",
      },
    })
    expect(resultado.ok).toBe(true)
    const insercion = supabase.llamadas.find((l) => l.metodo === "insert")
    expect(insercion?.args[0]).toEqual({
      oferta_id: OFERTA,
      tipo: "VIDEO",
      copy_sugerido: null,
      hashtags: ["#Publicidad"],
      menciones: [],
      enlace_destino: "https://mimarca.co",
    })
  })

  it("actualiza los textos de la versión editable", async () => {
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({ editable: versionPrueba() })
    )
    supabase.respuestas.push({ data: filaEdicion(), error: null })
    await acciones.guardarCreativo({
      ofertaId: OFERTA,
      tipo: "VIDEO",
      textos: {
        copySugerido: "Hola",
        hashtags: [],
        menciones: [],
        enlaceDestino: "",
      },
    })
    expect(supabase.llamadas.map((l) => l.metodo)).toContain("update")
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("insert")
  })

  it("no cambia el tipo con archivos ni lo admite fuera del formato", async () => {
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({
        formato: FORMATOS_PRUEBA.postFeed,
        editable: versionPrueba({
          tipo: "IMAGEN",
          archivos: [
            {
              id: ARCHIVO,
              ruta: RUTA,
              mime: "image/jpeg",
              tamanoBytes: 10,
              ancho: 10,
              alto: 10,
              duracionSegundos: null,
              orden: 0,
              sha256: null,
            },
          ],
        }),
      })
    )
    expect(
      await acciones.guardarCreativo({ ofertaId: OFERTA, tipo: "VIDEO" })
    ).toEqual(fallo(MENSAJES_CREATIVO.tipoConArchivos))
    expect(
      await acciones.guardarCreativo({ ofertaId: OFERTA, tipo: "CARRUSEL" })
    ).toEqual(fallo(MENSAJES_CREATIVO.tipoNoAdmitido))
  })

  it("traduce el rechazo de la BD al tipo de creativo", async () => {
    simulados.datosCreativo.mockResolvedValue(datosPrueba())
    supabase.respuestas.push({
      data: null,
      error: {
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: TIPO_INCOHERENTE,
      },
    })
    expect(
      await acciones.guardarCreativo({ ofertaId: OFERTA, tipo: "VIDEO" })
    ).toEqual(fallo(TIPO_INCOHERENTE))
    expect(MENSAJES_CREATIVO.tipoNoAdmitido).toBe(TIPO_INCOHERENTE)
  })

  it("respeta el bloqueo del estado de la oferta", async () => {
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({ bloqueo: MENSAJES_CREATIVO.enRevision })
    )
    expect(
      await acciones.guardarCreativo({ ofertaId: OFERTA, tipo: "VIDEO" })
    ).toEqual(fallo(MENSAJES_CREATIVO.enRevision))
  })
})

describe("prepararArchivoCreativo", () => {
  it("rechaza un video horizontal para un reel indicando 9:16, sin firmar", async () => {
    supabase.respuestas.push({ data: filaEdicion(), error: null })
    const resultado = await acciones.prepararArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: { ...VIDEO, dimensiones: { ancho: 1920, alto: 1080 } },
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.error).toMatch(
        /^Un reel de Instagram necesita video vertical 9:16.*el tuyo es horizontal 16:9/
      )
    }
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })

  it("autoriza primero y firma una ruta del creativo con miniatura", async () => {
    supabase.respuestas.push({ data: filaEdicion(), error: null })
    simulados.prepararSubidaFirmada.mockResolvedValue(
      exito({ bucket: "creativos", ruta: "x", token: "t", miniatura: null })
    )
    await acciones.prepararArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: VIDEO,
    })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias|ofertas.gestionar"
    )
    const [opciones] = simulados.prepararSubidaFirmada.mock.calls[0]
    expect(opciones).toMatchObject({ bucket: "creativos", miniatura: true })
    expect(opciones.ruta).toMatch(
      new RegExp(`^oferta/${OFERTA}/${CREATIVO}/[0-9a-f-]{36}\\.mp4$`)
    )
  })

  it("no deja pasar más archivos de los que admite el formato", async () => {
    supabase.respuestas.push({
      data: filaEdicion({ archivos: [filaArchivo()] }),
      error: null,
    })
    expect(
      await acciones.prepararArchivoCreativo({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: VIDEO,
      })
    ).toEqual(fallo("Este formato admite un solo archivo."))
  })

  it("explica por qué no se edita una oferta en revisión", async () => {
    supabase.respuestas.push({
      data: filaEdicion({}, "EN_REVISION"),
      error: null,
    })
    expect(
      await acciones.prepararArchivoCreativo({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: VIDEO,
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.enRevision))
  })

  it("exige la huella SHA-256", async () => {
    const resultado = await acciones.prepararArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: { ...VIDEO, sha256: null },
    })
    expect(resultado).toEqual(
      fallo("Falta la huella SHA-256 del archivo. Elígelo de nuevo.")
    )
  })
})

describe("confirmarArchivoCreativo", () => {
  it("rechaza una ruta que no es del creativo", async () => {
    expect(
      await acciones.confirmarArchivoCreativo({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: { ...SUBIDO, ruta: `oferta/${OFERTA}/otro/x.mp4` },
      })
    ).toEqual(fallo("no-coincide"))
  })

  it("es idempotente por ruta", async () => {
    supabase.respuestas.push({ data: filaArchivo(), error: null })
    const resultado = await acciones.confirmarArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: SUBIDO,
    })
    expect(resultado).toMatchObject({ ok: true, datos: { id: ARCHIVO } })
    expect(simulados.confirmarObjeto).not.toHaveBeenCalled()
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("insert")
  })

  it("verifica el objeto e inserta con el peso de Storage y el orden pedido", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: filaEdicion(), error: null },
      { data: filaArchivo({ orden: 3 }), error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(
      exito({
        bucket: "creativos",
        ruta: RUTA,
        tamano: 12 * MIB,
        tipo: "video/mp4",
      })
    )
    const resultado = await acciones.confirmarArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      orden: 3,
      archivo: SUBIDO,
    })
    expect(resultado.ok).toBe(true)
    expect(simulados.confirmarObjeto).toHaveBeenCalledWith(
      expect.objectContaining({
        ruta: RUTA,
        esperado: { tamano: 12 * MIB, tipo: "video/mp4" },
      })
    )
    const insercion = supabase.llamadas.find((l) => l.metodo === "insert")
    expect(insercion?.args[0]).toEqual({
      creativo_id: CREATIVO,
      archivo_path: RUTA,
      mime: "video/mp4",
      tamano_bytes: 12 * MIB,
      ancho: 1080,
      alto: 1920,
      duracion_segundos: 30.46,
      orden: 3,
      sha256: "b".repeat(64),
    })
  })

  it("si otra confirmación registró la ruta primero, devuelve esa fila", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: filaEdicion(), error: null },
      {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "creativo_archivos_archivo_path_key"',
        },
      },
      { data: filaArchivo(), error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(
      exito({ bucket: "creativos", ruta: RUTA, tamano: 12 * MIB, tipo: null })
    )
    const resultado = await acciones.confirmarArchivoCreativo({
      ofertaId: OFERTA,
      creativoId: CREATIVO,
      archivo: SUBIDO,
    })
    expect(resultado).toMatchObject({ ok: true, datos: { id: ARCHIVO } })
    const lecturas = supabase.llamadas.filter(
      (l) => l.metodo === "eq" && l.args[0] === "archivo_path"
    )
    expect(lecturas).toHaveLength(2)
  })

  it("traduce el rechazo de la BD con su detalle", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: filaEdicion(), error: null },
      {
        data: null,
        error: {
          message: "AMO_CONFIG_INVALIDA",
          details:
            "El archivo no está en el almacenamiento o su tamaño no coincide: vuelve a cargarlo.",
        },
      }
    )
    simulados.confirmarObjeto.mockResolvedValue(
      exito({ bucket: "creativos", ruta: RUTA, tamano: null, tipo: null })
    )
    expect(
      await acciones.confirmarArchivoCreativo({
        ofertaId: OFERTA,
        creativoId: CREATIVO,
        archivo: SUBIDO,
      })
    ).toEqual(
      fallo(
        "El archivo no está en el almacenamiento o su tamaño no coincide: vuelve a cargarlo."
      )
    )
  })
})

describe("quitarArchivoCreativo", () => {
  it("borra la fila con la sesión y el objeto y su miniatura como servicio", async () => {
    supabase.respuestas.push(
      { data: { id: ARCHIVO, creativo_id: CREATIVO, archivo_path: RUTA } },
      { data: filaEdicion({ archivos: [filaArchivo()] }) },
      { data: [{ id: ARCHIVO }] },
      { count: 0 }
    )
    simulados.remove.mockResolvedValue({ data: [], error: null })
    const resultado = await acciones.quitarArchivoCreativo({
      archivoId: ARCHIVO,
    })
    expect(resultado).toEqual(exito({ creativoId: CREATIVO }))
    expect(simulados.remove).toHaveBeenCalledWith([
      RUTA,
      RUTA.replace(".mp4", "-min.webp"),
    ])
  })

  it("si la política no deja borrar, no toca Storage", async () => {
    supabase.respuestas.push(
      { data: { id: ARCHIVO, creativo_id: CREATIVO, archivo_path: RUTA } },
      { data: filaEdicion({ archivos: [filaArchivo()] }) },
      { data: [] }
    )
    expect(
      await acciones.quitarArchivoCreativo({ archivoId: ARCHIVO })
    ).toEqual(fallo(MENSAJES_CREATIVO.noEditable))
    expect(simulados.remove).not.toHaveBeenCalled()
  })
})

describe("crearVersionPendiente", () => {
  it("solo en una oferta publicada sin otra pendiente", async () => {
    simulados.datosCreativo.mockResolvedValue(datosPrueba())
    expect(
      await acciones.crearVersionPendiente({
        ofertaId: OFERTA,
        conservar: true,
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.sinPublicar))
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({
        estadoOferta: "PUBLICADA",
        editable: versionPrueba({ vigente: false, pendiente: true }),
      })
    )
    expect(
      await acciones.crearVersionPendiente({
        ofertaId: OFERTA,
        conservar: true,
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.pendienteExiste))
  })

  it("no copia una vigente cuyo tipo ya no corresponde al formato", async () => {
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({
        estadoOferta: "PUBLICADA",
        vigente: versionPrueba({ tipo: "IMAGEN" }),
        admiteVersionNueva: true,
        bloqueo: MENSAJES_CREATIVO.publicada,
      })
    )
    expect(
      await acciones.crearVersionPendiente({
        ofertaId: OFERTA,
        conservar: true,
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.tipoVigenteNoAdmitido))
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("insert")
  })

  it("parte de la vigente: copia textos y archivos a la carpeta nueva", async () => {
    const vigente = versionPrueba({
      archivos: [
        {
          id: ARCHIVO,
          ruta: RUTA,
          mime: "video/mp4",
          tamanoBytes: 12 * MIB,
          ancho: 1080,
          alto: 1920,
          duracionSegundos: 30,
          orden: 0,
          sha256: "b".repeat(64),
        },
      ],
    })
    simulados.datosCreativo.mockResolvedValue(
      datosPrueba({
        estadoOferta: "PUBLICADA",
        vigente,
        admiteVersionNueva: true,
        bloqueo: MENSAJES_CREATIVO.publicada,
      })
    )
    const NUEVA = "01a16525-58df-7261-945f-fdec04e83e99"
    supabase.respuestas.push(
      {
        data: filaEdicion({
          id: NUEVA,
          version: 2,
          vigente: false,
          activado_at: null,
        }),
      },
      { data: null, error: null },
      {
        data: filaEdicion({
          id: NUEVA,
          version: 2,
          vigente: false,
          activado_at: null,
        }),
      }
    )
    simulados.copy.mockResolvedValue({ data: { path: "x" }, error: null })
    const resultado = await acciones.crearVersionPendiente({
      ofertaId: OFERTA,
      conservar: true,
    })
    expect(resultado).toMatchObject({ ok: true, datos: { aviso: null } })
    const [origen, destino] = simulados.copy.mock.calls[0]
    expect(origen).toBe(RUTA)
    expect(destino).toMatch(new RegExp(`^oferta/${OFERTA}/${NUEVA}/`))
    const insercion = supabase.llamadas.filter((l) => l.metodo === "insert")
    expect(insercion[0].args[0]).toMatchObject({
      tipo: "VIDEO",
      hashtags: vigente.hashtags,
    })
    expect(insercion[1].args[0]).toEqual([
      expect.objectContaining({ creativo_id: NUEVA, archivo_path: destino }),
    ])
    expect(simulados.refresh).toHaveBeenCalled()
  })
})

describe("activarVersionCreativo", () => {
  it("activa con el actor y la sesión y refresca la página", async () => {
    simulados.rpc.mockResolvedValue({
      data: { creativo_id: CREATIVO, version: 2, reemplaza_a: "v1" },
      error: null,
    })
    const resultado = await acciones.activarVersionCreativo({
      creativoId: CREATIVO,
    })
    expect(simulados.rpc).toHaveBeenCalledWith("activar_creativo_srv", {
      p_creativo_id: CREATIVO,
      p_actor_id: "u1",
      p_session_id: "s1",
    })
    expect(resultado).toEqual(exito({ version: 2, reemplazaA: "v1" }))
    expect(simulados.refresh).toHaveBeenCalled()
  })

  it("devuelve el motivo de la BD", async () => {
    simulados.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "AMO_TRANSICION_INVALIDA",
        details: "Carga al menos un archivo en la versión nueva.",
      },
    })
    expect(
      await acciones.activarVersionCreativo({ creativoId: CREATIVO })
    ).toEqual(fallo("Carga al menos un archivo en la versión nueva."))
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("con la empresa suspendida devuelve el motivo de la BD", async () => {
    const motivo =
      "Tu empresa no está verificada (o está suspendida): no puedes activar versiones nuevas del creativo de una oferta publicada."
    simulados.rpc.mockResolvedValue({
      data: null,
      error: { message: "AMO_NO_AUTORIZADO", details: motivo },
    })
    expect(
      await acciones.activarVersionCreativo({ creativoId: CREATIVO })
    ).toEqual(fallo(motivo))
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("explica que el tipo no corresponde al formato", async () => {
    simulados.rpc.mockResolvedValue({
      data: null,
      error: { message: "AMO_CONFIG_INVALIDA", details: TIPO_INCOHERENTE },
    })
    expect(
      await acciones.activarVersionCreativo({ creativoId: CREATIVO })
    ).toEqual(fallo(TIPO_INCOHERENTE))
  })
})

describe("firmas", () => {
  it("firma originales y miniaturas de una versión en una sola llamada", async () => {
    supabase.respuestas.push({
      data: [{ id: ARCHIVO, archivo_path: RUTA }],
      error: null,
    })
    const miniatura = RUTA.replace(".mp4", "-min.webp")
    simulados.firmarDescargas.mockResolvedValue(
      exito({
        urls: { [RUTA]: "https://u", [miniatura]: "https://m" },
        vigenciaSegundos: 300,
      })
    )
    expect(
      await acciones.firmarArchivosVersion({ creativoId: CREATIVO })
    ).toEqual(
      exito({
        archivos: { [ARCHIVO]: { url: "https://u", miniatura: "https://m" } },
        vigenciaSegundos: 300,
      })
    )
    expect(simulados.firmarDescargas).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "creativos",
        rutas: [RUTA, miniatura],
        firmante: expect.objectContaining({ como: "usuario" }),
      })
    )
  })

  it("descarga con un nombre legible", async () => {
    supabase.respuestas.push({
      data: {
        archivo_path: RUTA,
        mime: "video/mp4",
        orden: 1,
        creativo: { version: 2 },
      },
    })
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://d", vigenciaSegundos: 300 })
    )
    await acciones.firmarArchivoCreativo({
      archivoId: ARCHIVO,
      descargar: true,
    })
    expect(simulados.firmarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ ruta: RUTA, descarga: "creativo-v2-2.mp4" })
    )
  })
})

describe("ordenarArchivosCreativo", () => {
  const OTRO = "01a16525-58e0-7e70-85f1-fb0d1518150f"
  const RUTA_OTRA = `oferta/${OFERTA}/${CREATIVO}/0192f1c2-5b6a-7d00-8000-0000000000cc.mp4`
  const TERCERO = "01a16525-58e0-7e70-85f1-fb0d15181510"
  const RUTA_TERCERA = `oferta/${OFERTA}/${CREATIVO}/0192f1c2-5b6a-7d00-8000-0000000000ee.mp4`
  const carrusel = (archivos: FilaArchivo[]) => {
    const fila = filaEdicion({ tipo: "CARRUSEL", archivos })
    fila.oferta.formato = {
      id: FORMATOS_PRUEBA.carrusel.id,
      plataforma: "INSTAGRAM",
      clave: "CARRUSEL",
      nombre: "Carrusel",
      requisitos: {
        mime: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
        peso_max_mb: 50,
        max_archivos: 10,
        relaciones_aspecto: ["1:1", "4:5"],
      },
    }
    return fila
  }
  const cuadrado = { ancho: 1080, alto: 1080, mime: "image/jpeg" }
  const primero = filaArchivo({ ...cuadrado, orden: 0 })
  const segundo = filaArchivo({
    ...cuadrado,
    id: OTRO,
    archivo_path: RUTA_OTRA,
    orden: 1,
  })

  it("rechaza una lista que no es la de la versión", async () => {
    supabase.respuestas.push({ data: carrusel([primero, segundo]) })
    expect(
      await acciones.ordenarArchivosCreativo({
        creativoId: CREATIVO,
        ids: [OTRO],
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.ordenDistinto))
  })

  it("con el orden de siempre no escribe nada", async () => {
    supabase.respuestas.push({ data: carrusel([primero, segundo]) })
    expect(
      await acciones.ordenarArchivosCreativo({
        creativoId: CREATIVO,
        ids: [ARCHIVO, OTRO],
      })
    ).toMatchObject({ ok: true })
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("update")
  })

  it("actualiza con la sesión solo el orden de las filas que cambian", async () => {
    const tercero = filaArchivo({
      ...cuadrado,
      id: TERCERO,
      archivo_path: RUTA_TERCERA,
      orden: 2,
    })
    supabase.respuestas.push(
      { data: carrusel([primero, segundo, tercero]) },
      { data: [{ id: OTRO }] },
      { data: [{ id: ARCHIVO }] },
      { data: carrusel([segundo, primero, tercero]) }
    )
    const resultado = await acciones.ordenarArchivosCreativo({
      creativoId: CREATIVO,
      ids: [OTRO, ARCHIVO, TERCERO],
    })
    expect(resultado.ok).toBe(true)
    const metodos = supabase.llamadas.map((l) => l.metodo)
    expect(metodos).not.toContain("insert")
    expect(metodos).not.toContain("delete")
    const updates = supabase.llamadas.filter((l) => l.metodo === "update")
    expect(updates.map((l) => [l.tabla, l.args[0]])).toEqual([
      ["creativo_archivos", { orden: 0 }],
      ["creativo_archivos", { orden: 1 }],
    ])
    const filtros = supabase.llamadas
      .filter((l) => l.metodo === "eq" && l.tabla === "creativo_archivos")
      .map((l) => l.args)
    expect(filtros).toEqual([
      ["id", OTRO],
      ["creativo_id", CREATIVO],
      ["id", ARCHIVO],
      ["creativo_id", CREATIVO],
    ])
  })

  it("si la política no deja cambiar una fila, pide volver a leer", async () => {
    supabase.respuestas.push(
      { data: carrusel([primero, segundo]) },
      { data: [] }
    )
    expect(
      await acciones.ordenarArchivosCreativo({
        creativoId: CREATIVO,
        ids: [OTRO, ARCHIVO],
      })
    ).toEqual(fallo(MENSAJES_CREATIVO.ordenFallido))
    expect(supabase.llamadas.filter((l) => l.metodo === "update")).toHaveLength(
      1
    )
  })

  it("traduce el error de la BD", async () => {
    supabase.respuestas.push(
      { data: carrusel([primero, segundo]) },
      { data: null, error: { code: "40001", message: "serialization" } }
    )
    const resultado = await acciones.ordenarArchivosCreativo({
      creativoId: CREATIVO,
      ids: [OTRO, ARCHIVO],
    })
    expect(resultado).toEqual(
      fallo(
        "Otra persona está cambiando este registro. Intenta de nuevo en unos segundos."
      )
    )
  })
})

describe("descartarVersionPendiente", () => {
  const MINIATURA = RUTA.replace(".mp4", "-min.webp")
  const HUERFANO = `oferta/${OFERTA}/${CREATIVO}/0192f1c2-5b6a-7d00-8000-0000000000dd.png`
  const pendiente = (estadoOferta = "PUBLICADA") =>
    filaEdicion(
      {
        version: 2,
        vigente: false,
        activado_at: null,
        archivos: [filaArchivo()],
      },
      estadoOferta
    )
  /** La carpeta de la versión: original, miniatura, una subida sin confirmar y una subcarpeta. */
  const carpeta = {
    data: [
      { id: "o1", name: RUTA.split("/").at(-1) },
      { id: "o2", name: MINIATURA.split("/").at(-1) },
      { id: "o3", name: HUERFANO.split("/").at(-1) },
      { id: null, name: "otra" },
    ],
    error: null,
  }

  it("borra la pendiente con la sesión y limpia su carpeta como servicio", async () => {
    supabase.respuestas.push(
      { data: pendiente() },
      { data: [{ id: CREATIVO }] }
    )
    simulados.list.mockResolvedValue(carpeta)
    servicio.respuestas.push({ data: [] })
    simulados.remove.mockResolvedValue({ data: [], error: null })

    const resultado = await acciones.descartarVersionPendiente({
      creativoId: CREATIVO,
    })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias|ofertas.gestionar"
    )
    expect(resultado).toEqual(exito({ creativoId: CREATIVO, version: 2 }))
    const borrado = supabase.llamadas.find((l) => l.metodo === "delete")
    expect(borrado?.tabla).toBe("creativos")
    expect(simulados.list).toHaveBeenCalledWith(
      `oferta/${OFERTA}/${CREATIVO}`,
      expect.anything()
    )
    expect(servicio.llamadas).toContainEqual({
      tabla: "creativo_archivos",
      metodo: "in",
      args: ["archivo_path", [RUTA, MINIATURA, HUERFANO]],
    })
    expect(simulados.remove).toHaveBeenCalledWith([RUTA, MINIATURA, HUERFANO])
    expect(simulados.refresh).toHaveBeenCalled()
  })

  it("conserva el objeto (y su miniatura) que use otra versión", async () => {
    supabase.respuestas.push(
      { data: pendiente() },
      { data: [{ id: CREATIVO }] }
    )
    simulados.list.mockResolvedValue(carpeta)
    servicio.respuestas.push({ data: [{ archivo_path: RUTA }] })
    simulados.remove.mockResolvedValue({ data: [], error: null })
    await acciones.descartarVersionPendiente({ creativoId: CREATIVO })
    expect(simulados.remove).toHaveBeenCalledWith([HUERFANO])
  })

  it("si no puede comprobarlo, no borra objetos (la versión ya quedó descartada)", async () => {
    supabase.respuestas.push(
      { data: pendiente() },
      { data: [{ id: CREATIVO }] }
    )
    simulados.list.mockResolvedValue(carpeta)
    servicio.respuestas.push({
      data: null,
      error: { code: "57014", message: "timeout" },
    })
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(
      await acciones.descartarVersionPendiente({ creativoId: CREATIVO })
    ).toMatchObject({ ok: true })
    expect(simulados.remove).not.toHaveBeenCalled()
    errores.mockRestore()
  })

  it("solo descarta una versión en preparación", async () => {
    supabase.respuestas.push({ data: filaEdicion() })
    expect(
      await acciones.descartarVersionPendiente({ creativoId: CREATIVO })
    ).toEqual(fallo(MENSAJES_CREATIVO.soloPendiente))
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("delete")
  })

  it("si la política no deja borrar, no toca Storage", async () => {
    supabase.respuestas.push({ data: pendiente() }, { data: [] })
    expect(
      await acciones.descartarVersionPendiente({ creativoId: CREATIVO })
    ).toEqual(fallo(MENSAJES_CREATIVO.noEditable))
    expect(simulados.list).not.toHaveBeenCalled()
    expect(simulados.remove).not.toHaveBeenCalled()
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("con la oferta cerrada no hay nada que descartar", async () => {
    supabase.respuestas.push({ data: pendiente("CERRADA") })
    expect(
      await acciones.descartarVersionPendiente({ creativoId: CREATIVO })
    ).toEqual(fallo(MENSAJES_CREATIVO.noEditable))
    expect(supabase.llamadas.map((l) => l.metodo)).not.toContain("delete")
  })
})
