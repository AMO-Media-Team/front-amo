import { describe, expect, it } from "vitest"

import { MENSAJES_CREATIVO } from "./errores"
import {
  aVersionCreativo,
  type FilaArchivo,
  type FilaCreativo,
  limitesDeConfiguracion,
  ordenarVersiones,
  resolverEdicion,
  versionEditable,
} from "./filas"
import { LIMITES_POR_DEFECTO } from "./formatos"
import { versionPrueba } from "./fixtures"

function filaArchivo(cambios: Partial<FilaArchivo>): FilaArchivo {
  return {
    id: "a",
    archivo_path: "oferta/o/c/a.jpg",
    mime: "image/jpeg",
    tamano_bytes: 100,
    ancho: 1080,
    alto: 1080,
    duracion_segundos: null,
    orden: 0,
    sha256: null,
    created_at: "2026-10-22T10:00:00+00:00",
    ...cambios,
  }
}

const FILA: FilaCreativo = {
  id: "c",
  oferta_id: "o",
  version: 2,
  tipo: "CARRUSEL",
  vigente: false,
  activado_at: null,
  copy_sugerido: null,
  hashtags: ["#Publicidad"],
  menciones: [],
  enlace_destino: null,
  created_at: "2026-10-22T09:00:00+00:00",
  archivos: [
    filaArchivo({ id: "b", orden: 1 }),
    filaArchivo({
      id: "c2",
      orden: 0,
      created_at: "2026-10-22T10:00:05+00:00",
    }),
    filaArchivo({ id: "a", orden: 0, duracion_segundos: 12.5 }),
  ],
}

describe("aVersionCreativo", () => {
  it("marca la pendiente y ordena por orden y llegada", () => {
    const version = aVersionCreativo(FILA)
    expect(version.pendiente).toBe(true)
    expect(version.archivos.map((archivo) => archivo.id)).toEqual([
      "a",
      "c2",
      "b",
    ])
    expect(version.archivos[0]).toMatchObject({
      ruta: "oferta/o/c/a.jpg",
      tamanoBytes: 100,
      duracionSegundos: 12.5,
    })
  })

  it("tolera un embebido nulo", () => {
    expect(aVersionCreativo({ ...FILA, archivos: null }).archivos).toEqual([])
  })

  it("ordena las versiones de la más nueva a la más vieja", () => {
    expect(
      ordenarVersiones([
        versionPrueba({ version: 1 }),
        versionPrueba({ version: 3 }),
        versionPrueba({ version: 2 }),
      ]).map((version) => version.version)
    ).toEqual([3, 2, 1])
  })
})

describe("qué versión se edita", () => {
  const vigente = versionPrueba({ id: "v1", vigente: true, pendiente: false })
  const pendiente = versionPrueba({
    id: "v2",
    version: 2,
    vigente: false,
    pendiente: true,
    activadoAt: null,
  })

  it("la vigente sin publicar y la pendiente publicada", () => {
    expect(versionEditable(vigente, "BORRADOR")).toBe(true)
    expect(versionEditable(vigente, "DEVUELTA")).toBe(true)
    expect(versionEditable(vigente, "PUBLICADA")).toBe(false)
    expect(versionEditable(pendiente, "EN_EJECUCION")).toBe(true)
    expect(versionEditable(pendiente, "CANCELADA")).toBe(false)
  })

  it("sin publicar edita la vigente (o crea la primera)", () => {
    expect(
      resolverEdicion([vigente], "BORRADOR", { puedeGestionar: true })
    ).toEqual({
      vigente,
      editable: vigente,
      bloqueo: null,
      admiteVersionNueva: false,
      bloqueoActivacion: null,
    })
    expect(
      resolverEdicion([], "DEVUELTA", { puedeGestionar: true }).editable
    ).toBeNull()
  })

  it("publicada: edita la pendiente o permite crearla", () => {
    expect(
      resolverEdicion([pendiente, vigente], "PUBLICADA", {
        puedeGestionar: true,
      }).editable
    ).toBe(pendiente)
    expect(
      resolverEdicion([vigente], "CUPOS_COMPLETOS", { puedeGestionar: true })
    ).toEqual({
      vigente,
      editable: null,
      bloqueo: MENSAJES_CREATIVO.publicada,
      admiteVersionNueva: true,
      bloqueoActivacion: null,
    })
  })

  it("publicada: el anunciante sin empresa verificada prepara pero no activa", () => {
    const suspendida = resolverEdicion([pendiente, vigente], "EN_EJECUCION", {
      puedeGestionar: true,
      estadoEmpresa: "SUSPENDIDO",
    })
    expect(suspendida.editable).toBe(pendiente)
    expect(suspendida.bloqueoActivacion).toBe(
      MENSAJES_CREATIVO.empresaSuspendida
    )
    expect(
      resolverEdicion([vigente], "PUBLICADA", {
        puedeGestionar: true,
        estadoEmpresa: "PENDIENTE",
      })
    ).toMatchObject({
      admiteVersionNueva: true,
      bloqueoActivacion: MENSAJES_CREATIVO.empresaSinVerificar,
    })
    // Sin poder leer la empresa, tampoco (la BD lo rechazaría).
    expect(
      resolverEdicion([vigente], "PUBLICADA", {
        puedeGestionar: true,
        estadoEmpresa: null,
      }).bloqueoActivacion
    ).toBe(MENSAJES_CREATIVO.empresaSinVerificar)
    expect(
      resolverEdicion([vigente], "PUBLICADA", {
        puedeGestionar: true,
        estadoEmpresa: "VERIFICADO",
      }).bloqueoActivacion
    ).toBeNull()
    // Sin publicar no hay nada que activar; el equipo AMO no lo necesita.
    expect(
      resolverEdicion([vigente], "BORRADOR", {
        puedeGestionar: true,
        estadoEmpresa: "SUSPENDIDO",
      }).bloqueoActivacion
    ).toBeNull()
    expect(
      resolverEdicion([pendiente, vigente], "PUBLICADA", {
        puedeGestionar: true,
      }).bloqueoActivacion
    ).toBeNull()
  })

  it("explica por qué no se edita", () => {
    expect(
      resolverEdicion([vigente], "EN_REVISION", { puedeGestionar: true })
        .bloqueo
    ).toBe(MENSAJES_CREATIVO.enRevision)
    expect(
      resolverEdicion([vigente], "CERRADA", { puedeGestionar: true }).bloqueo
    ).toBe(MENSAJES_CREATIVO.cerrada)
    expect(
      resolverEdicion([vigente], "BORRADOR", { puedeGestionar: false }).bloqueo
    ).toBe(MENSAJES_CREATIVO.soloLectura)
    expect(
      resolverEdicion([vigente], "BORRADOR", {
        puedeGestionar: true,
        archivada: true,
      }).bloqueo
    ).toBe(MENSAJES_CREATIVO.cerrada)
  })
})

describe("limitesDeConfiguracion", () => {
  it("lee números o textos dentro de su rango", () => {
    expect(
      limitesDeConfiguracion(
        [
          { clave: "archivos.max_creativo_mb", valor: "25" },
          { clave: "archivos.tolerancia_aspecto", valor: 0.05 },
        ],
        LIMITES_POR_DEFECTO
      )
    ).toEqual({ maxCreativoMb: 25, toleranciaAspecto: 0.05 })
  })

  it("lo ilegible o fuera de rango toma el valor de la semilla", () => {
    expect(
      limitesDeConfiguracion(
        [
          { clave: "archivos.max_creativo_mb", valor: 500 },
          { clave: "archivos.tolerancia_aspecto", valor: "x" },
        ],
        LIMITES_POR_DEFECTO
      )
    ).toEqual(LIMITES_POR_DEFECTO)
    expect(limitesDeConfiguracion([], LIMITES_POR_DEFECTO)).toEqual(
      LIMITES_POR_DEFECTO
    )
  })
})
