/**
 * `pnpm prod:config-pruebas [--aplicar | --revertir] [--confirmar-produccion]` — configuración rotulada
 * para que el cliente pruebe los flujos de punta a punta en producción (plan de las Entregas 2 y 3):
 *
 * - Parámetros con tiempos cortos (`PARAMETROS_PRUEBA`): anticipación mínima 0 h, corte de métricas
 *   `["H24"]` y creativos de hasta 25 MB. Solo valores que la configuración ya admite.
 * - Términos, condiciones y política de datos «VERSIÓN DE PRUEBA» (`0.1-PRUEBA`) publicados, para
 *   probar la compuerta de aceptación. Si el cliente ya publicó un texto propio de un tipo, ese tipo
 *   no se toca.
 *
 * Sin argumentos solo muestra lo que haría. Escribe como servicio con contexto confiable, a nombre del
 * superadministrador de `SUPERADMIN_EMAIL` (la bitácora lo registra). Lo que cambia queda en
 * `context/respaldos/configuracion-pruebas-<ref>.json` (0600, fuera de git) y `--revertir` restaura
 * cada parámetro que siga con el valor de prueba. Las versiones legales publicadas son inmutables: las
 * retira la limpieza final. Entorno: `AMO_ARCHIVO_ENTORNO` (por defecto `.env.local`); contra
 * producción exige `--confirmar-produccion`. No imprime claves.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { esProduccion } from "../bootstrap/produccion"
import {
  buscarUsuarioPorEmail,
  cargarEntorno,
  type ClienteSupabase,
  crearClienteServicio,
  describirProyecto,
  ErrorBootstrap,
  idDeRol,
} from "../bootstrap/supabase"
import {
  contenidoTerminosPrueba,
  leerArgumentos,
  mostrar,
  olvidarParametro,
  PARAMETROS_PRUEBA,
  type PasoParametro,
  planAplicar,
  planRevertir,
  planTerminos,
  registrarCambio,
  type RespaldoConfiguracion,
  respaldoVacio,
  VERSION_TERMINOS_PRUEBA,
} from "./configuracion-pruebas-plan"

function informar(linea: string): void {
  process.stderr.write(`${linea}\n`)
}

function rutaRespaldo(proyecto: string): string {
  return join("context", "respaldos", `configuracion-pruebas-${proyecto}.json`)
}

function leerRespaldo(ruta: string): RespaldoConfiguracion | null {
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, "utf8")) as RespaldoConfiguracion
}

function guardarRespaldo(ruta: string, respaldo: RespaldoConfiguracion): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  writeFileSync(ruta, `${JSON.stringify(respaldo, null, 2)}\n`, {
    mode: 0o600,
  })
}

/** Superadministrador activo de `SUPERADMIN_EMAIL`: a su nombre quedan los cambios. */
async function idSuperadmin(
  servicio: ClienteSupabase,
  email: string | undefined
): Promise<string> {
  if (!email) throw new ErrorBootstrap("Define SUPERADMIN_EMAIL en el entorno.")
  const usuario = await buscarUsuarioPorEmail(servicio, email)
  const rolSuper = await idDeRol(servicio, "SUPERADMIN")
  const { data: perfil } = usuario
    ? await servicio
        .from("perfiles")
        .select("rol_id, estado")
        .eq("id", usuario.id)
        .single()
    : { data: null }
  if (!usuario || perfil?.rol_id !== rolSuper || perfil.estado !== "ACTIVO") {
    throw new ErrorBootstrap(
      "SUPERADMIN_EMAIL no corresponde a un superadministrador activo."
    )
  }
  return usuario.id
}

async function leerParametros(servicio: ClienteSupabase) {
  const { data, error } = await servicio
    .from("configuracion")
    .select("clave, valor, updated_at")
    .in("clave", Object.keys(PARAMETROS_PRUEBA))
  if (error) throw new ErrorBootstrap(`No se pudo leer: ${error.message}`)
  return data
}

function describirPaso(paso: PasoParametro): string {
  switch (paso.tipo) {
    case "cambiar":
      return `${paso.clave}: ${mostrar(paso.desde)} → ${mostrar(paso.hacia)}`
    case "igual":
      return `${paso.clave}: ya está en ${mostrar(paso.valor)}`
    case "falta":
      return `${paso.clave}: no existe en esta base (se omite)`
    case "ajeno":
      return `${paso.clave}: ahora vale ${mostrar(paso.actual)}, no el de prueba ${mostrar(paso.esperado)}; alguien lo cambió y se deja así`
  }
}

/** Escribe un parámetro solo si nadie lo cambió desde que se leyó. */
async function escribirParametro(
  servicio: ClienteSupabase,
  paso: Extract<PasoParametro, { tipo: "cambiar" }>
): Promise<void> {
  const { data, error } = await servicio
    .from("configuracion")
    .update({ valor: paso.hacia })
    .eq("clave", paso.clave)
    .eq("updated_at", paso.marca)
    .select("clave")
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo guardar ${paso.clave}: ${error.message}`
    )
  }
  if (data.length === 0) {
    throw new ErrorBootstrap(
      `${paso.clave} cambió mientras corría el script; vuelve a ejecutarlo.`
    )
  }
}

async function aplicarTerminos(
  servicio: ClienteSupabase,
  respaldo: RespaldoConfiguracion,
  simular: boolean
): Promise<RespaldoConfiguracion> {
  const { data: versiones, error } = await servicio
    .from("terminos_versiones")
    .select("id, tipo, version, publicada")
  if (error) throw new ErrorBootstrap(`No se pudo leer: ${error.message}`)

  let resultado = respaldo
  for (const paso of planTerminos(versiones)) {
    const etiqueta = `${paso.termino} ${VERSION_TERMINOS_PRUEBA}`
    if (paso.tipo === "hay-texto-real") {
      informar(
        `  · ${paso.termino}: ya tiene la versión ${paso.version} del cliente (no se toca)`
      )
      continue
    }
    if (paso.tipo === "ya-publicada") {
      informar(`  · ${etiqueta}: ya publicada`)
      continue
    }
    informar(
      `  ${simular ? "→" : "✓"} ${etiqueta}: ${paso.tipo === "crear" ? "crear y publicar" : "publicar"}`
    )
    if (simular) continue

    let id = paso.tipo === "publicar" ? paso.id : null
    if (id === null) {
      const { data, error: errorCrear } = await servicio
        .from("terminos_versiones")
        .insert({
          tipo: paso.termino,
          version: VERSION_TERMINOS_PRUEBA,
          contenido_md: contenidoTerminosPrueba(paso.termino),
        })
        .select("id")
        .single()
      if (errorCrear) {
        throw new ErrorBootstrap(
          `No se pudo crear ${etiqueta}: ${errorCrear.message}`
        )
      }
      id = data.id
    }
    // Sin `vigente_desde`, el trigger fija la vigencia en el instante de publicar.
    const { error: errorPublicar } = await servicio
      .from("terminos_versiones")
      .update({ publicada: true })
      .eq("id", id)
      .eq("publicada", false)
    if (errorPublicar) {
      throw new ErrorBootstrap(
        `No se pudo publicar ${etiqueta}: ${errorPublicar.message}`
      )
    }
    resultado = {
      ...resultado,
      terminos: [
        ...resultado.terminos.filter((termino) => termino.id !== id),
        { id, tipo: paso.termino, version: VERSION_TERMINOS_PRUEBA },
      ],
    }
  }
  return resultado
}

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2))
  const entorno = cargarEntorno()
  const proyecto = describirProyecto(entorno)
  const enProduccion = esProduccion(entorno.url)
  if (
    enProduccion &&
    argumentos.modo !== "simular" &&
    !argumentos.confirmarProduccion
  ) {
    throw new ErrorBootstrap(
      "Cambiar la configuración de producción exige --confirmar-produccion (revisa antes la simulación, sin argumentos)."
    )
  }

  const lector = crearClienteServicio(entorno)
  const actorId = await idSuperadmin(lector, entorno.superadminEmail)
  const servicio = crearClienteServicio(entorno, actorId)
  const ruta = rutaRespaldo(proyecto)
  const simular = argumentos.modo === "simular"
  informar(
    `Configuración de prueba en ${proyecto}${enProduccion ? " (PRODUCCIÓN)" : ""} · ${simular ? "simulación: no cambia nada" : argumentos.modo}`
  )

  let respaldo = leerRespaldo(ruta) ?? respaldoVacio(proyecto, new Date())
  const actuales = await leerParametros(servicio)

  if (argumentos.modo === "revertir") {
    if (Object.keys(respaldo.parametros).length === 0) {
      informar(`No hay parámetros que revertir (${ruta}).`)
    }
    for (const paso of planRevertir(respaldo, actuales)) {
      informar(
        `  ${paso.tipo === "cambiar" ? "✓" : "·"} ${describirPaso(paso)}`
      )
      if (paso.tipo === "cambiar") await escribirParametro(servicio, paso)
      if (paso.tipo !== "ajeno")
        respaldo = olvidarParametro(respaldo, paso.clave)
    }
    if (respaldo.terminos.length > 0) {
      informar(
        `  · ${respaldo.terminos.length} versiones legales de prueba siguen publicadas: son inmutables y las retira la limpieza final.`
      )
    }
    guardarRespaldo(ruta, respaldo)
    return
  }

  informar("Parámetros:")
  for (const paso of planAplicar(actuales)) {
    informar(
      `  ${paso.tipo === "cambiar" && !simular ? "✓" : paso.tipo === "cambiar" ? "→" : "·"} ${describirPaso(paso)}`
    )
    if (paso.tipo !== "cambiar" || simular) continue
    await escribirParametro(servicio, paso)
    respaldo = registrarCambio(respaldo, paso.clave, paso.desde, paso.hacia)
    // Se guarda tras cada escritura: si algo falla después, lo anterior no se pierde.
    guardarRespaldo(ruta, respaldo)
  }
  informar("Textos legales:")
  respaldo = await aplicarTerminos(servicio, respaldo, simular)
  if (!simular) {
    guardarRespaldo(ruta, respaldo)
    informar(`Respaldo de lo cambiado: ${ruta}`)
  }
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`configuracion-pruebas falló: ${mensaje}\n`)
  process.exitCode = 1
})
