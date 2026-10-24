/**
 * `pnpm pruebas:finanzas-e2e` (`tsx --env-file=.env.local scripts/bootstrap/comprobar-finanzas-e2e.ts`)
 *
 * Recorre las fábricas de la fase 5 (`fabricas-finanzas.ts`) contra la base
 * LOCAL (nunca producción; la limpieza borra por la conexión directa) con los
 * dos medios de Finanzas, el «Anunciante E2E», el ADMIN E2E y Finanzas, como lo
 * harán los specs `finanzas-*`, y comprueba cada efecto:
 *
 * 1. La limpieza deja la base sin pruebas de Finanzas y hay resoluciones
 *    vigentes de documento soporte y de factura.
 * 2. Campaña «Finanzas E2E» con una oferta que toman los dos medios (un cupo
 *    cada uno); una segunda asignación del mismo medio abre otra oferta.
 * 3. Liquidación del medio que no factura hasta PAGADA, con archivo de pagos y
 *    CUDS: la generó el ADMIN E2E y la aprobó Finanzas (D17), periodo hasta
 *    hoy, documento soporte emitido con sus archivos, pago con soporte; el
 *    medio la ve pagada con su documento (MED-015 c1). Otra el mismo día se
 *    rechaza con un mensaje claro (sin traslapes).
 * 4. Liquidación del medio que factura hasta EMITIDA: aprobada con su factura
 *    cargada por el medio y lista para el archivo de pagos.
 * 5. Factura de la campaña expedida (número, CUFE, total del borrador) y un
 *    borrador de otra campaña que el anunciante no ve (ANU-013).
 * 6. La limpieza borra todo (filas, avisos y archivos), devuelve la numeración
 *    de las resoluciones al último número usado y después se vuelve a liquidar
 *    sin traslape.
 *
 * Al final restablece todo (también si algo falla). Sale con código 1 si algo
 * no coincide.
 */
import { conClienteDeUsuario } from "./acciones-actor"
import {
  asegurarResolucionesPrueba,
  cerrarSesionesInternas,
  conSesionInterna,
  crearCampanaFinanzas,
  type PartesFinanzas,
  partesFinanzasDelEntorno,
  prepararAsignacionVerificadaFinanzas,
  prepararFacturaFinanzas,
  prepararLiquidacionFinanzas,
  restablecerFinanzas,
} from "./fabricas-finanzas"
import {
  describirRestablecimientoFinanzas,
  FORMATO_CODIGO_DIAN,
  MEDIOS_FINANZAS,
  PREFIJO_FINANZAS,
} from "./finanzas-e2e"
import {
  cargarEntorno,
  type ClienteSupabase,
  crearClienteServicio,
  describirProyecto,
  type EntornoBootstrap,
} from "./supabase"
import { esBaseLocal } from "./validacion-e2e"

const log = (linea: string) => process.stderr.write(`${linea}\n`)
const fallas: string[] = []

function comprobar(condicion: boolean, descripcion: string): void {
  log(`${condicion ? "  ✓" : "  ✗"} ${descripcion}`)
  if (!condicion) fallas.push(descripcion)
}

async function fallaCon(
  promesa: Promise<unknown>,
  texto: string
): Promise<boolean> {
  try {
    await promesa
    return false
  } catch (error) {
    return error instanceof Error && error.message.includes(texto)
  }
}

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date()
  )

async function idDe(servicio: ClienteSupabase, email: string): Promise<string> {
  const { data, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

async function contar(
  consulta: PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>
): Promise<number> {
  const { count, error } = await consulta
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Consecutivo de cada resolución activa (la limpieza lo devuelve al último usado). */
async function consecutivos(servicio: ClienteSupabase): Promise<string> {
  const { data, error } = await servicio
    .from("resoluciones_dian")
    .select("tipo, prefijo, consecutivo_actual")
    .eq("activa", true)
    .order("tipo")
  if (error) throw new Error(error.message)
  return data
    .map((fila) => `${fila.tipo} ${fila.prefijo}${fila.consecutivo_actual}`)
    .join(", ")
}

async function quedaAlgo(entorno: EntornoBootstrap): Promise<string[]> {
  const servicio = crearClienteServicio(entorno)
  const medios = Object.values(MEDIOS_FINANZAS).map((medio) => medio.id)
  const restos = {
    campañas: await contar(
      servicio
        .from("campanas")
        .select("id", { count: "exact", head: true })
        .like("nombre", `${PREFIJO_FINANZAS}%`)
    ),
    asignaciones: await contar(
      servicio
        .from("asignaciones")
        .select("id", { count: "exact", head: true })
        .in("medio_id", medios)
    ),
    liquidaciones: await contar(
      servicio
        .from("liquidaciones")
        .select("id", { count: "exact", head: true })
        .in("medio_id", medios)
    ),
  }
  return Object.entries(restos)
    .filter(([, n]) => n > 0)
    .map(([tabla, n]) => `${n} ${tabla}`)
}

async function comprobarMedioVePagada(
  entorno: EntornoBootstrap,
  partes: PartesFinanzas,
  liquidacionId: string
): Promise<void> {
  await conClienteDeUsuario(
    entorno,
    partes.medios.MEDIO_FINANZAS.credenciales,
    async (cliente) => {
      const { data, error } = await cliente.rpc("mis_liquidaciones_medio", {
        p_id: liquidacionId,
      })
      if (error) throw new Error(error.message)
      const fila = data[0]
      comprobar(
        fila?.estado === "PAGADA" &&
          fila.fecha_pago === hoy() &&
          fila.soporte_pago_path !== null &&
          fila.documento_path !== null &&
          fila.cuds !== null &&
          fila.enviada_banco_at !== null,
        "el medio ve su liquidación pagada hoy con el soporte, el documento soporte y el CUDS (MED-015 c1)"
      )
      const { data: resumen, error: errorResumen } = await cliente.rpc(
        "resumen_ganancias_medio"
      )
      if (errorResumen) throw new Error(errorResumen.message)
      const valores = Array.isArray(resumen) ? resumen[0] : resumen
      comprobar(
        Number(valores?.pagado_historico ?? 0) > 0 &&
          valores?.requiere_documento_soporte === true,
        "su resumen de ganancias cuenta lo pagado y dice que lleva documento soporte"
      )
    }
  )
}

async function main(): Promise<void> {
  const entorno = cargarEntorno()
  if (!esBaseLocal(entorno.url)) {
    throw new Error(
      "Este comprobador corre solo contra la base local (la limpieza borra por la conexión directa)."
    )
  }
  log(`Finanzas E2E en ${describirProyecto(entorno)}`)
  const servicio = crearClienteServicio(entorno)
  const partes = await partesFinanzasDelEntorno(entorno)
  const idAdmin = await idDe(servicio, partes.administracion.email)
  const idFinanzas = await idDe(servicio, partes.finanzas.email)
  let numeracionInicial: string | null = null

  try {
    log("· Limpieza inicial y resoluciones")
    log(
      `  · ${describirRestablecimientoFinanzas(await restablecerFinanzas(entorno))}`
    )
    comprobar(
      (await quedaAlgo(entorno)).length === 0,
      "no quedan campañas, asignaciones ni liquidaciones de Finanzas"
    )
    numeracionInicial = await consecutivos(servicio)
    const resoluciones = await asegurarResolucionesPrueba(entorno)
    comprobar(
      resoluciones.length === 2,
      `hay resolución vigente de documento soporte y de factura (${resoluciones.map((r) => `${r.tipo} ${r.prefijo}: ${r.accion}`).join("; ")})`
    )

    log("· Campaña y asignaciones verificadas")
    const campana = await crearCampanaFinanzas(entorno, partes)
    comprobar(
      campana.nombre.startsWith(PREFIJO_FINANZAS),
      `campaña «${campana.nombre}» con la oferta «${campana.ofertaTitulo}»`
    )
    const finanzas1 = await prepararAsignacionVerificadaFinanzas(
      entorno,
      partes,
      { medio: "MEDIO_FINANZAS", campanaId: campana.id }
    )
    const factura1 = await prepararAsignacionVerificadaFinanzas(
      entorno,
      partes,
      { medio: "MEDIO_FACTURA", campanaId: campana.id }
    )
    comprobar(
      finanzas1.ofertaId === campana.ofertaId &&
        factura1.ofertaId === campana.ofertaId,
      "los dos medios toman la misma oferta (un cupo cada uno)"
    )
    const finanzas2 = await prepararAsignacionVerificadaFinanzas(
      entorno,
      partes,
      { medio: "MEDIO_FINANZAS", campanaId: campana.id }
    )
    comprobar(
      finanzas2.ofertaId !== campana.ofertaId,
      "una segunda asignación del mismo medio abre otra oferta en la campaña"
    )
    const { data: estados, error: errorEstados } = await servicio
      .from("asignaciones")
      .select("estado")
      .in("id", [
        finanzas1.asignacionId,
        factura1.asignacionId,
        finanzas2.asignacionId,
      ])
    if (errorEstados) throw new Error(errorEstados.message)
    comprobar(
      estados.length === 3 &&
        estados.every((fila) => fila.estado === "VERIFICADA"),
      "las tres asignaciones quedan VERIFICADAS"
    )

    log("· Liquidación del medio que no factura, hasta PAGADA")
    const pagada = await prepararLiquidacionFinanzas(entorno, partes, {
      medio: "MEDIO_FINANZAS",
      hasta: "PAGADA",
      dispersada: true,
      conCuds: true,
    })
    const { data: autoria, error: errorAutoria } = await servicio
      .from("liquidaciones")
      .select("creada_por, aprobada_por")
      .eq("id", pagada.liquidacionId)
      .single()
    if (errorAutoria) throw new Error(errorAutoria.message)
    comprobar(
      autoria.creada_por === idAdmin && autoria.aprobada_por === idFinanzas,
      "la generó el ADMIN E2E y la aprobó Finanzas (D17)"
    )
    comprobar(
      pagada.estado === "PAGADA" &&
        pagada.periodo.fin === hoy() &&
        pagada.periodo.inicio <= hoy() &&
        pagada.asignacionIds.length === 2 &&
        pagada.asignacionIds.includes(finanzas1.asignacionId) &&
        pagada.asignacionIds.includes(finanzas2.asignacionId),
      `PAGADA con sus dos asignaciones, periodo ${pagada.periodo.inicio} → ${pagada.periodo.fin}`
    )
    comprobar(
      pagada.requiereDocumentoSoporte &&
        pagada.documentoSoporte?.estado === "EMITIDO" &&
        pagada.documentoSoporte.numero !== null &&
        pagada.documentoSoporte.archivoPath !== null &&
        FORMATO_CODIGO_DIAN.test(pagada.documentoSoporte.cuds ?? ""),
      `documento soporte ${pagada.documentoSoporte?.numero ?? "—"} emitido con su PDF y su CUDS`
    )
    comprobar(
      pagada.pago !== null &&
        pagada.pago.fecha === hoy() &&
        pagada.dispersionId !== null,
      "pago registrado hoy con su soporte, después de un archivo de pagos"
    )
    comprobar(
      pagada.montoNeto === pagada.montoMedio - pagada.montoRetenciones &&
        pagada.montoRetenciones >= 0,
      `neto ${pagada.montoNeto} = valor del medio ${pagada.montoMedio} − retenciones ${pagada.montoRetenciones}`
    )
    await comprobarMedioVePagada(entorno, partes, pagada.liquidacionId)
    comprobar(
      await fallaCon(
        prepararLiquidacionFinanzas(entorno, partes, {
          medio: "MEDIO_FINANZAS",
          hasta: "BORRADOR",
          campanaId: campana.id,
        }),
        "ya tiene una liquidación vigente que cubre hoy"
      ),
      "otra liquidación del mismo medio hoy se rechaza con un mensaje claro"
    )

    log("· Liquidación del medio que factura, hasta EMITIDA")
    const emitida = await prepararLiquidacionFinanzas(entorno, partes, {
      medio: "MEDIO_FACTURA",
      hasta: "EMITIDA",
    })
    comprobar(
      emitida.estado === "APROBADA" &&
        !emitida.requiereDocumentoSoporte &&
        emitida.documentoSoporte === null &&
        emitida.facturaMedio !== null &&
        emitida.asignacionIds.includes(factura1.asignacionId),
      `APROBADA con la factura ${emitida.facturaMedio?.numero ?? "—"} que cargó el medio`
    )
    const porPagar = await conSesionInterna(
      entorno,
      partes.finanzas,
      async ({ cliente }) => {
        const { data, error } = await cliente.rpc("liquidaciones_por_pagar", {
          p_limite: 500,
        })
        if (error) throw new Error(error.message)
        return data.find((fila) => fila.id === emitida.liquidacionId)
      }
    )
    comprobar(
      porPagar?.documento_listo === true &&
        porPagar.datos_pago_listos === true &&
        porPagar.dispersion_id === null,
      "Finanzas la ve por pagar: documento listo, datos de pago listos y sin archivo"
    )

    log("· Facturas al anunciante")
    const expedida = await prepararFacturaFinanzas(entorno, partes, {
      campanaId: campana.id,
      hasta: "EMITIDA",
    })
    comprobar(
      expedida.estado === "EMITIDA" &&
        expedida.numero !== null &&
        FORMATO_CODIGO_DIAN.test(expedida.cufe ?? "") &&
        expedida.archivoPath !== null &&
        expedida.fechaVencimiento !== null &&
        expedida.asignacionIds.length === 3 &&
        expedida.total ===
          expedida.subtotal + expedida.iva + expedida.valorTerceros &&
        expedida.saldo === expedida.total,
      `factura ${expedida.numero ?? "—"} expedida por ${expedida.total} con las tres asignaciones`
    )
    const otraCampana = await crearCampanaFinanzas(entorno, partes)
    const borrador = await prepararFacturaFinanzas(entorno, partes, {
      campanaId: otraCampana.id,
      hasta: "BORRADOR",
    })
    comprobar(
      borrador.estado === "BORRADOR" &&
        borrador.numero === null &&
        borrador.asignacionIds.length === 1,
      "borrador de otra campaña (verificó antes una asignación)"
    )
    const visibles = await conClienteDeUsuario(
      entorno,
      { email: partes.empresa.email, password: partes.empresa.password },
      async (cliente) => {
        const { data, error } = await cliente
          .from("facturas")
          .select("id")
          .in("id", [borrador.facturaId, expedida.facturaId])
        if (error) throw new Error(error.message)
        return data.map((fila) => fila.id)
      }
    )
    comprobar(
      visibles.length === 1 && visibles[0] === expedida.facturaId,
      "el anunciante ve la expedida y no el borrador (ANU-013)"
    )

    log("· Limpieza")
    const limpieza = await restablecerFinanzas(entorno)
    log(`  · ${describirRestablecimientoFinanzas(limpieza)}`)
    comprobar(
      limpieza.campanas === 2 &&
        limpieza.liquidaciones === 2 &&
        limpieza.facturas === 2 &&
        limpieza.documentosSoporte === 1 &&
        limpieza.dispersiones === 1 &&
        limpieza.archivos > 0,
      "borra las dos campañas, las liquidaciones, el documento, el archivo de pagos, las facturas y sus archivos"
    )
    const restos = await quedaAlgo(entorno)
    comprobar(
      restos.length === 0,
      `no queda nada de Finanzas${restos.length > 0 ? ` (${restos.join(", ")})` : ""}`
    )
    const { data: objetos, error: errorObjetos } = await servicio.storage
      .from("soportes")
      .list(`liquidacion/${pagada.liquidacionId}`)
    if (errorObjetos) throw new Error(errorObjetos.message)
    comprobar(
      objetos.length === 0,
      "los archivos de la liquidación ya no están en Storage"
    )
    const nueva = await prepararLiquidacionFinanzas(entorno, partes, {
      medio: "MEDIO_FINANZAS",
      hasta: "BORRADOR",
    })
    comprobar(
      nueva.estado === "BORRADOR" && nueva.periodo.fin === hoy(),
      "después de limpiar se vuelve a liquidar hoy sin traslape"
    )
  } finally {
    log("· Limpieza final")
    try {
      log(
        `  · ${describirRestablecimientoFinanzas(await restablecerFinanzas(entorno))}`
      )
      comprobar(
        (await quedaAlgo(entorno)).length === 0,
        "la base queda sin pruebas de Finanzas"
      )
      if (numeracionInicial !== null) {
        const numeracionFinal = await consecutivos(servicio)
        comprobar(
          numeracionFinal === numeracionInicial,
          `la numeración vuelve al último número usado, sin huecos (${numeracionFinal})`
        )
      }
    } catch (error) {
      log(
        `  ✗ limpieza: ${error instanceof Error ? error.message : String(error)}`
      )
      fallas.push("limpieza")
    }
    await cerrarSesionesInternas()
  }
  log(
    fallas.length === 0
      ? "\nTodo coincide."
      : `\n${fallas.length} comprobación(es) fallaron.`
  )
  if (fallas.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  log(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
