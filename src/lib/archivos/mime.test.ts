import { describe, expect, it } from "vitest"

import {
  aceptarDe,
  atributoAccept,
  categoriaDe,
  describirFormatos,
  extensionDeMime,
  extensionDeNombre,
  mensajeFormatoNoAdmitido,
  mimeDeArchivo,
  nombreConExtension,
} from "./mime"

describe("mimeDeArchivo", () => {
  it("respeta el MIME conocido que reporta el navegador", () => {
    expect(mimeDeArchivo({ name: "a.bin", type: "image/png" })).toBe(
      "image/png"
    )
  })

  it("normaliza los alias", () => {
    expect(mimeDeArchivo({ name: "a.jpg", type: "image/jpg" })).toBe(
      "image/jpeg"
    )
    expect(mimeDeArchivo({ name: "a.heif", type: "image/heif" })).toBe(
      "image/heic"
    )
    expect(mimeDeArchivo({ name: "a", type: "IMAGE/JPEG " })).toBe("image/jpeg")
  })

  it("deduce por la extensión cuando el tipo está vacío o es genérico", () => {
    expect(mimeDeArchivo({ name: "Foto.HEIC", type: "" })).toBe("image/heic")
    expect(
      mimeDeArchivo({ name: "video.mov", type: "application/octet-stream" })
    ).toBe("video/quicktime")
    // Windows reporta los CSV como hoja de Excel.
    expect(
      mimeDeArchivo({ name: "pagos.csv", type: "application/vnd.ms-excel" })
    ).toBe("text/csv")
  })

  it("deja el tipo desconocido para que la validación lo rechace", () => {
    expect(mimeDeArchivo({ name: "a.exe", type: "" })).toBe("")
    expect(mimeDeArchivo({ name: "a.docx", type: "application/msword" })).toBe(
      "application/msword"
    )
  })
})

describe("nombres y extensiones", () => {
  it("lee la extensión sin punto y en minúsculas", () => {
    expect(extensionDeNombre("Foto.Final.JPG")).toBe("jpg")
    expect(extensionDeNombre("sin-extension")).toBe("")
    expect(extensionDeNombre(".oculto")).toBe("")
    expect(extensionDeNombre("punto.")).toBe("")
  })

  it("cambia la extensión conservando el nombre", () => {
    expect(nombreConExtension("Foto final.JPG", "webp")).toBe("Foto final.webp")
    expect(nombreConExtension("captura", "webp")).toBe("captura.webp")
  })

  it("guarda con la primera extensión del formato", () => {
    expect(extensionDeMime("image/jpeg")).toBe("jpg")
    expect(extensionDeMime("video/quicktime")).toBe("mov")
  })
})

describe("textos y accept", () => {
  it("describe los formatos con disyunción en español", () => {
    expect(describirFormatos(["image/jpeg", "image/png", "image/webp"])).toBe(
      "JPG, PNG o WebP"
    )
    expect(describirFormatos(["application/pdf"])).toBe("PDF")
  })

  it("rechaza el formato con los admitidos", () => {
    expect(mensajeFormatoNoAdmitido(["application/pdf", "image/jpeg"])).toBe(
      "Este formato no se admite. Sube un archivo PDF o JPG."
    )
  })

  it("arma el accept de react-dropzone y del input nativo", () => {
    expect(aceptarDe(["image/jpeg", "application/pdf"])).toEqual({
      "image/jpeg": [".jpg", ".jpeg"],
      "application/pdf": [".pdf"],
    })
    expect(atributoAccept(["image/png"])).toBe("image/png,.png")
  })

  it("clasifica por categoría", () => {
    expect(categoriaDe("image/gif")).toBe("imagen")
    expect(categoriaDe("video/mp4")).toBe("video")
    expect(categoriaDe("application/pdf")).toBe("pdf")
    expect(categoriaDe("text/csv")).toBe("otro")
  })
})
