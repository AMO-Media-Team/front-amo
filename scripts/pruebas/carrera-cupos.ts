/**
 * `pnpm exec tsx --env-file=.env.local scripts/pruebas/carrera-cupos.ts [--solo-limpiar]`
 *
 * Prueba de carrera de `reservar_cupo_srv` contra la BD real, SIN `modo_carga`
 * (docs/modelo-datos.md §5.7, §10.2): prepara por las vías normales un
 * anunciante, 20 medios elegibles con usuario y sesión propios, y una campaña
 * por escenario; dispara ráfagas concurrentes (`Promise.all`) y verifica el
 * número exacto de aceptaciones, cero deadlocks y los invariantes de cupos,
 * presupuestos y topes. Al final borra todo lo creado (también si falla).
 *
 * Usa la secret key y actúa como el superadministrador (`SUPERADMIN_EMAIL`)
 * para dar rol a las cuentas de prueba. No imprime claves ni contraseñas.
 */
import { randomBytes } from "node:crypto"

import { clienteComoSuperadmin } from "../bootstrap/provision-e2e"
import {
  cargarEntorno,
  type ClienteSupabase,
  type EntornoBootstrap,
} from "../bootstrap/supabase"
import {
  activarPerfil,
  type Actor,
  actorDe,
  crearUsuario,
  elevarAal2,
  emailMedio,
  emailOperador,
  ingresar,
} from "./carrera/cuentas"
import {
  crearAnunciante,
  crearMedio,
  enLotes,
  leerCatalogo,
  PREFIJO_NOMBRE,
  type Registro,
  registroVacio,
} from "./carrera/datos"
import {
  aceptarYDesistir,
  cuposEscasos,
  type Entorno,
  idempotencia,
  type MedioConActor,
  presupuestoCompartido,
  presupuestoOferta,
  type ResultadoEscenario,
  topeAnual,
  topePorMedio,
} from "./carrera/escenarios"
import {
  buscarRestos,
  contarRestos,
  hayDatos,
  limpiar,
} from "./carrera/limpieza"

const MEDIOS = 20
const REPETICIONES = 3
/** Preparación en paralelo moderado: no compite con la carrera y respeta el límite de ingresos de Auth. */
const PARALELO_PREPARACION = 4

const log = (linea: string) => process.stderr.write(`${linea}\n`)

async function prepararOperador(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  corrida: string,
  registro: Registro
): Promise<Actor> {
  const email = emailOperador(corrida)
  const { usuarioId, password } = await crearUsuario(servicio, email, "ADMIN")
  registro.usuarios.unshift(usuarioId)
  await activarPerfil(servicio, usuarioId, {
    nombre: `${PREFIJO_NOMBRE}${corrida} operador`,
    rol: "ADMIN",
  })
  const cliente = await ingresar(entorno, email, password)
  await elevarAal2(cliente)
  return actorDe(usuarioId, cliente)
}

async function prepararEntorno(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  corrida: string,
  registro: Registro
): Promise<Entorno> {
  log("· Operador ADMIN con TOTP (sesión aal2)")
  const operador = await prepararOperador(entorno, servicio, corrida, registro)
  const prep = { servicio, corrida, registro, operador }
  const catalogo = await leerCatalogo(servicio)
  log("· Anunciante verificado")
  const anuncianteId = await crearAnunciante(prep, catalogo)
  log(`· ${MEDIOS} medios de nivel 1 con cuenta vigente`)
  const medios = await enLotes(
    Array.from({ length: MEDIOS }, (_, i) => i),
    PARALELO_PREPARACION,
    (i) => crearMedio(prep, i)
  )
  log(`· ${MEDIOS} usuarios MEDIO con sesión`)
  const conActor = await enLotes(
    medios,
    PARALELO_PREPARACION,
    async (medio, i): Promise<MedioConActor> => {
      const email = emailMedio(corrida, i)
      const { usuarioId, password } = await crearUsuario(
        servicio,
        email,
        "MEDIO"
      )
      registro.usuarios.push(usuarioId)
      await activarPerfil(servicio, usuarioId, {
        nombre: `${PREFIJO_NOMBRE}${corrida} medio ${i}`,
        rol: "MEDIO",
        medioId: medio.medioId,
      })
      const actor = await actorDe(
        usuarioId,
        await ingresar(entorno, email, password)
      )
      return { ...medio, actor }
    }
  )
  return { prep, catalogo, anuncianteId, medios: conActor }
}

async function ejecutarEscenarios(
  entornoPrueba: Entorno
): Promise<ResultadoEscenario[]> {
  const pasos: (() => Promise<ResultadoEscenario>)[] = [
    ...Array.from(
      { length: REPETICIONES },
      (_, i) => () => cuposEscasos(entornoPrueba, i + 1)
    ),
    ...Array.from(
      { length: REPETICIONES },
      (_, i) => () => presupuestoCompartido(entornoPrueba, i + 1)
    ),
    () => presupuestoOferta(entornoPrueba),
    () => topePorMedio(entornoPrueba),
    () => aceptarYDesistir(entornoPrueba),
    () => idempotencia(entornoPrueba),
    // Último: deja al medio cerca de su tope anual.
    () => topeAnual(entornoPrueba),
  ]
  const resultados: ResultadoEscenario[] = []
  for (const paso of pasos) {
    const resultado = await paso()
    resultados.push(resultado)
    log(formatear(resultado))
  }
  return resultados
}

function formatear(r: ResultadoEscenario): string {
  const errores = Object.entries(r.resumen.errores)
    .map(([codigo, n]) => `${codigo}×${n}`)
    .join(", ")
  const estado = r.ok ? "OK  " : "FALLA"
  const linea = `${estado} ${r.nombre}: ${r.resumen.exitos}/${r.llamadas} éxitos, deadlocks ${r.resumen.deadlocks}, ${r.duracionMs} ms${errores ? ` [${errores}]` : ""}`
  return [linea, ...r.fallas.map((falla) => `      ✗ ${falla}`)].join("\n")
}

async function main(): Promise<void> {
  const entorno = cargarEntorno(".env.local")
  const servicio = await clienteComoSuperadmin(entorno)

  const restos = await buscarRestos(servicio)
  if (hayDatos(restos)) {
    log("· Limpiando restos de corridas anteriores")
    await limpiar(servicio, restos)
  }
  if (process.argv.includes("--solo-limpiar")) return

  const corrida = randomBytes(3).toString("hex")
  const registro = registroVacio()
  log(`Prueba de carrera de cupos — corrida ${corrida}`)
  let resultados: ResultadoEscenario[] = []
  let errorFatal: unknown = null
  try {
    const entornoPrueba = await prepararEntorno(
      entorno,
      servicio,
      corrida,
      registro
    )
    resultados = await ejecutarEscenarios(entornoPrueba)
  } catch (error) {
    errorFatal = error
  } finally {
    log("· Limpieza")
    const limpieza = await limpiar(servicio, registro)
    const pendientes = await contarRestos(servicio, registro)
    log(
      `  ${limpieza.filasNegocio} entidades y ${limpieza.usuarios} usuarios borrados; filas restantes: ${pendientes}`
    )
    if (pendientes > 0) process.exitCode = 1
  }
  if (errorFatal) throw errorFatal

  const fallidos = resultados.filter((r) => !r.ok)
  const llamadas = resultados.reduce((t, r) => t + r.llamadas, 0)
  const deadlocks = resultados.reduce((t, r) => t + r.resumen.deadlocks, 0)
  log(
    `\n${resultados.length - fallidos.length}/${resultados.length} escenarios OK · ${llamadas} llamadas concurrentes · ${deadlocks} deadlocks`
  )
  if (fallidos.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  log(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
