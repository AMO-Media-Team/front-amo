/**
 * `pnpm prod:limpiar-pruebas <local|develop|produccion> [--ejecutar] [--confirmar-produccion] [--sin-textos-definitivos]`
 *
 * Limpieza final de las pruebas del cliente (docs/guia-desarrollo.md, «Producción como entorno de pruebas del
 * cliente»): deja la plataforma como recién instalada, con catálogos, configuración, tarifas, roles, permisos,
 * plantillas y textos legales definitivos, y solo con los superadministradores activos.
 *
 * - **Simula por defecto**: corre la transacción completa (`private.limpiar_pruebas`) y la revierte. Imprime las filas
 *   que se borrarían por tabla, las cuentas (correos enmascarados), los objetos de Storage y los MB que se liberarían,
 *   lo que la limpieza conserva y conviene revisar, y qué impediría ejecutarla.
 * - `--ejecutar`: la misma transacción con `commit`; después borra Storage por la API en lotes (conserva los avatares
 *   de los superadministradores), revierte la configuración de prueba (`pnpm prod:config-pruebas --revertir`), verifica
 *   y escribe el informe `context/respaldos/limpieza-<ref>-<día>.json` (0600, fuera de git). Si se corta después del
 *   `commit`, el mismo comando retoma en Storage (la base ya limpia no se vuelve a tocar).
 * - En develop y producción, ejecutar exige escribir el ref del proyecto en una terminal interactiva (nunca con `CI`).
 *   En producción, además: `--confirmar-produccion`, el respaldo del mismo día (`pnpm db:respaldo produccion --etiqueta
 *   antes-limpieza`), exactamente 3 superadministradores activos con un factor MFA verificado (uno, el de
 *   `SUPERADMIN_EMAIL`) y, para los 4 documentos legales, una versión vigente que no sea de prueba (salvo
 *   `--sin-textos-definitivos`). Sin todas, se detiene.
 *
 * Base: conexión directa como `postgres` (`.env.db.<entorno>`, como `pnpm db:push`) con `amo.modo_carga` y `amo.purga`
 * solo dentro de la transacción. Storage: clave secreta del archivo de la app (`.env.local`, `.env.develop` o
 * `.env.produccion`; otro con `AMO_ARCHIVO_ENTORNO`, que debe apuntar al mismo proyecto). No imprime claves ni correos
 * completos. **Contra producción solo por orden expresa de Andrés.**
 */
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline/promises"
import { parseEnv } from "node:util"

import { createClient } from "@supabase/supabase-js"
import postgres from "postgres"

import { formatearNumero } from "../../src/lib/format"
import type { Database } from "../../src/types/database.types"
import {
  ENTORNOS,
  type EntornoDb,
  redactar,
  sslDe,
  urlDb,
} from "../db/entorno-db"
import { enLotes } from "../demo/purga"
import type { RespaldoConfiguracion } from "./configuracion-pruebas-plan"
import {
  ARCHIVO_APP,
  type ArchivoRespaldo,
  type ArgumentosLimpieza,
  avisosDeEstado,
  CARPETA_RESPALDOS,
  type CambioConfiguracion,
  type ClasificacionTablas,
  confirmacionCorrecta,
  conteosOrdenados,
  correoVisible,
  entidadesConfiguracion,
  exigirNombreTabla,
  formatearTamano,
  type HechosLimpieza,
  idsConservar,
  idsTerminosARetirar,
  leerArgumentos,
  LOTE_STORAGE,
  type ObjetoStorage,
  planStorage,
  type PlanStorage,
  problemasDeEstado,
  problemasDeOrden,
  problemasVerificacion,
  proyectoDeUrl,
  type ResolucionDian,
  resolucionesConConsecutivoUsado,
  type ResumenUsuarios,
  resumirUsuarios,
  rutaInforme,
  rutasPorBucket,
  rutasRespaldoRequeridas,
  sinTerminosRetirados,
  sqlPendiente,
  type Superadmin,
  superadminsActivos,
  TABLAS_ACTIVIDAD,
  tablasSinClasificar,
  tiposSinTextoDefinitivo,
  urlApiDe,
  type UsuarioABorrar,
  type VersionTermino,
} from "./limpiar-pruebas-plan"

type Sql = postgres.Sql
type Consultor = postgres.Sql | postgres.TransactionSql

class ErrorLimpieza extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorLimpieza"
  }
}

/** Marca para revertir la transacción de la simulación sin tratarlo como fallo. */
class Revertir extends Error {}

function informar(linea = ""): void {
  process.stderr.write(`${linea}\n`)
}

// ── Entorno de la app (Storage) ─────────────────────────────────────────────

interface EntornoApp {
  archivo: string
  urlApi: string
  secretKey: string
  superadminEmail: string | undefined
  /** Nombre del proyecto en el respaldo de `pnpm prod:config-pruebas`. */
  proyecto: string
}

function leerEntornoApp(entorno: EntornoDb): EntornoApp {
  const archivo = process.env.AMO_ARCHIVO_ENTORNO ?? ARCHIVO_APP[entorno]
  if (!existsSync(archivo)) {
    throw new ErrorLimpieza(
      `No existe ${archivo} (URL y SUPABASE_SECRET_KEY de ${entorno}); indícalo con AMO_ARCHIVO_ENTORNO.`
    )
  }
  if (entorno !== "local" && (statSync(archivo).mode & 0o077) !== 0) {
    throw new ErrorLimpieza(
      `${archivo} es legible por otros usuarios: ejecuta chmod 600 ${archivo}.`
    )
  }
  const variables = parseEnv(readFileSync(archivo, "utf8"))
  const urlApi = urlApiDe(entorno, variables.NEXT_PUBLIC_SUPABASE_URL, archivo)
  const secretKey = variables.SUPABASE_SECRET_KEY
  if (!secretKey) {
    throw new ErrorLimpieza(`Falta SUPABASE_SECRET_KEY en ${archivo}.`)
  }
  return {
    archivo,
    urlApi,
    secretKey,
    superadminEmail: variables.SUPERADMIN_EMAIL,
    proyecto: proyectoDeUrl(urlApi),
  }
}

function clienteStorage(app: EntornoApp) {
  return createClient<Database>(app.urlApi, app.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function rutaRespaldoConfiguracion(app: EntornoApp): string {
  return join(CARPETA_RESPALDOS, `configuracion-pruebas-${app.proyecto}.json`)
}

function leerRespaldoConfiguracion(
  app: EntornoApp
): RespaldoConfiguracion | null {
  const ruta = rutaRespaldoConfiguracion(app)
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, "utf8")) as RespaldoConfiguracion
}

function escribirPrivado(ruta: string, contenido: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  writeFileSync(ruta, `${JSON.stringify(contenido, null, 2)}\n`, {
    mode: 0o600,
  })
  // `mode` solo aplica al crear: si ya existía con otros permisos, se corrigen.
  chmodSync(ruta, 0o600)
}

// ── Lectura de la base ──────────────────────────────────────────────────────

async function comprobarConexion(sql: Sql): Promise<void> {
  const [fila] = await sql<
    { usuario: string }[]
  >`select session_user::text as usuario`
  if (fila?.usuario !== "postgres") {
    throw new ErrorLimpieza(
      `La conexión entra como ${fila?.usuario ?? "desconocido"}, no como postgres: usa el Session pooler (postgres.<ref>) de .env.db.<entorno>.`
    )
  }
}

/** Filas por tabla; con `antesDe`, en las de actividad solo cuenta lo anterior a ese instante. */
async function contarTablas(
  sql: Consultor,
  tablas: readonly string[],
  antesDe: Date | null = null
): Promise<Record<string, number>> {
  if (tablas.length === 0) return {}
  const partes = tablas.map((tabla) => {
    const nombre = exigirNombreTabla(tabla)
    const filtro =
      antesDe && TABLAS_ACTIVIDAD.has(tabla)
        ? " where created_at < $1::timestamptz"
        : ""
    return `select '${nombre}' as tabla, count(*)::int as filas from ${nombre}${filtro}`
  })
  const filas = await sql.unsafe<{ tabla: string; filas: number }[]>(
    partes.join(" union all "),
    antesDe ? [antesDe.toISOString()] : []
  )
  return Object.fromEntries(filas.map((fila) => [fila.tabla, fila.filas]))
}

async function leerSuperadmins(sql: Sql): Promise<Superadmin[]> {
  const filas = await sql<
    {
      id: string
      email: string
      estado: string
      eliminado: boolean
      factores: number
    }[]
  >`
    select p.id::text, p.email::text, p.estado::text, p.deleted_at is not null as eliminado,
           (select count(*)::int from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as factores
    from public.perfiles p join public.roles r on r.id = p.rol_id
    where r.clave = 'SUPERADMIN'
    order by p.created_at`
  return filas.map((fila) => ({
    id: fila.id,
    email: fila.email,
    estado: fila.estado,
    eliminado: fila.eliminado,
    factoresVerificados: fila.factores,
  }))
}

async function leerClasificacion(sql: Sql): Promise<ClasificacionTablas> {
  const [fila] = await sql<
    { clasificacion: ClasificacionTablas }[]
  >`select private.tablas_limpieza() as clasificacion`
  if (!fila) throw new ErrorLimpieza("private.tablas_limpieza() no respondió.")
  return fila.clasificacion
}

async function leerTablas(sql: Sql): Promise<string[]> {
  const filas = await sql<{ tabla: string }[]>`
    select n.nspname || '.' || c.relname as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and not c.relispartition and n.nspname in ('public', 'private')`
  return filas.map((fila) => fila.tabla)
}

/** Instante del último registro de una limpieza en la bitácora (`private.limpiar_pruebas` lo deja). */
async function leerRegistroLimpieza(sql: Consultor): Promise<Date | null> {
  const [fila] = await sql<{ instante: Date }[]>`
    select created_at as instante from public.bitacora
    where entidad = 'plataforma' and accion = 'OTRO' and metadatos ->> 'alcance' = 'limpieza'
    order by id desc limit 1`
  return fila?.instante ?? null
}

function arregloUuid(ids: readonly string[]): string {
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ErrorLimpieza(`Identificador inesperado: ${id}`)
    }
  }
  return `{${ids.join(",")}}`
}

async function leerUsuariosABorrar(
  sql: Sql,
  conservar: readonly string[]
): Promise<UsuarioABorrar[]> {
  return sql<UsuarioABorrar[]>`
    select u.email::text as email, r.clave::text as rol
    from auth.users u
    left join public.perfiles p on p.id = u.id
    left join public.roles r on r.id = p.rol_id
    where not (u.id = any (${arregloUuid(conservar)}::uuid[]))`
}

async function leerStorage(
  sql: Consultor,
  conservar: readonly string[]
): Promise<PlanStorage> {
  const objetos = await sql<ObjetoStorage[]>`
    select bucket_id as bucket, name as nombre, coalesce((metadata ->> 'size')::float8, 0) as bytes
    from storage.objects`
  const avatares = await sql<{ ruta: string }[]>`
    select avatar_path as ruta from public.perfiles
    where id = any (${arregloUuid(conservar)}::uuid[]) and avatar_path is not null`
  return planStorage(
    objetos,
    avatares.map((fila) => fila.ruta)
  )
}

async function leerVersiones(sql: Sql): Promise<VersionTermino[]> {
  const filas = await sql<
    {
      id: string
      tipo: VersionTermino["tipo"]
      version: string
      publicada: boolean
      vigente_desde: Date | null
    }[]
  >`select id::text, tipo::text, version, publicada, vigente_desde from public.terminos_versiones`
  return filas.map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    version: fila.version,
    publicada: fila.publicada,
    vigenteDesde: fila.vigente_desde?.toISOString() ?? null,
  }))
}

/** Cambios hechos por personas (no migraciones ni demo) en lo que la limpieza conserva. */
async function leerCambiosConfiguracion(
  sql: Sql,
  entidades: readonly string[]
): Promise<CambioConfiguracion[]> {
  const filas = await sql<
    { entidad: string; accion: string; cambios: number; ultimo: Date }[]
  >`
    select entidad, accion, count(*)::int as cambios, max(created_at) as ultimo
    from public.bitacora
    where entidad = any (${`{${entidades.join(",")}}`}::text[]) and actor_id is not null and not es_demo
    group by entidad, accion
    order by entidad, accion`
  return filas.map((fila) => ({
    entidad: fila.entidad,
    accion: fila.accion,
    cambios: fila.cambios,
    ultimo: fila.ultimo.toISOString(),
  }))
}

async function leerResoluciones(sql: Sql): Promise<ResolucionDian[]> {
  const filas = await sql<
    {
      id: string
      tipo: string
      prefijo: string
      numero: string
      desde: number
      actual: number
    }[]
  >`
    select id::text, tipo::text, prefijo, numero_resolucion as numero, rango_desde::float8 as desde,
           consecutivo_actual::float8 as actual
    from public.resoluciones_dian`
  return filas.map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    prefijo: fila.prefijo,
    numeroResolucion: fila.numero,
    rangoDesde: fila.desde,
    consecutivoActual: fila.actual,
  }))
}

interface EstadoBase {
  superadmins: Superadmin[]
  conservar: string[]
  clasificacion: ClasificacionTablas
  sinClasificar: string[]
  conteos: Record<string, number>
  registroLimpieza: Date | null
  usuarios: ResumenUsuarios
  storage: PlanStorage
  versiones: VersionTermino[]
  terminosRetirar: string[]
  cambiosConfiguracion: CambioConfiguracion[]
  resolucionesUsadas: ResolucionDian[]
  sqlPendiente: boolean
}

async function leerEstado(
  sql: Sql,
  respaldoConfiguracion: RespaldoConfiguracion | null
): Promise<EstadoBase> {
  const superadmins = await leerSuperadmins(sql)
  const conservar = idsConservar(superadmins)
  const clasificacion = await leerClasificacion(sql)
  const sinClasificar = tablasSinClasificar(
    await leerTablas(sql),
    clasificacion
  )
  const conteos = await contarTablas(sql, clasificacion.borrar)
  const registroLimpieza = await leerRegistroLimpieza(sql)
  const usuarios = await leerUsuariosABorrar(sql, conservar)
  const versiones = await leerVersiones(sql)
  const resoluciones = await leerResoluciones(sql)
  const idsPrueba = new Set(respaldoConfiguracion?.finanzas?.resoluciones ?? [])
  return {
    superadmins,
    conservar,
    clasificacion,
    sinClasificar,
    conteos,
    registroLimpieza,
    usuarios: resumirUsuarios(usuarios),
    storage: await leerStorage(sql, conservar),
    versiones,
    terminosRetirar: idsTerminosARetirar(
      versiones,
      (respaldoConfiguracion?.terminos ?? []).map((termino) => termino.id)
    ),
    cambiosConfiguracion: await leerCambiosConfiguracion(
      sql,
      entidadesConfiguracion(clasificacion)
    ),
    resolucionesUsadas: resolucionesConConsecutivoUsado(
      resoluciones,
      idsPrueba
    ),
    sqlPendiente: sqlPendiente(
      conteos,
      registroLimpieza !== null,
      usuarios.length
    ),
  }
}

// ── Transacción ─────────────────────────────────────────────────────────────

interface ResultadoTransaccion {
  /** Lo que `private.limpiar_pruebas` contó antes de borrar. */
  conteos: Record<string, number>
  /** Inicio de la transacción (instante de la limpieza en la bitácora). */
  instante: Date
  /** Lo que queda dentro de la transacción, antes del commit o del rollback. */
  despues: Record<string, number>
  segundos: number
}

async function transaccionLimpieza(
  sql: Sql,
  estado: EstadoBase,
  confirmar: boolean
): Promise<ResultadoTransaccion> {
  const salida: { resultado?: ResultadoTransaccion } = {}
  const inicio = performance.now()
  await sql
    .begin(async (tx) => {
      // Solo dentro de esta transacción: los interruptores no sobreviven al commit o al rollback.
      await tx`
        select set_config('amo.modo_carga', 'on', true), set_config('amo.purga', 'on', true),
               set_config('statement_timeout', '600s', true), set_config('lock_timeout', '30s', true)`
      const [habilitada] = await tx<{ ok: boolean }[]>`
        select private.purga_habilitada() and private.modo_carga() as ok`
      if (!habilitada?.ok) {
        throw new ErrorLimpieza(
          "La base no habilitó la purga (session_user debe ser postgres)."
        )
      }
      const [fila] = await tx<
        { conteos: Record<string, number>; instante: Date }[]
      >`
        select private.limpiar_pruebas(${arregloUuid(estado.conservar)}::uuid[],
                                       ${arregloUuid(estado.terminosRetirar)}::uuid[]) as conteos,
               now() as instante`
      if (!fila)
        throw new ErrorLimpieza("private.limpiar_pruebas no respondió.")
      salida.resultado = {
        conteos: fila.conteos,
        instante: fila.instante,
        despues: await contarTablas(tx, estado.clasificacion.borrar),
        segundos: 0,
      }
      if (!confirmar) throw new Revertir()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Revertir)) throw error
    })
  if (!salida.resultado) {
    throw new ErrorLimpieza("La transacción no devolvió conteos.")
  }
  return {
    ...salida.resultado,
    segundos: (performance.now() - inicio) / 1000,
  }
}

// ── Storage y configuración ─────────────────────────────────────────────────

interface ResultadoStorage {
  borrados: number
  bytes: number
  conservados: number
  error: string | null
}

/** Borra lo que no se conserva, por lotes; lo que ya no existe no falla, así que repetirlo retoma donde iba. */
async function borrarStorage(
  sql: Sql,
  app: EntornoApp,
  conservar: readonly string[]
): Promise<ResultadoStorage> {
  const plan = await leerStorage(sql, conservar)
  const servicio = clienteStorage(app)
  const resultado: ResultadoStorage = {
    borrados: 0,
    bytes: 0,
    conservados: plan.conservar.length,
    error: null,
  }
  const bytesDe = new Map(
    plan.borrar.map((objeto) => [
      `${objeto.bucket}/${objeto.nombre}`,
      objeto.bytes,
    ])
  )
  for (const [bucket, rutas] of rutasPorBucket(plan.borrar)) {
    for (const lote of enLotes(rutas, LOTE_STORAGE)) {
      const { error } = await servicio.storage.from(bucket).remove(lote)
      if (error) {
        resultado.error = `No se pudo borrar en ${bucket}: ${error.message}`
        return resultado
      }
      resultado.borrados += lote.length
      for (const ruta of lote)
        resultado.bytes += bytesDe.get(`${bucket}/${ruta}`) ?? 0
    }
    informar(`  ✓ ${bucket}: ${formatearNumero(rutas.length)} objetos`)
  }
  return resultado
}

/** Las versiones de prueba ya no existen: el respaldo de `prod:config-pruebas` deja de listarlas. */
function actualizarRespaldoConfiguracion(
  app: EntornoApp,
  retiradas: readonly string[]
): void {
  const respaldo = leerRespaldoConfiguracion(app)
  if (!respaldo) return
  const actualizado = sinTerminosRetirados(respaldo, new Set(retiradas))
  if (actualizado !== respaldo) {
    escribirPrivado(rutaRespaldoConfiguracion(app), actualizado)
  }
}

function revertirConfiguracion(app: EntornoApp, entorno: EntornoDb): boolean {
  const argumentos = [
    "prod:config-pruebas",
    "--revertir",
    ...(entorno === "produccion" ? ["--confirmar-produccion"] : []),
  ]
  const resultado = spawnSync("pnpm", argumentos, {
    stdio: "inherit",
    env: { ...process.env, AMO_ARCHIVO_ENTORNO: app.archivo },
  })
  return resultado.status === 0
}

// ── Verificación ────────────────────────────────────────────────────────────

async function verificar(
  sql: Sql,
  app: EntornoApp,
  estado: EstadoBase,
  instante: Date
): Promise<string[]> {
  const restantes = await contarTablas(
    sql,
    estado.clasificacion.borrar,
    instante
  )
  const [cuentas] = await sql<{ perfiles: number; usuarios: number }[]>`
    select (select count(*)::int from public.perfiles) as perfiles,
           (select count(*)::int from auth.users) as usuarios`
  const storage = await leerStorage(sql, estado.conservar)
  const respaldo = leerRespaldoConfiguracion(app)
  const finanzas = respaldo?.finanzas
  return problemasVerificacion({
    restantes,
    perfiles: cuentas?.perfiles ?? -1,
    usuariosAuth: cuentas?.usuarios ?? -1,
    conservar: estado.conservar.length,
    storagePendiente: storage.borrar.length,
    parametrosPendientes: Object.keys(respaldo?.parametros ?? {}),
    finanzasPendientes: finanzas
      ? finanzas.retenciones.length +
        finanzas.reteica.length +
        finanzas.resoluciones.length
      : 0,
  })
}

// ── Presentación ────────────────────────────────────────────────────────────

const MAX_CORREOS = 15

function mostrarEstado(estado: EstadoBase): void {
  const activos = superadminsActivos(estado.superadmins)
  informar(
    `Superadministradores que se conservan (${activos.length}): ${activos
      .map(
        (superadmin) =>
          `${correoVisible(superadmin.email)} (${superadmin.factoresVerificados > 0 ? "MFA ✓" : "sin MFA"})`
      )
      .join(", ")}`
  )
  const { usuarios } = estado
  const porRol = Object.entries(usuarios.porRol)
    .sort(([, a], [, b]) => b - a)
    .map(([rol, total]) => `${rol} ${formatearNumero(total)}`)
    .join(", ")
  informar(
    `Cuentas que se borran: ${formatearNumero(usuarios.total)}${porRol ? ` (${porRol})` : ""}`
  )
  if (usuarios.correos.length > 0) {
    const resto = usuarios.correos.length - MAX_CORREOS
    informar(
      `  ${usuarios.correos
        .slice(0, MAX_CORREOS)
        .map(({ correo, cuentas }) =>
          cuentas > 1 ? `${correo} ×${cuentas}` : correo
        )
        .join(
          ", "
        )}${resto > 0 ? ` y ${formatearNumero(resto)} correos más (lista completa en el informe)` : ""}`
    )
  }
  const { storage } = estado
  informar(
    `Storage: ${formatearNumero(storage.total.objetos)} objetos por borrar (${formatearTamano(storage.total.bytes)}); se conservan ${storage.conservar.length} avatares de superadministradores`
  )
  for (const [bucket, total] of Object.entries(storage.porBucket).sort()) {
    informar(
      `  ${bucket}: ${formatearNumero(total.objetos)} objetos, ${formatearTamano(total.bytes)}`
    )
  }
  const retirar = new Set(estado.terminosRetirar)
  const dePrueba = estado.versiones.filter((version) => retirar.has(version.id))
  informar(
    `Textos legales de prueba que se retiran: ${dePrueba.length}${dePrueba.length > 0 ? ` (${dePrueba.map((version) => `${version.tipo} ${version.version}`).join(", ")})` : ""}`
  )
  if (estado.cambiosConfiguracion.length > 0) {
    informar(
      "Configuración cambiada por personas que se conserva (su rastro en la bitácora se borra; revísala antes):"
    )
    for (const cambio of estado.cambiosConfiguracion) {
      informar(
        `  ${cambio.entidad} ${cambio.accion}: ${formatearNumero(cambio.cambios)} (último ${cambio.ultimo.slice(0, 10)})`
      )
    }
  }
  for (const resolucion of estado.resolucionesUsadas) {
    informar(
      `Aviso: la resolución DIAN ${resolucion.tipo} ${resolucion.prefijo} (${resolucion.numeroResolucion}) quedó en el consecutivo ${formatearNumero(resolucion.consecutivoActual)}; los documentos se borran pero la numeración no retrocede.`
    )
  }
}

function mostrarTransaccion(resultado: ResultadoTransaccion): void {
  informar("Filas que borra la limpieza:")
  for (const [tabla, filas] of conteosOrdenados(resultado.conteos)) {
    informar(
      `  ${tabla.padEnd(40, " ")} ${formatearNumero(filas).padStart(10, " ")}`
    )
  }
  const quedan = conteosOrdenados(resultado.despues)
  informar(
    quedan.length === 0
      ? "Tras la limpieza no queda ninguna fila en esas tablas."
      : `Tras la limpieza quedan: ${quedan.map(([tabla, filas]) => `${tabla} ${formatearNumero(filas)}`).join(", ")} (la bitácora guarda el registro de la limpieza).`
  )
  informar(
    `Duración de la transacción: ${formatearNumero(resultado.segundos, 1)} s`
  )
}

async function confirmarEnTerminal(ref: string): Promise<boolean> {
  const lector = createInterface({
    input: process.stdin,
    output: process.stderr,
  })
  try {
    const escrito = await lector.question(
      `Escribe el ref del proyecto (${ref}) para borrar de forma definitiva: `
    )
    return confirmacionCorrecta(escrito, ref)
  } finally {
    lector.close()
  }
}

function leerRespaldoDelDia(ahora: Date): ArchivoRespaldo[] {
  return rutasRespaldoRequeridas(ahora).map((ruta) => {
    if (!existsSync(ruta)) return { ruta, bytes: null, modo: null }
    const datos = statSync(ruta)
    return { ruta, bytes: datos.size, modo: datos.mode }
  })
}

// ── Informe ─────────────────────────────────────────────────────────────────

interface InformeLimpieza {
  entorno: EntornoDb
  proyecto: string
  generado: string
  actualizado: string
  limpieza: {
    instante: string
    conteos: Record<string, number>
    usuarios: ResumenUsuarios
    conservados: string[]
    terminosRetirados: number
    configuracionConservada: CambioConfiguracion[]
    resolucionesConConsecutivo: ResolucionDian[]
  } | null
  storage: ResultadoStorage | null
  configuracion: "revertida" | "fallo" | null
  verificacion: { ok: boolean; problemas: string[] } | null
}

function leerInforme(ruta: string): InformeLimpieza | null {
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, "utf8")) as InformeLimpieza
}

// ── Flujo ───────────────────────────────────────────────────────────────────

async function simular(sql: Sql, estado: EstadoBase): Promise<void> {
  if (!estado.sqlPendiente) {
    informar(
      `La base ya está limpia (limpieza del ${estado.registroLimpieza?.toISOString() ?? "?"}): al ejecutar se retoma en Storage.`
    )
    return
  }
  informar("Simulando la transacción completa (se revierte)…")
  mostrarTransaccion(await transaccionLimpieza(sql, estado, false))
}

async function ejecutar(
  sql: Sql,
  argumentos: ArgumentosLimpieza,
  app: EntornoApp,
  estado: EstadoBase
): Promise<boolean> {
  const { entorno } = argumentos
  const ref = ENTORNOS[entorno]
  if (entorno !== "local") {
    informar(
      `\n⚠ Esto borra de forma definitiva ${formatearNumero(estado.usuarios.total)} cuentas, todo el negocio y ${formatearNumero(estado.storage.total.objetos)} objetos de Storage de ${entorno}.`
    )
    if (!(await confirmarEnTerminal(ref))) {
      throw new ErrorLimpieza("El ref no coincide: no se borró nada.")
    }
  }

  const ruta = rutaInforme(ref, new Date())
  const ahora = new Date().toISOString()
  let informe: InformeLimpieza = leerInforme(ruta) ?? {
    entorno,
    proyecto: ref,
    generado: ahora,
    actualizado: ahora,
    limpieza: null,
    storage: null,
    configuracion: null,
    verificacion: null,
  }
  const guardar = () => {
    informe = { ...informe, actualizado: new Date().toISOString() }
    escribirPrivado(ruta, informe)
  }

  let instante = estado.registroLimpieza
  if (estado.sqlPendiente) {
    informar("Base de datos…")
    const resultado = await transaccionLimpieza(sql, estado, true)
    mostrarTransaccion(resultado)
    instante = resultado.instante
    informe = {
      ...informe,
      limpieza: {
        instante: resultado.instante.toISOString(),
        conteos: resultado.conteos,
        usuarios: estado.usuarios,
        conservados: superadminsActivos(estado.superadmins).map((superadmin) =>
          correoVisible(superadmin.email)
        ),
        terminosRetirados: estado.terminosRetirar.length,
        configuracionConservada: estado.cambiosConfiguracion,
        resolucionesConConsecutivo: estado.resolucionesUsadas,
      },
    }
    // Lo primero que queda escrito: si algo falla después, el informe dice qué se borró.
    guardar()
    actualizarRespaldoConfiguracion(app, estado.terminosRetirar)
  } else {
    informar("La base ya estaba limpia: se retoma en Storage.")
  }
  if (!instante)
    throw new ErrorLimpieza("No se encontró el registro de la limpieza.")

  informar("Storage…")
  const storage = await borrarStorage(sql, app, estado.conservar)
  informe = { ...informe, storage }
  guardar()
  if (storage.error) {
    informar(`✗ ${storage.error}`)
    informar(
      "Vuelve a ejecutar el mismo comando: la base ya está limpia y se retoma en Storage."
    )
    return false
  }
  informar(
    `✓ Storage: ${formatearNumero(storage.borrados)} objetos borrados (${formatearTamano(storage.bytes)}); ${storage.conservados} conservados.`
  )

  informar("Configuración de prueba (pnpm prod:config-pruebas --revertir)…")
  const configuracion = revertirConfiguracion(app, entorno)
    ? "revertida"
    : "fallo"
  informe = { ...informe, configuracion }
  guardar()
  if (configuracion === "fallo") {
    informar(
      `✗ No se pudo revertir: ejecútalo a mano (AMO_ARCHIVO_ENTORNO=${app.archivo} pnpm prod:config-pruebas --revertir${entorno === "produccion" ? " --confirmar-produccion" : ""}).`
    )
  }

  informar("Verificación…")
  const problemas = await verificar(sql, app, estado, instante)
  informe = {
    ...informe,
    verificacion: { ok: problemas.length === 0, problemas },
  }
  guardar()
  for (const problema of problemas) informar(`  ✗ ${problema}`)
  if (problemas.length === 0) {
    informar(
      `✓ Sin datos de prueba: ${estado.conservar.length} perfiles y ${estado.conservar.length} cuentas, Storage solo con lo conservado.`
    )
  }
  informar(`Informe: ${ruta} (0600)`)
  if (entorno !== "local") {
    informar(
      "Siguiente: revisa los avisos de seguridad y rendimiento del proyecto (MCP get_advisors, solo lectura)."
    )
  }
  return problemas.length === 0 && configuracion === "revertida"
}

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2))
  const { entorno } = argumentos
  const app = leerEntornoApp(entorno)
  const url = urlDb(entorno)
  const sql = postgres(url, {
    ssl: sslDe(entorno),
    max: 1,
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
    connection: { application_name: "amo-limpiar-pruebas" },
  })
  try {
    await comprobarConexion(sql)
    informar(
      `Limpieza de pruebas en ${entorno} (${app.proyecto})${entorno === "produccion" ? " · PRODUCCIÓN" : ""} · ${argumentos.ejecutar ? "EJECUCIÓN" : "simulación: no cambia nada"}`
    )
    const respaldoConfiguracion = leerRespaldoConfiguracion(app)
    const estado = await leerEstado(sql, respaldoConfiguracion)
    mostrarEstado(estado)

    const ahora = new Date()
    const hechos: HechosLimpieza = {
      argumentos,
      superadmins: estado.superadmins,
      superadminEmail: app.superadminEmail,
      textosSinDefinitivo: tiposSinTextoDefinitivo(
        estado.versiones,
        ahora,
        new Set(estado.terminosRetirar)
      ),
      respaldo:
        entorno === "produccion" && estado.sqlPendiente
          ? leerRespaldoDelDia(ahora)
          : null,
      tablasSinClasificar: estado.sinClasificar,
    }
    for (const aviso of avisosDeEstado(hechos)) informar(`Aviso: ${aviso}`)
    const problemas = [
      ...problemasDeEstado(hechos),
      ...(argumentos.ejecutar
        ? problemasDeOrden(argumentos, {
            tty: Boolean(process.stdin.isTTY && process.stderr.isTTY),
            ci: Boolean(process.env.CI),
          })
        : []),
    ]

    if (!argumentos.ejecutar) {
      await simular(sql, estado)
      if (problemas.length > 0) {
        informar(`Para ejecutar en ${entorno} falta:`)
        for (const problema of problemas) informar(`  ✗ ${problema}`)
      }
      informar(
        `Después del commit, el script borra Storage por la API, revierte la configuración de prueba (pnpm prod:config-pruebas --revertir), verifica y escribe ${rutaInforme(ENTORNOS[entorno], ahora)}.`
      )
      return
    }
    if (problemas.length > 0) {
      for (const problema of problemas) informar(`  ✗ ${problema}`)
      throw new ErrorLimpieza(
        "No se ejecuta: faltan las salvaguardas de arriba."
      )
    }
    if (!(await ejecutar(sql, argumentos, app, estado))) process.exitCode = 1
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new ErrorLimpieza(redactar(mensaje, url))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`limpiar-pruebas falló: ${mensaje}\n`)
  process.exitCode = 1
})
