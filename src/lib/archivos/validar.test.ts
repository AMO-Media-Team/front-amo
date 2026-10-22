import { describe, expect, it, vi } from "vitest"

import { MIB } from "./formato"
import {
  cumpleAspecto,
  describirRelacion,
  ejemploMedidas,
  evaluarArchivo,
  type LectoresArchivo,
  type ReglasArchivo,
  validarArchivo,
} from "./validar"

const ESPACIO = " "

const IMAGENES: ReglasArchivo = {
  mimes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 10 * MIB,
}

const HISTORIA: ReglasArchivo = {
  mimes: ["image/jpeg", "video/mp4"],
  maxBytes: 50 * MIB,
  aspecto: { relacion: 9 / 16, tolerancia: 0.02 },
  duracionMaxSeg: 60,
}

describe("describirRelacion", () => {
  it("nombra las proporciones comunes", () => {
    expect(describirRelacion(9 / 16)).toBe("9:16")
    expect(describirRelacion(1)).toBe("1:1")
    expect(describirRelacion(0.8)).toBe("4:5")
    expect(describirRelacion(16 / 9)).toBe("16:9")
  })

  it("usa decimales con coma para las demás", () => {
    expect(describirRelacion(1.91)).toBe("1,91:1")
    expect(describirRelacion(1 / 2.35)).toBe("1:2,35")
  })

  it("da medidas de ejemplo con 1080 px en el lado corto", () => {
    expect(ejemploMedidas(9 / 16)).toEqual({ ancho: 1080, alto: 1920 })
    expect(ejemploMedidas(16 / 9)).toEqual({ ancho: 1920, alto: 1080 })
    expect(ejemploMedidas(1)).toEqual({ ancho: 1080, alto: 1080 })
  })

  it("aplica la tolerancia relativa", () => {
    const regla = { relacion: 9 / 16, tolerancia: 0.02 }
    expect(cumpleAspecto({ ancho: 1080, alto: 1920 }, regla)).toBe(true)
    expect(cumpleAspecto({ ancho: 1080, alto: 1900 }, regla)).toBe(true)
    expect(cumpleAspecto({ ancho: 1080, alto: 1350 }, regla)).toBe(false)
    expect(cumpleAspecto({ ancho: 0, alto: 1920 }, regla)).toBe(false)
  })
})

describe("evaluarArchivo", () => {
  const base = { nombre: "captura.png", tipo: "image/png", tamano: 2 * MIB }

  it("acepta un archivo válido y devuelve el MIME normalizado", () => {
    expect(
      evaluarArchivo({ ...base, nombre: "x.jpg", tipo: "image/jpg" }, IMAGENES)
    ).toEqual({
      ok: true,
      tipo: "image/jpeg",
      dimensiones: null,
      duracionSeg: null,
    })
  })

  it("rechaza un archivo vacío", () => {
    expect(evaluarArchivo({ ...base, tamano: 0 }, IMAGENES)).toMatchObject({
      ok: false,
      motivo: "vacio",
    })
  })

  it("rechaza el formato y dice cuáles se admiten", () => {
    expect(
      evaluarArchivo(
        { ...base, nombre: "a.pdf", tipo: "application/pdf" },
        IMAGENES
      )
    ).toEqual({
      ok: false,
      motivo: "formato",
      mensaje: "Este formato no se admite. Sube un archivo JPG, PNG o WebP.",
    })
  })

  it("rechaza el peso con las dos cifras", () => {
    expect(evaluarArchivo({ ...base, tamano: 10 * MIB + 1 }, IMAGENES)).toEqual(
      {
        ok: false,
        motivo: "tamano",
        mensaje: `El archivo pesa 10,1${ESPACIO}MB y el máximo es 10${ESPACIO}MB.`,
      }
    )
  })

  it("rechaza la proporción con un ejemplo y la medida real", () => {
    const resultado = evaluarArchivo(
      {
        nombre: "post.jpg",
        tipo: "image/jpeg",
        tamano: MIB,
        dimensiones: { ancho: 1080, alto: 1080 },
      },
      HISTORIA
    )
    expect(resultado).toEqual({
      ok: false,
      motivo: "aspecto",
      mensaje:
        "Debe ser vertical 9:16 (por ejemplo, 1080 × 1920 px); este archivo mide 1080 × 1080 px.",
    })
  })

  it("rechaza la duración de un video", () => {
    expect(
      evaluarArchivo(
        {
          nombre: "reel.mp4",
          tipo: "video/mp4",
          tamano: 20 * MIB,
          dimensiones: { ancho: 1080, alto: 1920 },
          duracionSeg: 92,
        },
        HISTORIA
      )
    ).toEqual({
      ok: false,
      motivo: "duracion",
      mensaje: `El video dura 1${ESPACIO}min 32${ESPACIO}s y el máximo es 1${ESPACIO}min.`,
    })
  })

  it("no exige proporción a un PDF ni duración a una imagen", () => {
    const reglas: ReglasArchivo = {
      mimes: ["application/pdf", "image/jpeg"],
      maxBytes: MIB,
      aspecto: { relacion: 1, tolerancia: 0 },
      duracionMaxSeg: 1,
    }
    expect(
      evaluarArchivo(
        {
          nombre: "a.pdf",
          tipo: "application/pdf",
          tamano: 10,
          dimensiones: { ancho: 1, alto: 9 },
        },
        reglas
      ).ok
    ).toBe(true)
    expect(
      evaluarArchivo(
        { nombre: "a.jpg", tipo: "image/jpeg", tamano: 10, duracionSeg: 99 },
        { ...reglas, aspecto: undefined }
      ).ok
    ).toBe(true)
  })
})

describe("validarArchivo", () => {
  function lectores(
    dimensiones = { ancho: 1080, alto: 1920 },
    duracion = 30
  ): LectoresArchivo {
    return {
      leerDimensiones: vi.fn().mockResolvedValue(dimensiones),
      leerDuracionVideo: vi.fn().mockResolvedValue(duracion),
    }
  }

  it("no lee nada si las reglas no lo necesitan", async () => {
    const lector = lectores()
    const archivo = new File(["x"], "a.png", { type: "image/png" })
    await expect(
      validarArchivo(archivo, IMAGENES, lector)
    ).resolves.toMatchObject({
      ok: true,
    })
    expect(lector.leerDimensiones).not.toHaveBeenCalled()
    expect(lector.leerDuracionVideo).not.toHaveBeenCalled()
  })

  it("no lee nada si ya falla lo barato", async () => {
    const lector = lectores()
    const archivo = new File(["x"], "a.gif", { type: "image/gif" })
    await expect(
      validarArchivo(archivo, HISTORIA, lector)
    ).resolves.toMatchObject({
      ok: false,
      motivo: "formato",
    })
    expect(lector.leerDimensiones).not.toHaveBeenCalled()
  })

  it("lee dimensiones y duración de un video y las devuelve", async () => {
    const lector = lectores({ ancho: 1080, alto: 1920 }, 42.5)
    const archivo = new File(["x"], "reel.mp4", { type: "video/mp4" })
    await expect(validarArchivo(archivo, HISTORIA, lector)).resolves.toEqual({
      ok: true,
      tipo: "video/mp4",
      dimensiones: { ancho: 1080, alto: 1920 },
      duracionSeg: 42.5,
    })
  })

  it("informa un archivo ilegible si el navegador no puede leerlo", async () => {
    const lector: LectoresArchivo = {
      leerDimensiones: vi.fn().mockRejectedValue(new Error("decode")),
      leerDuracionVideo: vi.fn().mockResolvedValue(10),
    }
    const archivo = new File(["x"], "foto.jpg", { type: "image/jpeg" })
    await expect(
      validarArchivo(archivo, HISTORIA, lector)
    ).resolves.toMatchObject({
      ok: false,
      motivo: "ilegible",
    })
  })
})
