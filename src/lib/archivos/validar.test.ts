import { describe, expect, it, vi } from "vitest"

import { MIB } from "./formato"
import {
  cumpleAlgunAspecto,
  cumpleAspecto,
  describirAspectos,
  describirRelacion,
  ejemploMedidas,
  evaluarArchivo,
  type LectoresArchivo,
  reglasDeAspecto,
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

const POST_FEED: ReglasArchivo = {
  mimes: ["image/jpeg", "image/png", "video/mp4"],
  maxBytes: 50 * MIB,
  aspecto: [
    { relacion: 1, tolerancia: 0.02 },
    { relacion: 0.8, tolerancia: 0.02 },
    { relacion: 1.91, tolerancia: 0.02 },
  ],
}

describe("varias proporciones", () => {
  it("normaliza una regla o varias a una lista", () => {
    expect(reglasDeAspecto(undefined)).toEqual([])
    expect(reglasDeAspecto({ relacion: 1, tolerancia: 0 })).toEqual([
      { relacion: 1, tolerancia: 0 },
    ])
    expect(reglasDeAspecto(POST_FEED.aspecto)).toHaveLength(3)
  })

  it("basta con cumplir una; sin reglas vale cualquiera", () => {
    const reglas = reglasDeAspecto(POST_FEED.aspecto)
    expect(cumpleAlgunAspecto({ ancho: 1080, alto: 1350 }, reglas)).toBe(true)
    expect(cumpleAlgunAspecto({ ancho: 1910, alto: 1000 }, reglas)).toBe(true)
    expect(cumpleAlgunAspecto({ ancho: 1080, alto: 1920 }, reglas)).toBe(false)
    expect(cumpleAlgunAspecto({ ancho: 1, alto: 9 }, [])).toBe(true)
  })

  it("las describe con la orientación en el género de la pieza", () => {
    const reglas = reglasDeAspecto(POST_FEED.aspecto)
    expect(describirAspectos(reglas)).toBe(
      "cuadrado 1:1, vertical 4:5 u horizontal 1,91:1"
    )
    expect(describirAspectos(reglas, "femenino")).toBe(
      "cuadrada 1:1, vertical 4:5 u horizontal 1,91:1"
    )
  })

  it("rechaza con todas las admitidas y la medida del archivo", () => {
    expect(
      evaluarArchivo(
        {
          nombre: "historia.png",
          tipo: "image/png",
          tamano: MIB,
          dimensiones: { ancho: 1080, alto: 1920 },
        },
        POST_FEED
      )
    ).toEqual({
      ok: false,
      motivo: "aspecto",
      mensaje:
        "Debe ser cuadrado 1:1, vertical 4:5 u horizontal 1,91:1; este archivo mide 1080 × 1920 px.",
    })
  })
})

describe("rechazo con el nombre de la pieza", () => {
  const REEL: ReglasArchivo = {
    mimes: ["video/mp4"],
    maxBytes: 50 * MIB,
    aspecto: [{ relacion: 9 / 16, tolerancia: 0.02 }],
    pieza: "Un reel",
  }

  it("dice qué necesita el reel y qué es el video", () => {
    expect(
      evaluarArchivo(
        {
          nombre: "horizontal.mp4",
          tipo: "video/mp4",
          tamano: MIB,
          dimensiones: { ancho: 1920, alto: 1080 },
        },
        REEL
      )
    ).toEqual({
      ok: false,
      motivo: "aspecto",
      mensaje:
        "Un reel necesita video vertical 9:16 (por ejemplo, 1080 × 1920 px); el tuyo es horizontal 16:9 (1920 × 1080 px).",
    })
  })

  it("concuerda en femenino con una imagen y lista varias proporciones", () => {
    expect(
      evaluarArchivo(
        {
          nombre: "foto.jpg",
          tipo: "image/jpeg",
          tamano: MIB,
          dimensiones: { ancho: 1080, alto: 1920 },
        },
        { ...POST_FEED, pieza: "Un post de feed" }
      )
    ).toMatchObject({
      motivo: "aspecto",
      mensaje:
        "Un post de feed necesita imagen cuadrada 1:1, vertical 4:5 u horizontal 1,91:1; la tuya es vertical 9:16 (1080 × 1920 px).",
    })
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

  it("compara la duración con dos decimales, como la BD", () => {
    const video = {
      nombre: "historia.mp4",
      tipo: "video/mp4",
      tamano: MIB,
      dimensiones: { ancho: 1080, alto: 1920 },
    }
    expect(evaluarArchivo({ ...video, duracionSeg: 60.004 }, HISTORIA).ok).toBe(
      true
    )
    expect(evaluarArchivo({ ...video, duracionSeg: 60.4 }, HISTORIA)).toEqual({
      ok: false,
      motivo: "duracion",
      mensaje: `El video dura 60,4${ESPACIO}s y el máximo es 1${ESPACIO}min.`,
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

  it("con medidas obligatorias lee dimensiones y duración aunque no haya reglas", async () => {
    const lector = lectores({ ancho: 1920, alto: 1080 }, 12)
    const reglas: ReglasArchivo = {
      mimes: ["video/mp4", "image/png"],
      maxBytes: 50 * MIB,
      medidasObligatorias: true,
    }
    await expect(
      validarArchivo(
        new File(["x"], "clip.mp4", { type: "video/mp4" }),
        reglas,
        lector
      )
    ).resolves.toEqual({
      ok: true,
      tipo: "video/mp4",
      dimensiones: { ancho: 1920, alto: 1080 },
      duracionSeg: 12,
    })
    expect(lector.leerDuracionVideo).toHaveBeenCalledOnce()

    const imagen = lectores({ ancho: 800, alto: 600 })
    await validarArchivo(
      new File(["x"], "a.png", { type: "image/png" }),
      reglas,
      imagen
    )
    expect(imagen.leerDimensiones).toHaveBeenCalledOnce()
    expect(imagen.leerDuracionVideo).not.toHaveBeenCalled()
  })

  it("con medidas obligatorias rechaza un video sin duración legible", async () => {
    const lector: LectoresArchivo = {
      leerDimensiones: vi.fn().mockResolvedValue({ ancho: 1080, alto: 1920 }),
      leerDuracionVideo: vi.fn().mockRejectedValue(new Error("sin duración")),
    }
    await expect(
      validarArchivo(
        new File(["x"], "clip.mov", { type: "video/quicktime" }),
        {
          mimes: ["video/quicktime"],
          maxBytes: MIB,
          medidasObligatorias: true,
        },
        lector
      )
    ).resolves.toMatchObject({ ok: false, motivo: "ilegible" })
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
