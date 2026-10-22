/**
 * Conexión directa a la base de cada entorno para los scripts de mantenimiento (`pnpm db:push`,
 * `pnpm db:suites`, `pnpm db:vault`). La URL vive en `.env.db.<entorno>` (git la ignora, 0600) y es la del
 * *Session pooler* con usuario `postgres.<ref>`: así `session_user` es `postgres`, como exigen
 * `private.modo_carga()` y las guardas de roles (docs/guia-desarrollo.md, «Flujo de base de datos»).
 * Nada de lo que sale de aquí imprime la contraseña: `redactar` la quita de cualquier texto.
 * `local` es la pila de `supabase start` (Docker): credenciales fijas y públicas de la CLI, sin archivo.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { parseEnv } from "node:util"

export const ENTORNOS = {
  local: "local",
  develop: "depbmnlpfnrcsbqlwxxd",
  produccion: "oriuuuaczpncmtglfgpv",
} as const

export type EntornoDb = keyof typeof ENTORNOS

/** Base de `supabase start` (puerto `[db] port` de supabase/config.toml); su contraseña es pública. */
export const URL_DB_LOCAL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

export class ErrorEntornoDb extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorEntornoDb"
  }
}

export function esEntornoDb(valor: string | undefined): valor is EntornoDb {
  return valor !== undefined && Object.hasOwn(ENTORNOS, valor)
}

/** Entorno pedido en la línea de comandos (`develop` o `produccion`), obligatorio y sin valor por defecto. */
export function entornoDeArgumentos(argumentos: readonly string[]): EntornoDb {
  const entorno = argumentos.find((argumento) => !argumento.startsWith("-"))
  if (!esEntornoDb(entorno)) {
    throw new ErrorEntornoDb(
      `Indica el entorno: ${Object.keys(ENTORNOS).join(" | ")} (p. ej. pnpm db:push develop).`
    )
  }
  return entorno
}

export function archivoDe(entorno: EntornoDb): string {
  return `.env.db.${entorno}`
}

/**
 * Valida la URL del pooler sin incluirla nunca en el mensaje: usuario `postgres.<ref>` del entorno, puerto
 * 5432 y contraseña que no necesite codificación (la CLI y `postgres` la interpretan igual).
 */
export function validarUrlDb(
  url: string | undefined,
  entorno: EntornoDb
): string {
  if (!url)
    throw new ErrorEntornoDb(`Falta SUPABASE_DB_URL en ${archivoDe(entorno)}.`)
  if (!URL.canParse(url)) {
    throw new ErrorEntornoDb(
      `SUPABASE_DB_URL de ${archivoDe(entorno)} no es una URL válida (usa una contraseña alfanumérica).`
    )
  }
  const partes = new URL(url)
  if (partes.username !== `postgres.${ENTORNOS[entorno]}`) {
    throw new ErrorEntornoDb(
      `El usuario de ${archivoDe(entorno)} debe ser postgres.${ENTORNOS[entorno]} (Session pooler de ${entorno}).`
    )
  }
  if (partes.port !== "5432") {
    throw new ErrorEntornoDb(
      `Usa el puerto 5432 (Session pooler), no ${partes.port || "el de omisión"}.`
    )
  }
  if (!/^[A-Za-z0-9\-._~*!]+$/.test(partes.password)) {
    throw new ErrorEntornoDb(
      `La contraseña de ${archivoDe(entorno)} tiene caracteres que hay que codificar: cámbiala por una alfanumérica.`
    )
  }
  return url
}

/** TLS obligatorio contra Supabase; la base local de Docker no lo ofrece. */
export function sslDe(entorno: EntornoDb): "require" | false {
  return entorno === "local" ? false : "require"
}

/** Lee y valida la URL del entorno; exige permisos 0600 en el archivo (contiene la contraseña de la base). */
export function urlDb(entorno: EntornoDb): string {
  if (entorno === "local") return URL_DB_LOCAL
  const archivo = archivoDe(entorno)
  if (!existsSync(archivo)) {
    throw new ErrorEntornoDb(
      `No existe ${archivo}: créalo con SUPABASE_DB_URL=<Session pooler de ${entorno}> y chmod 600.`
    )
  }
  if ((statSync(archivo).mode & 0o077) !== 0) {
    throw new ErrorEntornoDb(
      `${archivo} es legible por otros usuarios: ejecuta chmod 600 ${archivo}.`
    )
  }
  return validarUrlDb(
    parseEnv(readFileSync(archivo, "utf8")).SUPABASE_DB_URL,
    entorno
  )
}

/** Quita de `texto` la URL completa y la contraseña (cruda y decodificada). */
export function redactar(texto: string, url: string | undefined): string {
  if (!url || !URL.canParse(url)) return texto
  const contrasena = new URL(url).password
  const secretos = [url, contrasena, decodeURIComponent(contrasena)].filter(
    (s) => s.length >= 6
  )
  return secretos.reduce(
    (salida, secreto) => salida.split(secreto).join("«redactado»"),
    texto
  )
}
