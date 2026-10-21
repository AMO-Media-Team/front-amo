/**
 * `pnpm demo:purgar <storage|sql|usuarios|verificar> [--forzar]`
 * Purga de los datos demo (docs/modelo-datos.md §10.5 y supabase/seed/demo/README.md).
 *
 * Los pasos van en este orden:
 * 1. `storage`   — borra de Storage los objetos de las entidades demo y las
 *    capturas compartidas `evidencias/muestras/`. Va ANTES del SQL porque
 *    necesita las filas para saber qué carpetas `{tipo}/{id}` son demo.
 * 2. `sql`       — imprime la transacción de purga. Se ejecuta por MCP
 *    `execute_sql`, el único canal con `session_user = postgres`: este
 *    script no puede correrla (por PostgREST los interruptores no aplican).
 * 3. `usuarios`  — borra de Auth las cuentas demo (cascada a `perfiles`). Se
 *    niega a correr mientras el paso 2 no haya desvinculado sus organizaciones.
 * 4. `verificar` — cuenta lo que sigue marcado `es_demo`; termina con error si queda algo.
 *
 * Las cuentas E2E (`e2e.*@amo.test`) no se borran. Fuera de un entorno local exige `--forzar`.
 */
import {
  cargarEntorno,
  type ClienteSupabase,
  crearClienteServicio,
  ErrorBootstrap,
} from "../bootstrap/supabase"
import { esCorreoDemo } from "./cuentas"
import { enParalelo, exigirEntornoLocal } from "./entorno"
import {
  CARPETAS_STORAGE,
  type DuenoStorage,
  enLotes,
  esUuid,
  MUESTRAS_DEMO,
  sqlPurga,
} from "./purga"

const ARCHIVO_ENV = ".env.local"
const LOTE_IDS = 100
const PAGINA = 1000

interface ErrorConsulta {
  message: string
}

type ConsultaIds = (
  ids: string[]
) => PromiseLike<{ data: { id: string }[] | null; error: ErrorConsulta | null }>

type ConsultaHijos = (ids: string[]) => PromiseLike<{
  data: { id: string; padre: string | null }[] | null
  error: ErrorConsulta | null
}>

/** De `ids`, los que la consulta devuelve (se pregunta por lotes). */
async function reunirIds(
  ids: readonly string[],
  consulta: ConsultaIds
): Promise<Set<string>> {
  const encontrados = new Set<string>()
  for (const lote of enLotes(ids, LOTE_IDS)) {
    const { data, error } = await consulta(lote)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudieron leer las entidades demo: ${error.message}`
      )
    }
    for (const fila of data ?? []) encontrados.add(fila.id)
  }
  return encontrados
}

/** De `ids`, los que cuelgan de un padre demo (oferta → campaña, disputa → asignación…). */
async function reunirHijos(
  ids: readonly string[],
  hijos: ConsultaHijos,
  padresDemo: ConsultaIds
): Promise<Set<string>> {
  const padreDe = new Map<string, string>()
  for (const lote of enLotes(ids, LOTE_IDS)) {
    const { data, error } = await hijos(lote)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudieron leer las entidades demo: ${error.message}`
      )
    }
    for (const fila of data ?? []) {
      if (fila.padre) padreDe.set(fila.id, fila.padre)
    }
  }
  const demo = await reunirIds([...new Set(padreDe.values())], padresDemo)
  return new Set(
    [...padreDe].filter(([, padre]) => demo.has(padre)).map(([id]) => id)
  )
}

/** Para cada tipo de dueño, cuáles de los ids encontrados en Storage son de datos demo. */
function resolutoresDemo(
  servicio: ClienteSupabase
): Record<DuenoStorage, (ids: readonly string[]) => Promise<Set<string>>> {
  const asignaciones: ConsultaIds = (lote) =>
    servicio
      .from("asignaciones")
      .select("id")
      .in("id", lote)
      .eq("es_demo", true)
  const liquidaciones: ConsultaIds = (lote) =>
    servicio
      .from("liquidaciones")
      .select("id")
      .in("id", lote)
      .eq("es_demo", true)
  const campanas: ConsultaIds = (lote) =>
    servicio.from("campanas").select("id").in("id", lote).eq("es_demo", true)

  return {
    // Los perfiles E2E también son `es_demo`: aquí manda el correo, como en el paso `usuarios`.
    perfil: async (ids) => {
      const demo = new Set<string>()
      for (const lote of enLotes(ids, LOTE_IDS)) {
        const { data, error } = await servicio
          .from("perfiles")
          .select("id, email")
          .in("id", lote)
        if (error) {
          throw new ErrorBootstrap(
            `No se pudieron leer los perfiles: ${error.message}`
          )
        }
        for (const perfil of data) {
          if (esCorreoDemo(String(perfil.email))) demo.add(perfil.id)
        }
      }
      return demo
    },
    medio: (ids) =>
      reunirIds(ids, (lote) =>
        servicio.from("medios").select("id").in("id", lote).eq("es_demo", true)
      ),
    anunciante: (ids) =>
      reunirIds(ids, (lote) =>
        servicio
          .from("anunciantes")
          .select("id")
          .in("id", lote)
          .eq("es_demo", true)
      ),
    oferta: (ids) =>
      reunirHijos(
        ids,
        (lote) =>
          servicio
            .from("ofertas")
            .select("id, padre:campana_id")
            .in("id", lote),
        campanas
      ),
    asignacion: (ids) => reunirIds(ids, asignaciones),
    disputa: (ids) =>
      reunirHijos(
        ids,
        (lote) =>
          servicio
            .from("disputas")
            .select("id, padre:asignacion_id")
            .in("id", lote),
        asignaciones
      ),
    liquidacion: (ids) => reunirIds(ids, liquidaciones),
    factura: (ids) =>
      reunirIds(ids, (lote) =>
        servicio
          .from("facturas")
          .select("id")
          .in("id", lote)
          .eq("es_demo", true)
      ),
    documento_soporte: (ids) =>
      reunirHijos(
        ids,
        (lote) =>
          servicio
            .from("documentos_soporte")
            .select("id, padre:liquidacion_id")
            .in("id", lote),
        liquidaciones
      ),
    dispersion: (ids) =>
      reunirIds(ids, (lote) =>
        servicio
          .from("dispersiones")
          .select("id")
          .in("id", lote)
          .eq("es_demo", true)
      ),
  }
}

interface EntradaStorage {
  nombre: string
  esCarpeta: boolean
}

async function listar(
  servicio: ClienteSupabase,
  bucket: string,
  carpeta: string
): Promise<EntradaStorage[]> {
  const entradas: EntradaStorage[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await servicio.storage.from(bucket).list(carpeta, {
      limit: PAGINA,
      offset: desde,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) {
      throw new ErrorBootstrap(
        `No se pudo listar ${bucket}/${carpeta}: ${error.message}`
      )
    }
    for (const objeto of data) {
      entradas.push({ nombre: objeto.name, esCarpeta: objeto.id === null })
    }
    if (data.length < PAGINA) return entradas
  }
}

async function archivosBajo(
  servicio: ClienteSupabase,
  bucket: string,
  carpeta: string
): Promise<string[]> {
  const rutas: string[] = []
  for (const entrada of await listar(servicio, bucket, carpeta)) {
    const ruta = `${carpeta}/${entrada.nombre}`
    if (entrada.esCarpeta) {
      rutas.push(...(await archivosBajo(servicio, bucket, ruta)))
    } else {
      rutas.push(ruta)
    }
  }
  return rutas
}

async function borrarCarpeta(
  servicio: ClienteSupabase,
  bucket: string,
  carpeta: string
): Promise<number> {
  const rutas = await archivosBajo(servicio, bucket, carpeta)
  for (const lote of enLotes(rutas, LOTE_IDS)) {
    const { error } = await servicio.storage.from(bucket).remove(lote)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudo borrar en ${bucket}/${carpeta}: ${error.message}`
      )
    }
  }
  return rutas.length
}

async function purgarStorage(servicio: ClienteSupabase): Promise<void> {
  const resolutores = resolutoresDemo(servicio)
  let borrados = 0
  for (const [bucket, carpetas] of Object.entries(CARPETAS_STORAGE)) {
    for (const [carpeta, dueno] of Object.entries(carpetas)) {
      const ids = (await listar(servicio, bucket, carpeta))
        .filter((entrada) => entrada.esCarpeta && esUuid(entrada.nombre))
        .map((entrada) => entrada.nombre)
      if (ids.length === 0) continue
      const demo = await resolutores[dueno](ids)
      for (const id of demo) {
        borrados += await borrarCarpeta(servicio, bucket, `${carpeta}/${id}`)
      }
      process.stderr.write(
        `✓ ${bucket}/${carpeta}: ${demo.size} de ${ids.length} carpetas eran demo\n`
      )
    }
  }
  borrados += await borrarCarpeta(
    servicio,
    MUESTRAS_DEMO.bucket,
    MUESTRAS_DEMO.carpeta
  )
  process.stderr.write(
    `Objetos de Storage borrados: ${borrados}.\nSiguiente paso: pnpm demo:purgar sql (se ejecuta por MCP).\n`
  )
}

interface PerfilDemo {
  id: string
  email: string
  vinculado: boolean
}

/** Perfiles de las cuentas demo (por correo: las E2E no entran). */
async function perfilesDemo(servicio: ClienteSupabase): Promise<PerfilDemo[]> {
  const perfiles: PerfilDemo[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await servicio
      .from("perfiles")
      .select("id, email, medio_id, anunciante_id")
      .or('email.like."%@demo.amo.co",email.like."demo.%@amo.test"')
      .order("id")
      .range(desde, desde + PAGINA - 1)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudieron leer los perfiles: ${error.message}`
      )
    }
    for (const perfil of data) {
      const email = String(perfil.email).toLowerCase()
      if (!esCorreoDemo(email)) continue
      perfiles.push({
        id: perfil.id,
        email,
        vinculado: perfil.medio_id !== null || perfil.anunciante_id !== null,
      })
    }
    if (data.length < PAGINA) return perfiles
  }
}

async function borrarUsuarios(servicio: ClienteSupabase): Promise<void> {
  const perfiles = await perfilesDemo(servicio)
  const vinculados = perfiles.filter((perfil) => perfil.vinculado).length
  if (vinculados > 0) {
    throw new ErrorBootstrap(
      `${vinculados} cuentas demo siguen ligadas a su organización: ejecuta antes la purga SQL por MCP (pnpm demo:purgar sql).`
    )
  }
  await enParalelo(perfiles, async (perfil) => {
    const { error } = await servicio.auth.admin.deleteUser(perfil.id)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudo borrar ${perfil.email}: ${error.message}`
      )
    }
  })
  process.stderr.write(
    `Cuentas demo borradas de Auth: ${perfiles.length}.\n` +
      `Borra de ${ARCHIVO_ENV} las variables DEMO_*: ya no corresponden a ninguna cuenta.\n`
  )
}

type ConsultaConteo = () => PromiseLike<{
  count: number | null
  error: ErrorConsulta | null
}>

/** Tablas raíz de los datos demo y cuántas filas `es_demo` conservan. */
function conteosDemo(
  servicio: ClienteSupabase
): Record<string, ConsultaConteo> {
  const opciones = { count: "exact", head: true } as const
  return {
    medios: () =>
      servicio.from("medios").select("id", opciones).eq("es_demo", true),
    anunciantes: () =>
      servicio.from("anunciantes").select("id", opciones).eq("es_demo", true),
    campanas: () =>
      servicio.from("campanas").select("id", opciones).eq("es_demo", true),
    asignaciones: () =>
      servicio.from("asignaciones").select("id", opciones).eq("es_demo", true),
    liquidaciones: () =>
      servicio.from("liquidaciones").select("id", opciones).eq("es_demo", true),
    dispersiones: () =>
      servicio.from("dispersiones").select("id", opciones).eq("es_demo", true),
    facturas: () =>
      servicio.from("facturas").select("id", opciones).eq("es_demo", true),
    pagos_anunciante: () =>
      servicio
        .from("pagos_anunciante")
        .select("id", opciones)
        .eq("es_demo", true),
    notificaciones: () =>
      servicio
        .from("notificaciones")
        .select("id", opciones)
        .eq("es_demo", true),
    accesos: () =>
      servicio.from("accesos").select("id", opciones).eq("es_demo", true),
    bitacora: () =>
      servicio.from("bitacora").select("id", opciones).eq("es_demo", true),
  }
}

async function verificar(servicio: ClienteSupabase): Promise<void> {
  const restos: string[] = []
  for (const [tabla, contar] of Object.entries(conteosDemo(servicio))) {
    const { count, error } = await contar()
    if (error) {
      throw new ErrorBootstrap(`No se pudo contar ${tabla}: ${error.message}`)
    }
    process.stderr.write(`${tabla}: ${count ?? 0}\n`)
    if (count) restos.push(tabla)
  }
  const cuentas = (await perfilesDemo(servicio)).length
  process.stderr.write(`cuentas demo en Auth: ${cuentas}\n`)
  if (cuentas > 0) restos.push("cuentas")
  if (restos.length > 0) {
    throw new ErrorBootstrap(`Quedan datos demo en: ${restos.join(", ")}.`)
  }
  process.stderr.write("Sin datos demo.\n")
}

function imprimirSql(): void {
  process.stdout.write(sqlPurga())
  process.stderr.write(
    "Ejecuta esa transacción por MCP execute_sql (como owner) y después supabase/seed/demo/99_limpieza.sql.\n" +
      "Luego: pnpm demo:purgar usuarios y pnpm demo:purgar verificar.\n"
  )
}

async function main(): Promise<void> {
  const comando = process.argv[2]
  if (comando === "sql") return imprimirSql()
  if (
    comando !== "storage" &&
    comando !== "usuarios" &&
    comando !== "verificar"
  ) {
    throw new ErrorBootstrap(
      "Uso: pnpm demo:purgar <storage|sql|usuarios|verificar> [--forzar] (en ese orden; ver supabase/seed/demo/README.md)"
    )
  }
  const entorno = cargarEntorno(ARCHIVO_ENV)
  exigirEntornoLocal(entorno)
  const servicio = crearClienteServicio(entorno)
  if (comando === "storage") return purgarStorage(servicio)
  if (comando === "usuarios") return borrarUsuarios(servicio)
  return verificar(servicio)
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`demo:purgar falló: ${mensaje}\n`)
  process.exitCode = 1
})
