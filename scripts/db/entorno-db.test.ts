import { describe, expect, it } from "vitest"

import {
  entornoDeArgumentos,
  ErrorEntornoDb,
  redactar,
  URL_DB_LOCAL,
  urlDb,
  validarUrlDb,
} from "./entorno-db"

const URL_DEVELOP =
  "postgresql://postgres.depbmnlpfnrcsbqlwxxd:Clave123abc@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

describe("entornoDeArgumentos", () => {
  it("toma el primer argumento que no es una opción", () => {
    expect(entornoDeArgumentos(["--dry-run", "develop"])).toBe("develop")
    expect(entornoDeArgumentos(["produccion", "x.sql"])).toBe("produccion")
  })

  it("exige un entorno conocido, sin valor por omisión", () => {
    expect(() => entornoDeArgumentos([])).toThrow(ErrorEntornoDb)
    expect(() => entornoDeArgumentos(["staging"])).toThrow(
      /develop \| produccion/
    )
  })

  it("acepta la pila local, que no lee archivo", () => {
    expect(entornoDeArgumentos(["local"])).toBe("local")
    expect(urlDb("local")).toBe(URL_DB_LOCAL)
  })
})

describe("validarUrlDb", () => {
  it("acepta el Session pooler del entorno", () => {
    expect(validarUrlDb(URL_DEVELOP, "develop")).toBe(URL_DEVELOP)
  })

  it("rechaza el usuario de otro proyecto sin mostrar la URL", () => {
    const intento = () => validarUrlDb(URL_DEVELOP, "produccion")
    expect(intento).toThrow(/postgres\.oriuuuaczpncmtglfgpv/)
    expect(intento).not.toThrow(/Clave123abc/)
  })

  it("rechaza el Transaction pooler y las contraseñas que requieren codificación", () => {
    expect(() =>
      validarUrlDb(URL_DEVELOP.replace(":5432/", ":6543/"), "develop")
    ).toThrow(/5432/)
    expect(() =>
      validarUrlDb(
        URL_DEVELOP.replace("Clave123abc", "Cl%40ve123abc"),
        "develop"
      )
    ).toThrow(/codificar/)
  })

  it("rechaza una URL ausente o inválida", () => {
    expect(() => validarUrlDb(undefined, "develop")).toThrow(/Falta/)
    expect(() => validarUrlDb("no es url", "develop")).toThrow(/no es una URL/)
  })
})

describe("redactar", () => {
  it("quita la URL y la contraseña de cualquier texto", () => {
    const texto = `fallo con ${URL_DEVELOP} y clave Clave123abc`
    const limpio = redactar(texto, URL_DEVELOP)
    expect(limpio).not.toContain("Clave123abc")
    expect(limpio).toContain("«redactado»")
  })

  it("deja el texto igual sin URL", () => {
    expect(redactar("sin secretos", undefined)).toBe("sin secretos")
  })
})
