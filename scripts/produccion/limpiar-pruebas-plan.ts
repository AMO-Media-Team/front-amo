/**
 * Lógica pura de `pnpm prod:limpiar-pruebas` (`limpiar-pruebas.ts`): argumentos, archivo de la app de cada
 * entorno, salvaguardas para ejecutar (sobre todo en producción), qué se conserva de Storage, resumen de lo que se
 * borra, avisos para el operador y verificación final. Sin base ni archivos, para probarla con Vitest.
 */
import { join } from "node:path"

import { enmascararEmail } from "../../src/features/auth/components/enmascarar-email"
import { serializarFecha } from "../../src/lib/fechas"
import { formatearNumero } from "../../src/lib/format"
import type { Database } from "../../src/types/database.types"
import { ENTORNOS, type EntornoDb, esEntornoDb } from "../db/entorno-db"
import { nombreRespaldo } from "../db/respaldo"
import {
  type RespaldoConfiguracion,
  TIPOS_TERMINOS,
} from "./configuracion-pruebas-plan"

type TipoTermino = Database["public"]["Enums"]["terminos_tipo"]

/** Carpeta de respaldos e informes (fuera de git: `context/` no se versiona). */
export const CARPETA_RESPALDOS = join("context", "respaldos")

/** Etiqueta del respaldo que exige ejecutar en producción (`pnpm db:respaldo produccion --etiqueta antes-limpieza`). */
export const ETIQUETA_RESPALDO = "antes-limpieza"

/** Superadministradores activos que deben quedar en producción (decisión de Andrés para la salida a operación). */
export const SUPERADMINS_PRODUCCION = 3

/** Tamaño de cada lote de borrado en Storage (la API acepta listas; 100 como en `pnpm demo:purgar`). */
export const LOTE_STORAGE = 100

// ── Argumentos ───────────────────────────────────────────────────────────────

export interface ArgumentosLimpieza {
  entorno: EntornoDb
  /** Sin `--ejecutar` todo se simula y se revierte. */
  ejecutar: boolean
  confirmarProduccion: boolean
  /** Permite ejecutar en producción aunque falten los textos legales definitivos. */
  sinTextosDefinitivos: boolean
}

const BANDERAS = new Set([
  "--ejecutar",
  "--confirmar-produccion",
  "--sin-textos-definitivos",
])

export const USO =
  "Uso: pnpm prod:limpiar-pruebas <local|develop|produccion> [--ejecutar] [--confirmar-produccion] [--sin-textos-definitivos]"

export function leerArgumentos(argv: readonly string[]): ArgumentosLimpieza {
  const posicionales = argv.filter((argumento) => !argumento.startsWith("-"))
  const desconocida = argv.find(
    (argumento) => argumento.startsWith("-") && !BANDERAS.has(argumento)
  )
  if (desconocida)
    throw new Error(`Argumento desconocido: ${desconocida}. ${USO}`)
  const [entorno, ...sobrantes] = posicionales
  if (!esEntornoDb(entorno) || sobrantes.length > 0) {
    throw new Error(`Indica un solo entorno. ${USO}`)
  }
  const confirmarProduccion = argv.includes("--confirmar-produccion")
  if (confirmarProduccion && entorno !== "produccion") {
    throw new Error("--confirmar-produccion solo aplica a produccion.")
  }
  return {
    entorno,
    ejecutar: argv.includes("--ejecutar"),
    confirmarProduccion,
    sinTextosDefinitivos: argv.includes("--sin-textos-definitivos"),
  }
}

// ── Archivo de la app (Storage por la API) ──────────────────────────────────

/** Archivo con la URL y la clave secreta de la app de cada entorno (CLAUDE.md, «Entorno»). */
export const ARCHIVO_APP: Readonly<Record<EntornoDb, string>> = {
  local: ".env.local",
  develop: ".env.develop",
  produccion: ".env.produccion",
}

const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost", "[::1]"])

/**
 * URL de la API de Supabase del entorno. En develop y producción sale del ref (si el archivo trae otra, es un
 * error: la base y Storage serían de proyectos distintos); en local, la del archivo, que debe ser de la pila local.
 */
export function urlApiDe(
  entorno: EntornoDb,
  delArchivo: string | undefined,
  archivo: string
): string {
  if (entorno === "local") {
    if (!delArchivo || !URL.canParse(delArchivo)) {
      throw new Error(`Falta NEXT_PUBLIC_SUPABASE_URL en ${archivo}.`)
    }
    if (!HOSTS_LOCALES.has(new URL(delArchivo).hostname)) {
      throw new Error(
        `${archivo} no apunta a la pila local (supabase start); revisa NEXT_PUBLIC_SUPABASE_URL o usa AMO_ARCHIVO_ENTORNO.`
      )
    }
    return delArchivo.replace(/\/+$/, "")
  }
  const esperada = `https://${ENTORNOS[entorno]}.supabase.co`
  if (
    delArchivo &&
    (!URL.canParse(delArchivo) ||
      new URL(delArchivo).hostname !== `${ENTORNOS[entorno]}.supabase.co`)
  ) {
    throw new Error(
      `${archivo} apunta a otro proyecto que ${entorno} (${ENTORNOS[entorno]}).`
    )
  }
  return esperada
}

/** Nombre del proyecto como lo usa `pnpm prod:config-pruebas` en su respaldo (ref de Supabase o host). */
export function proyectoDeUrl(url: string): string {
  const { hostname } = new URL(url)
  return hostname.endsWith(".supabase.co")
    ? hostname.slice(0, -".supabase.co".length)
    : hostname
}

// ── Estado de la base ────────────────────────────────────────────────────────

export interface Superadmin {
  id: string
  email: string
  estado: string
  eliminado: boolean
  factoresVerificados: number
}

/** Los que la limpieza conserva: exactamente los superadministradores activos (lo exige `private.limpiar_pruebas`). */
export function superadminsActivos(
  superadmins: readonly Superadmin[]
): Superadmin[] {
  return superadmins.filter(
    (superadmin) => superadmin.estado === "ACTIVO" && !superadmin.eliminado
  )
}

export function idsConservar(superadmins: readonly Superadmin[]): string[] {
  return superadminsActivos(superadmins)
    .map((superadmin) => superadmin.id)
    .sort()
}

export interface ClasificacionTablas {
  conservar: string[]
  borrar: string[]
}

const NOMBRE_TABLA = /^(public|private)\.[a-z_][a-z0-9_]*$/

/** Nombre calificado seguro para interpolar en SQL (solo los que da `private.tablas_limpieza()`). */
export function exigirNombreTabla(tabla: string): string {
  if (!NOMBRE_TABLA.test(tabla)) {
    throw new Error(`Nombre de tabla inesperado: ${tabla}`)
  }
  return tabla
}

/** Tablas de public y private que la limpieza no clasificó: sobrevivirían sin que nadie lo decida. */
export function tablasSinClasificar(
  todas: readonly string[],
  clasificacion: ClasificacionTablas
): string[] {
  const clasificadas = new Set([
    ...clasificacion.conservar,
    ...clasificacion.borrar,
  ])
  return todas.filter((tabla) => !clasificadas.has(tabla)).sort()
}

/**
 * Tablas que vuelven a llenarse en cuanto alguien usa la plataforma tras la limpieza (su propio registro, los
 * ingresos de los superadministradores, la revisión de la configuración, una solicitud pública de vinculación): en
 * ellas solo cuenta lo anterior a la limpieza.
 */
export const TABLAS_ACTIVIDAD: ReadonlySet<string> = new Set([
  "public.bitacora",
  "public.accesos",
  "public.notificaciones",
  "public.solicitudes_vinculacion",
  "private.intentos_login",
  "private.correos_salientes",
])

/**
 * ¿Falta la parte de base de datos? No, solo si ya hubo una limpieza (su registro en la bitácora), no queda negocio
 * y solo quedan las cuentas que se conservan: entonces se retoma en Storage (p. ej. tras un corte de red).
 */
export function sqlPendiente(
  conteos: Readonly<Record<string, number>>,
  hayRegistroLimpieza: boolean,
  usuariosABorrar: number
): boolean {
  if (!hayRegistroLimpieza || usuariosABorrar > 0) return true
  return Object.entries(conteos).some(
    ([tabla, filas]) => !TABLAS_ACTIVIDAD.has(tabla) && filas > 0
  )
}

// ── Textos legales ───────────────────────────────────────────────────────────

export interface VersionTermino {
  id: string
  tipo: TipoTermino
  version: string
  publicada: boolean
  vigenteDesde: string | null
}

/** Misma regla que `private.limpiar_pruebas` (`version like '%PRUEBA%'`): esas versiones se retiran siempre. */
export function esVersionDePrueba(version: string): boolean {
  return version.includes("PRUEBA")
}

/** Ids que la limpieza retira: las de prueba más las que el respaldo de `prod:config-pruebas` registró. */
export function idsTerminosARetirar(
  versiones: readonly VersionTermino[],
  delRespaldo: readonly string[]
): string[] {
  const deVersiones = versiones
    .filter((version) => esVersionDePrueba(version.version))
    .map((version) => version.id)
  return [...new Set([...deVersiones, ...delRespaldo])].sort()
}

/**
 * Documentos legales que quedarían sin una versión vigente tras retirar las de prueba: sin ella,
 * `terminos_pendientes()` no exige nada y los medios y anunciantes operarían sin aceptar la política.
 */
export function tiposSinTextoDefinitivo(
  versiones: readonly VersionTermino[],
  ahora: Date,
  retirar: ReadonlySet<string>
): TipoTermino[] {
  return TIPOS_TERMINOS.filter(
    (tipo) =>
      !versiones.some(
        (version) =>
          version.tipo === tipo &&
          version.publicada &&
          version.vigenteDesde !== null &&
          new Date(version.vigenteDesde).getTime() <= ahora.getTime() &&
          !esVersionDePrueba(version.version) &&
          !retirar.has(version.id)
      )
  )
}

/**
 * Quita del respaldo de `prod:config-pruebas` las versiones que la limpieza retiró, para que `--revertir` no las
 * siga anunciando. Devuelve el mismo objeto si no cambia nada.
 */
export function sinTerminosRetirados(
  respaldo: RespaldoConfiguracion,
  retirados: ReadonlySet<string>
): RespaldoConfiguracion {
  const quedan = respaldo.terminos.filter(
    (termino) => !retirados.has(termino.id)
  )
  return quedan.length === respaldo.terminos.length
    ? respaldo
    : { ...respaldo, terminos: quedan }
}

// ── Respaldo del mismo día ───────────────────────────────────────────────────

export interface ArchivoRespaldo {
  ruta: string
  /** `null` si no existe. */
  bytes: number | null
  modo: number | null
}

/** Esquema y datos de producción del día (Bogotá) con la etiqueta de la limpieza. */
export function rutasRespaldoRequeridas(ahora: Date): string[] {
  return (["esquema", "datos"] as const).map((parte) =>
    join(
      CARPETA_RESPALDOS,
      nombreRespaldo("produccion", ahora, ETIQUETA_RESPALDO, parte)
    )
  )
}

export function problemasRespaldo(
  archivos: readonly ArchivoRespaldo[]
): string[] {
  const problemas: string[] = []
  for (const archivo of archivos) {
    if (archivo.bytes === null) {
      problemas.push(
        `Falta el respaldo de hoy ${archivo.ruta}: ejecuta pnpm db:respaldo produccion --etiqueta ${ETIQUETA_RESPALDO}.`
      )
    } else if (archivo.bytes === 0) {
      problemas.push(
        `El respaldo ${archivo.ruta} está vacío: repítelo antes de limpiar.`
      )
    } else if (archivo.modo !== null && (archivo.modo & 0o077) !== 0) {
      problemas.push(
        `${archivo.ruta} es legible por otros usuarios (tiene datos personales): chmod 600.`
      )
    }
  }
  return problemas
}

// ── Salvaguardas ─────────────────────────────────────────────────────────────

export interface HechosLimpieza {
  argumentos: ArgumentosLimpieza
  superadmins: readonly Superadmin[]
  superadminEmail: string | undefined
  textosSinDefinitivo: readonly TipoTermino[]
  /** Archivos del respaldo del día (solo producción y solo si falta la parte de base de datos). */
  respaldo: readonly ArchivoRespaldo[] | null
  tablasSinClasificar: readonly string[]
}

/**
 * Lo que impide ejecutar por el estado de la base y del equipo (la simulación lo muestra para saber qué falta).
 * Fuera de producción solo bloquea lo que haría fallar la limpieza o la dejaría a medias.
 */
export function problemasDeEstado(hechos: HechosLimpieza): string[] {
  const problemas: string[] = []
  if (hechos.tablasSinClasificar.length > 0) {
    problemas.push(
      `Tablas sin clasificar en private.tablas_limpieza() (sobrevivirían a la limpieza): ${hechos.tablasSinClasificar.join(", ")}.`
    )
  }
  const activos = superadminsActivos(hechos.superadmins)
  if (activos.length === 0) {
    problemas.push(
      "No hay superadministradores activos: la plataforma quedaría sin quien la administre."
    )
  }
  if (hechos.argumentos.entorno !== "produccion") return problemas

  if (activos.length !== SUPERADMINS_PRODUCCION) {
    problemas.push(
      `Debe haber exactamente ${SUPERADMINS_PRODUCCION} superadministradores activos y hay ${activos.length}.`
    )
  }
  const sinFactor = activos.filter(
    (superadmin) => superadmin.factoresVerificados === 0
  )
  if (sinFactor.length > 0) {
    problemas.push(
      `Superadministradores sin un factor MFA verificado: ${sinFactor.map((superadmin) => correoVisible(superadmin.email)).join(", ")}.`
    )
  }
  const inactivos = hechos.superadmins.filter(
    (superadmin) => !activos.includes(superadmin)
  )
  if (inactivos.length > 0) {
    problemas.push(
      `Superadministradores que no están activos y se borrarían: ${inactivos.map((superadmin) => `${correoVisible(superadmin.email)} (${superadmin.estado})`).join(", ")}. Actívalos o elimínalos antes.`
    )
  }
  const correo = hechos.superadminEmail?.trim().toLowerCase()
  if (!correo) {
    problemas.push("Define SUPERADMIN_EMAIL en el archivo de la app.")
  } else if (
    !activos.some((superadmin) => superadmin.email.toLowerCase() === correo)
  ) {
    problemas.push(
      "SUPERADMIN_EMAIL no es uno de los superadministradores activos."
    )
  }
  if (
    hechos.textosSinDefinitivo.length > 0 &&
    !hechos.argumentos.sinTextosDefinitivos
  ) {
    problemas.push(
      `Sin versión definitiva vigente (publícala antes o usa --sin-textos-definitivos): ${hechos.textosSinDefinitivo.join(", ")}.`
    )
  }
  if (hechos.respaldo) problemas.push(...problemasRespaldo(hechos.respaldo))
  return problemas
}

/** Lo que impide ejecutar por cómo se pidió (banderas, terminal). */
export function problemasDeOrden(
  argumentos: ArgumentosLimpieza,
  terminal: { tty: boolean; ci: boolean }
): string[] {
  const problemas: string[] = []
  if (argumentos.entorno === "local") return problemas
  if (argumentos.entorno === "produccion" && !argumentos.confirmarProduccion) {
    problemas.push("Ejecutar en producción exige --confirmar-produccion.")
  }
  if (terminal.ci) {
    problemas.push("La limpieza no corre en integración continua (CI).")
  }
  if (!terminal.tty) {
    problemas.push(
      "La confirmación se escribe en una terminal interactiva (TTY)."
    )
  }
  return problemas
}

/** Avisos que no bloquean: el operador decide. */
export function avisosDeEstado(hechos: HechosLimpieza): string[] {
  const avisos: string[] = []
  if (hechos.argumentos.entorno === "produccion") {
    if (
      hechos.textosSinDefinitivo.length > 0 &&
      hechos.argumentos.sinTextosDefinitivos
    ) {
      avisos.push(
        `Quedarán sin versión vigente (--sin-textos-definitivos): ${hechos.textosSinDefinitivo.join(", ")}. Nadie tendrá que aceptarlos hasta que se publiquen.`
      )
    }
    return avisos
  }
  const sinFactor = superadminsActivos(hechos.superadmins).filter(
    (superadmin) => superadmin.factoresVerificados === 0
  )
  if (sinFactor.length > 0) {
    avisos.push(
      `Superadministradores sin MFA verificado (en producción bloquearía): ${sinFactor.map((superadmin) => correoVisible(superadmin.email)).join(", ")}.`
    )
  }
  if (hechos.textosSinDefinitivo.length > 0) {
    avisos.push(
      `Sin versión legal definitiva vigente (en producción bloquearía): ${hechos.textosSinDefinitivo.join(", ")}.`
    )
  }
  const activos = superadminsActivos(hechos.superadmins)
  const inactivos = hechos.superadmins.filter(
    (superadmin) => !activos.includes(superadmin)
  )
  if (inactivos.length > 0) {
    avisos.push(
      `Superadministradores no activos que se borrarán (en producción bloquearía): ${inactivos.map((superadmin) => `${correoVisible(superadmin.email)} (${superadmin.estado})`).join(", ")}.`
    )
  }
  return avisos
}

/** El operador escribió el ref exacto del proyecto. */
export function confirmacionCorrecta(escrito: string, ref: string): boolean {
  return escrito.trim() === ref
}

// ── Lo que se borra ──────────────────────────────────────────────────────────

export function correoVisible(email: string | null): string {
  return enmascararEmail(email) ?? "(sin correo)"
}

export interface UsuarioABorrar {
  email: string | null
  rol: string | null
}

export interface ResumenUsuarios {
  total: number
  porRol: Record<string, number>
  /**
   * Correos enmascarados con cuántas cuentas comparten cada máscara (las de prueba suelen compartirla:
   * `de•••@demo.amo.co`), de la más repetida a la menos.
   */
  correos: { correo: string; cuentas: number }[]
}

export function resumirUsuarios(
  usuarios: readonly UsuarioABorrar[]
): ResumenUsuarios {
  const porRol: Record<string, number> = {}
  const porCorreo = new Map<string, number>()
  for (const usuario of usuarios) {
    const rol = usuario.rol ?? "SIN_PERFIL"
    porRol[rol] = (porRol[rol] ?? 0) + 1
    const correo = correoVisible(usuario.email)
    porCorreo.set(correo, (porCorreo.get(correo) ?? 0) + 1)
  }
  return {
    total: usuarios.length,
    porRol,
    correos: [...porCorreo]
      .map(([correo, cuentas]) => ({ correo, cuentas }))
      .sort(
        (a, b) => b.cuentas - a.cuentas || a.correo.localeCompare(b.correo)
      ),
  }
}

export interface ObjetoStorage {
  bucket: string
  nombre: string
  bytes: number
}

export interface TotalStorage {
  objetos: number
  bytes: number
}

export interface PlanStorage {
  borrar: ObjetoStorage[]
  conservar: ObjetoStorage[]
  porBucket: Record<string, TotalStorage>
  total: TotalStorage
}

/** Todo Storage se borra salvo los avatares que los superadministradores conservados siguen usando. */
export function planStorage(
  objetos: readonly ObjetoStorage[],
  avataresConservados: readonly string[]
): PlanStorage {
  const conservar = new Set(avataresConservados)
  const plan: PlanStorage = {
    borrar: [],
    conservar: [],
    porBucket: {},
    total: { objetos: 0, bytes: 0 },
  }
  for (const objeto of objetos) {
    if (objeto.bucket === "avatares" && conservar.has(objeto.nombre)) {
      plan.conservar.push(objeto)
      continue
    }
    plan.borrar.push(objeto)
    const bucket = (plan.porBucket[objeto.bucket] ??= { objetos: 0, bytes: 0 })
    bucket.objetos += 1
    bucket.bytes += objeto.bytes
    plan.total.objetos += 1
    plan.total.bytes += objeto.bytes
  }
  return plan
}

/** Rutas a borrar agrupadas por bucket, en orden estable. */
export function rutasPorBucket(
  objetos: readonly ObjetoStorage[]
): Map<string, string[]> {
  const grupos = new Map<string, string[]>()
  for (const objeto of [...objetos].sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) || a.nombre.localeCompare(b.nombre)
  )) {
    const rutas = grupos.get(objeto.bucket) ?? []
    rutas.push(objeto.nombre)
    grupos.set(objeto.bucket, rutas)
  }
  return grupos
}

/** «512 B», «1,6 KB», «12,3 MB» o «1,2 GB» (es-CO). */
export function formatearTamano(bytes: number): string {
  const unidades = ["B", "KB", "MB", "GB"] as const
  let valor = bytes
  let indice = 0
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024
    indice += 1
  }
  return `${formatearNumero(valor, indice === 0 ? 0 : 1)} ${unidades[indice]}`
}

/** Filas en orden descendente, sin las vacías, para el resumen de la terminal. */
export function conteosOrdenados(
  conteos: Readonly<Record<string, number>>
): [string, number][] {
  return Object.entries(conteos)
    .filter(([, filas]) => filas > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
}

// ── Avisos de configuración que la limpieza conserva ────────────────────────

export interface ResolucionDian {
  id: string
  tipo: string
  prefijo: string
  numeroResolucion: string
  rangoDesde: number
  consecutivoActual: number
}

/**
 * Resoluciones que no son de prueba ni demo y cuyo consecutivo avanzó durante las pruebas: los documentos se borran,
 * pero la numeración no retrocede (decisión del contador: reiniciarla o seguir desde ahí).
 */
export function resolucionesConConsecutivoUsado(
  resoluciones: readonly ResolucionDian[],
  idsDePrueba: ReadonlySet<string>
): ResolucionDian[] {
  return resoluciones.filter(
    (resolucion) =>
      !idsDePrueba.has(resolucion.id) &&
      resolucion.prefijo !== "DEMO" &&
      resolucion.consecutivoActual >= resolucion.rangoDesde
  )
}

export interface CambioConfiguracion {
  entidad: string
  accion: string
  cambios: number
  ultimo: string
}

/**
 * Entidades de configuración que la limpieza conserva (`conservar` de `private.tablas_limpieza()`, sin perfiles ni
 * catálogos geográficos): lo que alguien cambió en ellas durante las pruebas sigue vigente después.
 */
export function entidadesConfiguracion(
  clasificacion: ClasificacionTablas
): string[] {
  const fuera = new Set([
    "perfiles",
    "perfiles_privado",
    "paises",
    "departamentos",
    "municipios",
  ])
  return clasificacion.conservar
    .filter((tabla) => tabla.startsWith("public."))
    .map((tabla) => tabla.slice("public.".length))
    .filter((tabla) => !fuera.has(tabla))
    .sort()
}

// ── Verificación ─────────────────────────────────────────────────────────────

export interface HechosVerificacion {
  /** Filas de cada tabla que se borra: en las de actividad, solo las anteriores a la limpieza. */
  restantes: Readonly<Record<string, number>>
  perfiles: number
  usuariosAuth: number
  conservar: number
  storagePendiente: number
  /** Parámetros de prueba que `--revertir` no pudo devolver (cambiados a mano después). */
  parametrosPendientes: readonly string[]
  /** Retenciones, ReteICA o resoluciones de prueba que siguen. */
  finanzasPendientes: number
}

export function problemasVerificacion(hechos: HechosVerificacion): string[] {
  const problemas = conteosOrdenados(hechos.restantes).map(
    ([tabla, filas]) =>
      `${tabla}: quedan ${formatearNumero(filas)} filas${TABLAS_ACTIVIDAD.has(tabla) ? " anteriores a la limpieza" : ""}.`
  )
  if (hechos.perfiles !== hechos.conservar) {
    problemas.push(
      `Quedan ${hechos.perfiles} perfiles; se esperaban ${hechos.conservar}.`
    )
  }
  if (hechos.usuariosAuth !== hechos.conservar) {
    problemas.push(
      `Quedan ${hechos.usuariosAuth} cuentas en auth.users; se esperaban ${hechos.conservar}.`
    )
  }
  if (hechos.storagePendiente > 0) {
    problemas.push(
      `Quedan ${formatearNumero(hechos.storagePendiente)} objetos de Storage por borrar (vuelve a ejecutar: se retoma ahí).`
    )
  }
  if (hechos.parametrosPendientes.length > 0) {
    problemas.push(
      `Parámetros de prueba sin revertir (alguien los cambió después): ${hechos.parametrosPendientes.join(", ")}.`
    )
  }
  if (hechos.finanzasPendientes > 0) {
    problemas.push(
      `Siguen ${hechos.finanzasPendientes} vigencias tributarias o resoluciones de prueba (pnpm prod:config-pruebas --revertir).`
    )
  }
  return problemas
}

// ── Informe ──────────────────────────────────────────────────────────────────

/** `context/respaldos/limpieza-<ref>-<día de Bogotá>.json`. */
export function rutaInforme(ref: string, ahora: Date): string {
  return join(
    CARPETA_RESPALDOS,
    `limpieza-${ref}-${serializarFecha(ahora)}.json`
  )
}
