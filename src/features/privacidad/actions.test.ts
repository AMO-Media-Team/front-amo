// @vitest-environment node
/**
 * Supresión de datos del titular con el DAL, la RPC, la lectura de la
 * solicitud y Storage simulados: tras ejecutarla, el servidor borra solo lo
 * del titular (la carpeta completa del medio, solo si la BD decidió borrarlo)
 * y registra en la BD lo que siguió en Storage; «Reintentar el borrado» vuelve
 * a borrar solo lo que la BD pidió al ejecutarla.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SolicitudParaAccion } from "./queries"
import type { ArchivoSupresion, ResultadoSupresion } from "./tipos"

const SOLICITUD = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const PERFIL = "0192f3a4-5b6c-7d8e-9f01-0000000000b1"
const MEDIO = "e2e00000-0000-4000-8000-00000000b001"
const OTRO_MEDIO = "e2e00000-0000-4000-8000-00000000b002"

const AVATAR: ArchivoSupresion = {
  bucket: "avatares",
  prefijo: `perfil/${PERFIL}/`,
}
const CARPETA: ArchivoSupresion = {
  bucket: "documentos",
  prefijo: `medio/${MEDIO}/`,
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  respuestaSuprimir: null as unknown,
  solicitud: null as unknown,
  listados: [] as string[],
  borrados: [] as string[],
  falloListar: new Set<string>(),
  refrescos: 0,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  refresh: () => {
    estado.refrescos += 1
  },
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u-equipo" }
  }),
}))
vi.mock("@/lib/auth/registro", () => ({ registrarEvento: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }))
vi.mock("./queries", () => ({
  solicitudParaAccion: vi.fn(async () => estado.solicitud),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => ({
    actorId: "u-equipo",
    sessionId: "s1",
    admin: {
      rpc: async (nombre: string, argumentos: Record<string, unknown>) => {
        estado.rpc.push({ nombre, argumentos })
        return nombre === "suprimir_titular_srv"
          ? { data: estado.respuestaSuprimir, error: null }
          : { data: null, error: null }
      },
      storage: {
        from: (bucket: string) => ({
          list: async (carpeta: string) => {
            estado.listados.push(`${bucket}:${carpeta}`)
            if (estado.falloListar.has(bucket)) {
              return { data: null, error: { message: "503" } }
            }
            return {
              data: [{ id: "o1", name: "archivo.webp" }],
              error: null,
            }
          },
          remove: async (rutas: string[]) => {
            estado.borrados.push(...rutas.map((ruta) => `${bucket}:${ruta}`))
            return { data: rutas.map((name) => ({ name })), error: null }
          },
        }),
      },
    },
  })),
}))

import { ejecutarSupresion, reintentarBorradoArchivos } from "./actions"

function respuesta(
  medio: ResultadoSupresion["medio"],
  archivos: ArchivoSupresion[]
) {
  return {
    solicitud: 41,
    bloqueos: [],
    cuenta: "BORRAR",
    medio,
    contacto_empresa: "NINGUNO",
    solicitudes_vinculacion: 0,
    archivos,
    se_conserva: [],
  }
}

function solicitud(
  cambios: Partial<SolicitudParaAccion> = {}
): SolicitudParaAccion {
  return {
    id: SOLICITUD,
    numero: 41,
    tipo: "SUPRESION",
    estado: "RESPONDIDA",
    perfilId: PERFIL,
    medioId: MEDIO,
    evidenciaPath: null,
    supresionEjecutadaAt: null,
    supresionResultado: null,
    ...cambios,
  }
}

function registrado(): unknown {
  return estado.rpc.find(
    (llamada) => llamada.nombre === "registrar_archivos_supresion_srv"
  )?.argumentos.p_pendientes
}

beforeEach(() => {
  estado.orden = []
  estado.rpc = []
  estado.listados = []
  estado.borrados = []
  estado.falloListar = new Set()
  estado.refrescos = 0
  estado.solicitud = solicitud()
})

describe("ejecutarSupresion", () => {
  it("borra lo del titular y registra lo que Storage no dejó borrar", async () => {
    estado.respuestaSuprimir = respuesta("BORRAR", [AVATAR, CARPETA])
    estado.falloListar.add("documentos")
    const resultado = await ejecutarSupresion({
      solicitudId: SOLICITUD,
      radicado: "41",
    })
    expect(estado.orden[0]).toBe("dal:privacidad.gestionar")
    expect(resultado).toMatchObject({
      ok: true,
      datos: {
        archivosBorrados: 1,
        archivosPendientes: 1,
        archivosRechazados: 0,
        resultado: { archivosPendientes: [CARPETA] },
      },
    })
    expect(estado.borrados).toEqual([`avatares:perfil/${PERFIL}/archivo.webp`])
    expect(registrado()).toEqual([CARPETA])
  })

  it("con el medio anonimizado no toca la carpeta completa aunque la BD la pida", async () => {
    estado.respuestaSuprimir = respuesta("ANONIMIZAR", [CARPETA])
    const resultado = await ejecutarSupresion({
      solicitudId: SOLICITUD,
      radicado: "41",
    })
    expect(resultado).toMatchObject({
      ok: true,
      datos: { archivosBorrados: 0, archivosRechazados: 1 },
    })
    expect(estado.listados).toEqual([])
    expect(estado.borrados).toEqual([])
    expect(registrado()).toEqual([])
  })

  it("no borra los documentos de otro medio", async () => {
    estado.respuestaSuprimir = respuesta("BORRAR", [
      { bucket: "documentos", prefijo: `medio/${OTRO_MEDIO}/` },
    ])
    const resultado = await ejecutarSupresion({
      solicitudId: SOLICITUD,
      radicado: "41",
    })
    expect(resultado).toMatchObject({
      ok: true,
      datos: { archivosRechazados: 1 },
    })
    expect(estado.listados).toEqual([])
  })
})

describe("reintentarBorradoArchivos", () => {
  it("borra solo los pendientes que la BD pidió al ejecutar y registra lo que queda", async () => {
    const ajeno = { bucket: "documentos", prefijo: `medio/${OTRO_MEDIO}/` }
    estado.solicitud = solicitud({
      perfilId: null,
      medioId: null,
      supresionEjecutadaAt: "2026-10-24T15:00:00Z",
      supresionResultado: {
        solicitud: 41,
        bloqueos: [],
        cuenta: "BORRAR",
        medio: "BORRAR",
        medioId: null,
        contactoEmpresa: "NINGUNO",
        solicitudesVinculacion: 0,
        archivos: [AVATAR, CARPETA],
        archivosPendientes: [CARPETA, ajeno],
        archivosRevisadosAt: null,
        seConserva: [],
        simulacion: false,
      },
    })
    const resultado = await reintentarBorradoArchivos({
      solicitudId: SOLICITUD,
    })
    expect(estado.orden[0]).toBe("dal:privacidad.gestionar")
    expect(resultado).toEqual({
      ok: true,
      datos: {
        archivosBorrados: 1,
        archivosPendientes: 0,
        archivosRechazados: 1,
      },
    })
    expect(estado.listados).toEqual([`documentos:medio/${MEDIO}`])
    expect(registrado()).toEqual([])
    expect(estado.refrescos).toBe(1)
  })

  it("sin supresión ejecutada no toca Storage", async () => {
    const resultado = await reintentarBorradoArchivos({
      solicitudId: SOLICITUD,
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(estado.listados).toEqual([])
    expect(estado.rpc).toEqual([])
  })
})
