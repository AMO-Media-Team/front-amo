// @vitest-environment node
/**
 * Toda página privada y toda Server Action autoriza con el DAL: el proxy solo
 * redirige de forma optimista y un cambio en su matcher no debe dejar rutas
 * abiertas (docs/modelo-datos.md §2.6). Este test analiza el código fuente.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const RAIZ = path.resolve(__dirname, "../../..")
const MODULO_DAL = "@/lib/auth/dal"

const GUARDAS_PAGINA = ["requerirUsuario", "requerirPermiso", "requerirTipoRol"]
const GUARDAS_ACCION = [
  ...GUARDAS_PAGINA,
  "requerirPaso",
  "requerirSesionDeEnlace",
]

/** Acciones que por naturaleza se usan sin sesión (o para cerrarla). */
const ACCIONES_PUBLICAS: Readonly<Record<string, readonly string[]>> = {
  "src/features/auth/actions.ts": [
    "iniciarSesion",
    "solicitarRecuperacion",
    "confirmarEnlace",
    "cerrarSesion",
  ],
}

function archivos(directorio: string, filtro: (ruta: string) => boolean) {
  return readdirSync(path.join(RAIZ, directorio), { recursive: true })
    .map((relativa) =>
      path.join(directorio, String(relativa)).split(path.sep).join("/")
    )
    .filter(filtro)
    .sort()
}

function analizar(ruta: string, codigo: string): ts.SourceFile {
  return ts.createSourceFile(
    ruta,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

/** Nombres importados desde el DAL (respeta alias: `import { a as b }`). */
function importadosDelDal(fuente: ts.SourceFile): Map<string, string> {
  const locales = new Map<string, string>()
  for (const sentencia of fuente.statements) {
    if (
      ts.isImportDeclaration(sentencia) &&
      ts.isStringLiteral(sentencia.moduleSpecifier) &&
      sentencia.moduleSpecifier.text === MODULO_DAL
    ) {
      const nombres = sentencia.importClause?.namedBindings
      if (nombres && ts.isNamedImports(nombres)) {
        for (const elemento of nombres.elements) {
          locales.set(
            elemento.name.text,
            (elemento.propertyName ?? elemento.name).text
          )
        }
      }
    }
  }
  return locales
}

function llamaAGuarda(
  cuerpo: ts.Node,
  importados: Map<string, string>,
  guardas: readonly string[]
): boolean {
  let encontrada = false
  const visitar = (nodo: ts.Node) => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isIdentifier(nodo.expression) &&
      guardas.includes(importados.get(nodo.expression.text) ?? "")
    ) {
      encontrada = true
    }
    if (!encontrada) ts.forEachChild(nodo, visitar)
  }
  visitar(cuerpo)
  return encontrada
}

function tieneModificador(nodo: ts.Node, tipo: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(nodo) &&
    (ts.getModifiers(nodo) ?? []).some(
      (modificador) => modificador.kind === tipo
    )
  )
}

/** Cuerpos de las funciones exportadas, por nombre (`default` para la exportación por defecto). */
function funcionesExportadas(fuente: ts.SourceFile): Map<string, ts.Node> {
  const funciones = new Map<string, ts.Node>()
  for (const sentencia of fuente.statements) {
    if (!tieneModificador(sentencia, ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isFunctionDeclaration(sentencia) && sentencia.body) {
      const nombre = tieneModificador(sentencia, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : (sentencia.name?.text ?? "default")
      funciones.set(nombre, sentencia.body)
    }
    if (ts.isVariableStatement(sentencia)) {
      for (const declaracion of sentencia.declarationList.declarations) {
        const valor = declaracion.initializer
        if (
          ts.isIdentifier(declaracion.name) &&
          valor &&
          (ts.isArrowFunction(valor) || ts.isFunctionExpression(valor))
        ) {
          funciones.set(declaracion.name.text, valor.body)
        }
      }
    }
  }
  return funciones
}

function esArchivoUseServer(fuente: ts.SourceFile): boolean {
  const primera = fuente.statements[0]
  return (
    !!primera &&
    ts.isExpressionStatement(primera) &&
    ts.isStringLiteral(primera.expression) &&
    primera.expression.text === "use server"
  )
}

/** Páginas cuya exportación por defecto no invoca una guarda del DAL. */
function paginaSinGuarda(ruta: string, codigo: string): boolean {
  const fuente = analizar(ruta, codigo)
  const cuerpo = funcionesExportadas(fuente).get("default")
  return (
    !cuerpo || !llamaAGuarda(cuerpo, importadosDelDal(fuente), GUARDAS_PAGINA)
  )
}

/** Acciones exportadas que no invocan una guarda del DAL. */
function accionesSinGuarda(
  ruta: string,
  codigo: string,
  publicas: readonly string[] = []
): string[] {
  const fuente = analizar(ruta, codigo)
  const importados = importadosDelDal(fuente)
  return [...funcionesExportadas(fuente)]
    .filter(([nombre]) => !publicas.includes(nombre))
    .filter(([, cuerpo]) => !llamaAGuarda(cuerpo, importados, GUARDAS_ACCION))
    .map(([nombre]) => nombre)
}

const leer = (ruta: string) => readFileSync(path.join(RAIZ, ruta), "utf8")

describe("verificador de guardas (casos de control)", () => {
  it("detecta una página sin guarda y acepta una con guarda con alias", () => {
    expect(
      paginaSinGuarda(
        "p.tsx",
        "export default async function P() { return null }"
      )
    ).toBe(true)
    expect(
      paginaSinGuarda(
        "p.tsx",
        `import { requerirPermiso as permiso } from "@/lib/auth/dal"
         export default async function P() { await permiso("roles.ver"); return null }`
      )
    ).toBe(false)
    // Llamar una función homónima que no viene del DAL no cuenta.
    expect(
      paginaSinGuarda(
        "p.tsx",
        `const requerirUsuario = async () => null
         export default async function P() { await requerirUsuario(); return null }`
      )
    ).toBe(true)
  })

  it("detecta acciones sin guarda, también las declaradas como constantes", () => {
    const codigo = `"use server"
      import { requerirUsuario } from "@/lib/auth/dal"
      export async function conGuarda() { await requerirUsuario() }
      export async function sinGuarda() { return 1 }
      export const flecha = async () => 1
      export async function publica() { return 2 }`
    expect(accionesSinGuarda("a.ts", codigo, ["publica"])).toEqual([
      "sinGuarda",
      "flecha",
    ])
  })
})

describe("DAL obligatorio", () => {
  const paginas = archivos("src/app/(app)", (ruta) =>
    /\/page\.tsx?$/.test(ruta)
  )

  it("hay páginas privadas que revisar", () => {
    expect(paginas.length).toBeGreaterThan(0)
  })

  it.each(paginas)(
    "%s invoca requerirUsuario/requerirPermiso/requerirTipoRol",
    (ruta) => {
      expect(paginaSinGuarda(ruta, leer(ruta))).toBe(false)
    }
  )

  const conUseServer = archivos("src", (ruta) => /\.tsx?$/.test(ruta)).filter(
    (ruta) => esArchivoUseServer(analizar(ruta, leer(ruta)))
  )

  it("las Server Actions viven en src/features/<dominio>/actions.ts", () => {
    expect(
      conUseServer.filter(
        (ruta) => !/^src\/features\/[^/]+\/actions\.ts$/.test(ruta)
      )
    ).toEqual([])
  })

  it.each(conUseServer)("%s: cada acción exportada invoca el DAL", (ruta) => {
    expect(
      accionesSinGuarda(ruta, leer(ruta), ACCIONES_PUBLICAS[ruta])
    ).toEqual([])
  })

  it("la lista de acciones públicas no nombra acciones que no existen", () => {
    for (const [ruta, publicas] of Object.entries(ACCIONES_PUBLICAS)) {
      const exportadas = funcionesExportadas(analizar(ruta, leer(ruta)))
      for (const nombre of publicas) expect(exportadas.has(nombre)).toBe(true)
    }
  })
})
