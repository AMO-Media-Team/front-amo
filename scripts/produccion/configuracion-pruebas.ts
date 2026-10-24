/**
 * `pnpm prod:config-pruebas [--aplicar | --revertir] [--confirmar-produccion]` — configuración rotulada
 * para que el cliente pruebe los flujos de punta a punta en producción (plan de las Entregas 2 y 3):
 *
 * - Parámetros con tiempos cortos (`PARAMETROS_PRUEBA`): anticipación mínima 0 h, corte de métricas
 *   `["H24"]` y creativos de hasta 25 MB. Solo valores que la configuración ya admite.
 * - Términos, condiciones y política de datos «VERSIÓN DE PRUEBA» (`0.1-PRUEBA`) publicados, para
 *   probar la compuerta de aceptación. Si el cliente ya publicó un texto propio de un tipo, ese tipo
 *   no se toca.
 * - Finanzas de prueba (fase 5), solo lo que falte y todo `pendiente_validacion`: retención en la fuente
 *   por servicios de referencia (4 % declarante y 6 % no declarante, desde 4 UVT), ReteICA de referencia
 *   de una lista corta de capitales (Bogotá 9,66 ‰; Medellín, Cali y Barranquilla 10 ‰) y resoluciones
 *   DIAN «PRUEBA» de documento soporte (`PDS`) y de factura (`PFE`), 1–5000, activas solo si no hay otra
 *   activa y vigente. `--revertir` quita lo que el script creó y nadie usó (una liquidación, un documento
 *   soporte o una factura lo referencian: se conserva).
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

import { serializarFecha } from "../../src/lib/fechas"
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
  type CreadoFinanzas,
  leerArgumentos,
  mostrar,
  olvidarCreadoFinanzas,
  olvidarParametro,
  PARAMETROS_PRUEBA,
  type PasoParametro,
  type PasoResolucion,
  planAplicar,
  planResoluciones,
  planRetenciones,
  planReteica,
  planRevertir,
  planRevertirFinanzas,
  planTerminos,
  RETEICA_REFERENCIA,
  registrarCambio,
  registrarCreadoFinanzas,
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

// ── Finanzas de prueba ───────────────────────────────────────────────────────

function porcentaje(tarifa: number): string {
  return `${(tarifa * 100).toLocaleString("es-CO")} %`
}

function describirResolucion(paso: PasoResolucion): string {
  const { tipo, prefijo, numeroResolucion, rangoDesde, rangoHasta } =
    paso.resolucion
  const etiqueta = `${tipo} ${prefijo} (${numeroResolucion}, ${rangoDesde}–${rangoHasta})`
  switch (paso.tipo) {
    case "vigente":
      return `${tipo}: ya hay una resolución activa y vigente (prefijo «${paso.prefijo}»); no hace falta la de prueba`
    case "activa-vencida":
      return `${tipo}: la resolución activa (prefijo «${paso.prefijo}») no está vigente hoy; actualízala en Configuración (no se activa otra)`
    case "activar":
      return `${etiqueta}: activar la de prueba que ya existe`
    case "crear":
      return `${etiqueta}: crear y activar, vigente del ${paso.vigenteDesde} al ${paso.vigenteHasta}`
  }
}

function fallaEscritura(accion: string, error: { message: string }): never {
  throw new ErrorBootstrap(`${accion}: ${error.message}`)
}

/**
 * Retenciones, ReteICA y resoluciones de prueba (solo lo que falte). Cada id
 * creado se guarda en el respaldo en cuanto existe.
 */
async function aplicarFinanzas(
  servicio: ClienteSupabase,
  respaldo: RespaldoConfiguracion,
  { simular, ruta }: { simular: boolean; ruta: string }
): Promise<RespaldoConfiguracion> {
  const hoy = serializarFecha(new Date())
  const municipios = RETEICA_REFERENCIA.map((regla) => regla.municipio)
  const [retenciones, reteica, catalogo, resoluciones] = await Promise.all([
    servicio
      .from("retenciones_config")
      .select("id, tipo, aplica_declarante, vigente_desde, vigente_hasta"),
    servicio
      .from("reteica_municipal")
      .select("id, municipio_codigo, vigente_desde, vigente_hasta")
      .in("municipio_codigo", municipios),
    servicio.from("municipios").select("codigo").in("codigo", municipios),
    servicio
      .from("resoluciones_dian")
      .select(
        "id, tipo, prefijo, numero_resolucion, activa, vigente_desde, vigente_hasta"
      ),
  ])
  for (const { error } of [retenciones, reteica, catalogo, resoluciones]) {
    if (error)
      fallaEscritura("No se pudo leer la configuración tributaria", error)
  }
  let resultado = respaldo
  const registrar = (tabla: keyof CreadoFinanzas, id: string) => {
    resultado = {
      ...resultado,
      finanzas: registrarCreadoFinanzas(resultado.finanzas, tabla, id),
    }
    guardarRespaldo(ruta, resultado)
  }
  const marca = simular ? "→" : "✓"

  for (const paso of planRetenciones(retenciones.data ?? [], hoy)) {
    const { regla } = paso
    const etiqueta = `${regla.tipo} ${regla.concepto} ${regla.aplicaDeclarante ? "declarante" : "no declarante"} ${porcentaje(regla.tarifa)} desde ${regla.baseMinimaUvt} UVT`
    if (paso.tipo === "existe") {
      informar(`  · ${etiqueta}: ya hay una vigente (no se toca)`)
      continue
    }
    informar(`  ${marca} ${etiqueta}: crear desde ${paso.vigenteDesde}`)
    if (simular) continue
    const { data, error } = await servicio
      .from("retenciones_config")
      .insert({
        tipo: regla.tipo,
        concepto: regla.concepto,
        aplica_declarante: regla.aplicaDeclarante,
        tarifa: regla.tarifa,
        base_minima_uvt: regla.baseMinimaUvt,
        vigente_desde: paso.vigenteDesde,
        pendiente_validacion: true,
      })
      .select("id")
      .single()
    if (error) fallaEscritura(`No se pudo crear ${etiqueta}`, error)
    registrar("retenciones", data.id)
  }

  const disponibles = new Set((catalogo.data ?? []).map((fila) => fila.codigo))
  for (const paso of planReteica(reteica.data ?? [], disponibles, hoy)) {
    const { regla } = paso
    const etiqueta = `ReteICA ${regla.nombre} (${regla.municipio}) ${regla.tarifaPorMil.toLocaleString("es-CO")} ‰`
    if (paso.tipo === "sin-municipio") {
      informar(`  · ${etiqueta}: el municipio no está en esta base (se omite)`)
      continue
    }
    if (paso.tipo === "existe") {
      informar(`  · ${etiqueta}: ya hay una vigente (no se toca)`)
      continue
    }
    informar(`  ${marca} ${etiqueta}: crear desde ${paso.vigenteDesde}`)
    if (simular) continue
    const { data, error } = await servicio
      .from("reteica_municipal")
      .insert({
        municipio_codigo: regla.municipio,
        tarifa_por_mil: regla.tarifaPorMil,
        base_minima_uvt: 0,
        vigente_desde: paso.vigenteDesde,
        pendiente_validacion: true,
      })
      .select("id")
      .single()
    if (error) fallaEscritura(`No se pudo crear ${etiqueta}`, error)
    registrar("reteica", data.id)
  }

  for (const paso of planResoluciones(resoluciones.data ?? [], hoy)) {
    const cambia = paso.tipo === "crear" || paso.tipo === "activar"
    informar(`  ${cambia ? marca : "·"} ${describirResolucion(paso)}`)
    if (simular || !cambia) continue
    if (paso.tipo === "activar") {
      const { error } = await servicio
        .from("resoluciones_dian")
        .update({ activa: true })
        .eq("id", paso.id)
      if (error)
        fallaEscritura("No se pudo activar la resolución de prueba", error)
      continue
    }
    const { resolucion } = paso
    const { data, error } = await servicio
      .from("resoluciones_dian")
      .insert({
        tipo: resolucion.tipo,
        prefijo: resolucion.prefijo,
        numero_resolucion: resolucion.numeroResolucion,
        fecha_resolucion: paso.fechaResolucion,
        rango_desde: resolucion.rangoDesde,
        rango_hasta: resolucion.rangoHasta,
        consecutivo_actual: resolucion.rangoDesde - 1,
        vigente_desde: paso.vigenteDesde,
        vigente_hasta: paso.vigenteHasta,
        activa: true,
      })
      .select("id")
      .single()
    if (error) fallaEscritura("No se pudo crear la resolución de prueba", error)
    registrar("resoluciones", data.id)
  }
  return resultado
}

/** Ids de `ids` que aún existen en la tabla. */
async function existentes(
  servicio: ClienteSupabase,
  tabla: "retenciones_config" | "reteica_municipal" | "resoluciones_dian",
  ids: readonly string[]
): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await servicio
    .from(tabla)
    .select("id")
    .in("id", [...ids])
  if (error) fallaEscritura(`No se pudo leer ${tabla}`, error)
  return data.map((fila) => fila.id)
}

async function hayFilas(
  consulta: PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>
): Promise<boolean> {
  const { count, error } = await consulta
  if (error) fallaEscritura("No se pudo comprobar el uso", error)
  return (count ?? 0) > 0
}

/** ¿Alguna liquidación aplicó esa regla (`config_id` en las retenciones por asignación)? */
function reglaUsada(servicio: ClienteSupabase, id: string) {
  return hayFilas(
    servicio
      .from("asignacion_montos")
      .select("asignacion_id", { count: "exact", head: true })
      .contains("retenciones_aplicadas", [{ config_id: id }])
  )
}

async function resolucionUsada(
  servicio: ClienteSupabase,
  id: string
): Promise<boolean> {
  const [documentos, facturas] = await Promise.all([
    hayFilas(
      servicio
        .from("documentos_soporte")
        .select("id", { count: "exact", head: true })
        .eq("resolucion_id", id)
    ),
    hayFilas(
      servicio
        .from("facturas")
        .select("id", { count: "exact", head: true })
        .eq("resolucion_id", id)
    ),
  ])
  return documentos || facturas
}

const TABLA_DE: Record<
  keyof CreadoFinanzas,
  "retenciones_config" | "reteica_municipal" | "resoluciones_dian"
> = {
  retenciones: "retenciones_config",
  reteica: "reteica_municipal",
  resoluciones: "resoluciones_dian",
}

async function revertirFinanzas(
  servicio: ClienteSupabase,
  respaldo: RespaldoConfiguracion,
  ruta: string
): Promise<RespaldoConfiguracion> {
  const creado = respaldo.finanzas
  if (!creado) return respaldo
  const vivos = new Set<string>()
  const usadas = new Set<string>()
  for (const tabla of Object.keys(TABLA_DE) as (keyof CreadoFinanzas)[]) {
    for (const id of await existentes(
      servicio,
      TABLA_DE[tabla],
      creado[tabla]
    )) {
      vivos.add(id)
      const usada =
        tabla === "resoluciones"
          ? await resolucionUsada(servicio, id)
          : await reglaUsada(servicio, id)
      if (usada) usadas.add(id)
    }
  }
  let resultado = respaldo
  for (const paso of planRevertirFinanzas(creado, {
    existentes: vivos,
    usadas,
  })) {
    const etiqueta = `${TABLA_DE[paso.tabla]} ${paso.id}`
    if (paso.tipo === "usada") {
      informar(
        `  · ${etiqueta}: ya se usó en liquidaciones o documentos (se conserva)`
      )
      continue
    }
    if (paso.tipo === "quitar") {
      const { error } = await servicio
        .from(TABLA_DE[paso.tabla])
        .delete()
        .eq("id", paso.id)
      if (error) fallaEscritura(`No se pudo quitar ${etiqueta}`, error)
      informar(`  ✓ ${etiqueta}: quitada`)
    } else {
      informar(`  · ${etiqueta}: ya no existe`)
    }
    resultado = {
      ...resultado,
      finanzas: olvidarCreadoFinanzas(resultado.finanzas, paso.tabla, paso.id),
    }
    guardarRespaldo(ruta, resultado)
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
    informar("Finanzas de prueba:")
    respaldo = await revertirFinanzas(servicio, respaldo, ruta)
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
  informar("Finanzas de prueba (pendientes de validar por el contador):")
  respaldo = await aplicarFinanzas(servicio, respaldo, { simular, ruta })
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
