import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  archivoPerteneceA,
  asegurarRutaSegura,
  carpetaCapturaCuentaSocial,
  carpetaCreativo,
  carpetaDisputa,
  carpetaDocumentoAnunciante,
  carpetaDocumentoMedio,
  carpetaEvidencia,
  carpetaLogo,
  carpetaSoporte,
  esMiniaturaDe,
  esRutaSegura,
  nuevaRuta,
  perteneceA,
  rutaMiniatura,
} from "./rutas"

const A = "0192f5c4-1111-7aaa-8bbb-000000000001"
const B = "0192f5c4-2222-7aaa-8bbb-000000000002"
const U = "0192f5c4-3333-7aaa-8bbb-000000000003"

describe("esRutaSegura", () => {
  it("rechaza lo mismo que la política «storage: ruta segura» y más", () => {
    for (const ruta of [
      "",
      "/medio/x.pdf",
      "medio//x.pdf",
      "medio/../x.pdf",
      "medio/x/",
      "medio\\x.pdf",
      "medio/x\u0000.pdf",
      "a".repeat(1025),
    ]) {
      expect(esRutaSegura(ruta), JSON.stringify(ruta)).toBe(false)
    }
    expect(esRutaSegura(`medio/${A}/RUT/${U}.pdf`)).toBe(true)
    expect(() => asegurarRutaSegura("../x")).toThrow(/segura/)
  })
})

describe("carpetas por bucket (§8)", () => {
  it("documentos del medio y del anunciante, con tipo del enum", () => {
    expect(carpetaDocumentoMedio(A, "CEDULA_FRENTE")).toEqual({
      bucket: "documentos",
      carpeta: `medio/${A}/CEDULA_FRENTE`,
    })
    expect(carpetaCapturaCuentaSocial(A, B).carpeta).toBe(
      `medio/${A}/cuenta_social/${B}`
    )
    expect(carpetaDocumentoAnunciante(A, "RUT").carpeta).toBe(
      `anunciante/${A}/RUT`
    )
  })

  it("creativos, evidencias, disputas, soportes y logos", () => {
    expect(carpetaCreativo(A, B)).toEqual({
      bucket: "creativos",
      carpeta: `oferta/${A}/${B}`,
    })
    expect(carpetaEvidencia(A, "metrica").carpeta).toBe(
      `asignacion/${A}/metrica`
    )
    expect(carpetaDisputa(A, { interno: false }).carpeta).toBe(`disputa/${A}`)
    expect(carpetaDisputa(A, { interno: true }).carpeta).toBe(
      `disputa/${A}/interno`
    )
    expect(carpetaSoporte("documento_soporte", A)).toEqual({
      bucket: "soportes",
      carpeta: `documento_soporte/${A}`,
    })
    expect(carpetaSoporte("liquidacion", A, "factura").carpeta).toBe(
      `liquidacion/${A}/factura`
    )
    expect(carpetaSoporte("liquidacion", A, "pago").carpeta).toBe(
      `liquidacion/${A}/pago`
    )
    expect(carpetaLogo("medio", A)).toEqual({
      bucket: "avatares",
      carpeta: `medio/${A}`,
      prefijoNombre: "logo-",
    })
  })

  it("normaliza los uuid a minúsculas", () => {
    expect(carpetaEvidencia(A.toUpperCase(), "publicacion").carpeta).toBe(
      `asignacion/${A}/publicacion`
    )
  })

  it("rechaza ids que no son uuid y tipos inexistentes", () => {
    expect(() => carpetaCreativo("../otra", B)).toThrow(/ofertaId/)
    expect(() => carpetaCreativo(A, `${B}/x`)).toThrow(/creativoId/)
    expect(() => carpetaDocumentoMedio(A, "PASAPORTE" as "RUT")).toThrow(/tipo/)
    expect(() => carpetaEvidencia(A, "interno" as "metrica")).toThrow(/tipo/)
    expect(() => carpetaSoporte("otro" as "pago", A)).toThrow(/tipo/)
    expect(() => carpetaSoporte("factura", A, "pago")).toThrow(/subcarpetas/)
    expect(() => carpetaSoporte("liquidacion", A, "otra" as "pago")).toThrow(
      /subcarpeta/
    )
  })
})

describe("nuevaRuta", () => {
  it("usa un uuid nuevo con la extensión del MIME", () => {
    expect(
      nuevaRuta(carpetaEvidencia(A, "publicacion"), "image/webp", U)
    ).toEqual({
      bucket: "evidencias",
      ruta: `asignacion/${A}/publicacion/${U}.webp`,
    })
    expect(nuevaRuta(carpetaCreativo(A, B), "video/quicktime", U).ruta).toBe(
      `oferta/${A}/${B}/${U}.mov`
    )
    expect(nuevaRuta(carpetaLogo("anunciante", A), "image/webp", U).ruta).toBe(
      `anunciante/${A}/logo-${U}.webp`
    )
    expect(nuevaRuta(carpetaSoporte("dispersion", A), "text/csv", U).ruta).toBe(
      `dispersion/${A}/${U}.csv`
    )
    expect(
      nuevaRuta(carpetaSoporte("documento_soporte", A), "application/json", U)
        .ruta
    ).toBe(`documento_soporte/${A}/${U}.json`)
  })

  it("genera uno distinto en cada llamada", () => {
    const carpeta = carpetaEvidencia(A, "metrica")
    expect(nuevaRuta(carpeta, "image/webp").ruta).not.toBe(
      nuevaRuta(carpeta, "image/webp").ruta
    )
  })

  it("rechaza un MIME que el bucket no admite", () => {
    expect(() =>
      nuevaRuta(carpetaEvidencia(A, "publicacion"), "video/mp4", U)
    ).toThrow(/no admite/)
    expect(() =>
      nuevaRuta(carpetaDocumentoMedio(A, "RUT"), "text/html", U)
    ).toThrow(/no admite/)
  })
})

describe("rutaMiniatura", () => {
  it("deriva `{uuid}-min.webp` en la misma carpeta", () => {
    expect(rutaMiniatura(`asignacion/${A}/publicacion/${U}.png`)).toBe(
      `asignacion/${A}/publicacion/${U}-min.webp`
    )
  })

  it("no anida miniaturas ni acepta rutas sin carpeta o sin extensión", () => {
    expect(() =>
      rutaMiniatura(`asignacion/${A}/publicacion/${U}-min.webp`)
    ).toThrow()
    expect(() => rutaMiniatura(`${U}.png`)).toThrow()
    expect(() => rutaMiniatura(`asignacion/${A}/publicacion/${U}`)).toThrow()
  })
})

describe("perteneceA", () => {
  const carpeta = carpetaEvidencia(A, "publicacion")

  it("acepta archivos generados en esa carpeta", () => {
    expect(perteneceA(`asignacion/${A}/publicacion/${U}.webp`, carpeta)).toBe(
      true
    )
    expect(perteneceA(`asignacion/${A}/publicacion/${U}.pdf`, carpeta)).toBe(
      true
    )
  })

  it("rechaza otra asignación, subcarpetas, nombres ajenos, miniaturas y extensiones del bucket que no son", () => {
    for (const ruta of [
      `asignacion/${B}/publicacion/${U}.webp`,
      `asignacion/${A}/metrica/${U}.webp`,
      `asignacion/${A}/publicacion/x/${U}.webp`,
      `asignacion/${A}/publicacion/foto.webp`,
      `asignacion/${A}/publicacion/${U}-min.webp`,
      `asignacion/${A}/publicacion/${U}.mp4`,
      `asignacion/${A}/publicacion/${U}.webp.exe`,
      `asignacion/${A}/publicacion/../publicacion/${U}.webp`,
      `muestras/1.webp`,
    ]) {
      expect(perteneceA(ruta, carpeta), ruta).toBe(false)
    }
  })

  it("exige el prefijo de los logos", () => {
    const logos = carpetaLogo("medio", A)
    expect(perteneceA(`medio/${A}/logo-${U}.webp`, logos)).toBe(true)
    expect(perteneceA(`medio/${A}/${U}.webp`, logos)).toBe(false)
  })
})

describe("archivoPerteneceA", () => {
  const carpeta = carpetaEvidencia(A, "publicacion")
  const ruta = `asignacion/${A}/publicacion/${U}.png`

  it("acepta el archivo con o sin su propia miniatura", () => {
    expect(
      esMiniaturaDe(`asignacion/${A}/publicacion/${U}-min.webp`, ruta)
    ).toBe(true)
    expect(
      archivoPerteneceA(
        { bucket: "evidencias", ruta, rutaMiniatura: null },
        carpeta
      )
    ).toBe(true)
    expect(
      archivoPerteneceA(
        {
          bucket: "evidencias",
          ruta,
          rutaMiniatura: `asignacion/${A}/publicacion/${U}-min.webp`,
        },
        carpeta
      )
    ).toBe(true)
  })

  it("rechaza otro bucket, una miniatura ajena o una ruta que no es nuestra", () => {
    for (const archivo of [
      { bucket: "documentos", ruta, rutaMiniatura: null },
      {
        bucket: "evidencias",
        ruta,
        rutaMiniatura: `asignacion/${A}/publicacion/${B}-min.webp`,
      },
      {
        bucket: "evidencias",
        ruta,
        rutaMiniatura: `asignacion/${B}/publicacion/${U}-min.webp`,
      },
      {
        bucket: "evidencias",
        ruta: `asignacion/${A}/publicacion/${U}-min.webp`,
        rutaMiniatura: null,
      },
    ]) {
      expect(archivoPerteneceA(archivo, carpeta), JSON.stringify(archivo)).toBe(
        false
      )
    }
    expect(esMiniaturaDe("x-min.webp", "sin-carpeta.png")).toBe(false)
  })
})
