/**
 * `pnpm exec tsx --env-file=.env.local scripts/bootstrap/comprobar-pauta-e2e.ts`
 *
 * Recorre las fábricas de la pauta del medio (`fabricas-pauta.ts`) contra la
 * base (nunca producción) con el «Medio E2E» y el «Anunciante E2E», como lo
 * harán los specs `pauta-medio-*`, y comprueba cada efecto en la BD:
 *
 * 1. Una oferta con la ventana abierta hace 2 días y dirigida al medio aparece
 *    en su marketplace; `prepararAsignacion` la lleva hasta VERIFICADA.
 * 2. Aceptar dos veces da AMO_YA_ACEPTADA; la versión nueva del creativo avisa
 *    al medio y se descarga; una evidencia rechazada se corrige; un corte que
 *    no se cumplió no se carga; uno personalizado sí, y se rechaza.
 * 3. Con la ventana futura, aceptar el único cupo llena la oferta; desistir la
 *    libera; reusar la clave da AMO_IDEMPOTENCIA_INVALIDA; «No me interesa».
 * 4. Al restablecer, la campaña con descargas queda cancelada y archivada (la
 *    BD no deja borrar las descargas) con sus asignaciones CANCELADAS; sus
 *    ofertas salen del marketplace; una oferta demo aceptada recupera su cupo;
 *    una campaña de un spec del anunciante se conserva y `borrarPauta` la
 *    quita.
 *
 * Al final restablece al medio y borra lo que creó (también si algo falla):
 * no le queda ninguna asignación abierta. Sale con código 1 si algo no
 * coincide.
 */
import { randomUUID } from "node:crypto"

import { conClienteDeUsuario } from "./acciones-actor"
import {
  crearCampana,
  crearOferta,
  publicarNuevaVersionCreativo,
} from "./fabricas-negocio"
import {
  aceptarOferta,
  asignacionesDeMedio,
  avisosDeMedio,
  borrarPauta,
  cargarMetrica,
  desistirAsignacion,
  entregarContenido,
  leerAsignacion,
  leerCuposOferta,
  type MedioPauta,
  prepararAsignacion,
  publicarEvidencia,
  rechazarEvidencia,
  rechazarMetrica,
  rechazarOferta,
  restablecerPautaMedio,
} from "./fabricas-pauta"
import { MEDIO_E2E_ID } from "./medios-e2e"
import { sufijoUnico } from "./negocio-e2e"
import { ANUNCIANTE_E2E_ID } from "./organizacion"
import {
  consumeCupo,
  describirLimpieza,
  PREFIJO_PAUTA,
  PREFIJO_PAUTA_ANUNCIANTE,
} from "./pauta-e2e"
import { clienteComoSuperadmin } from "./provision-e2e"
import {
  buscarUsuarioPorEmail,
  cargarEntorno,
  crearClienteServicio,
  describirProyecto,
} from "./supabase"

const log = (linea: string) => process.stderr.write(`${linea}\n`)
const fallas: string[] = []

function comprobar(condicion: boolean, descripcion: string): void {
  log(`${condicion ? "  ✓" : "  ✗"} ${descripcion}`)
  if (!condicion) fallas.push(descripcion)
}

async function fallaCon(
  promesa: Promise<unknown>,
  codigo: string
): Promise<boolean> {
  try {
    await promesa
    return false
  } catch (error) {
    return error instanceof Error && error.message.includes(codigo)
  }
}

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor)
    throw new Error(`Falta ${nombre}: ejecuta \`pnpm bootstrap:e2e\`.`)
  return valor
}

function resumen(resultado: {
  plan: Parameters<typeof describirLimpieza>[0]["plan"]
  campanas: number
  archivadas: number
}): string {
  return describirLimpieza({
    plan: resultado.plan,
    campanasBorradas: resultado.campanas,
    campanasArchivadas: resultado.archivadas,
  })
}

/** Asignaciones del Medio E2E que aún ocupan cupo. */
async function asignacionesAbiertas(
  servicio: ReturnType<typeof crearClienteServicio>
): Promise<string[]> {
  const { data, error } = await servicio
    .from("asignaciones")
    .select("id, estado, estado_previo_disputa")
    .eq("medio_id", MEDIO_E2E_ID)
  if (error) throw new Error(error.message)
  return data
    .filter((fila) => consumeCupo(fila.estado, fila.estado_previo_disputa))
    .map((fila) => fila.id)
}

async function main(): Promise<void> {
  const entorno = cargarEntorno()
  const superadmin = await clienteComoSuperadmin(entorno)
  const servicio = crearClienteServicio(entorno)
  log(`Pauta E2E en ${describirProyecto(entorno)}`)

  const medio: MedioPauta = {
    id: MEDIO_E2E_ID,
    credenciales: {
      email: variable("E2E_MEDIO_EMAIL"),
      password: variable("E2E_MEDIO_PASSWORD"),
    },
  }
  const emailEmpresa = variable("E2E_ANUNCIANTE_EMAIL")
  const perfilEmpresa = await buscarUsuarioPorEmail(servicio, emailEmpresa)
  if (!perfilEmpresa) throw new Error(`No existe ${emailEmpresa}.`)
  const empresa = {
    id: perfilEmpresa.id,
    email: emailEmpresa,
    password: variable("E2E_ANUNCIANTE_PASSWORD"),
  }

  const inicial = await restablecerPautaMedio(entorno, superadmin, medio)
  log(`· Restablecer: ${resumen(inicial)}`)

  let demo: { ofertaId: string; ocupados: number } | null = null
  try {
    // 1. Ventana abierta hace 2 días, dirigida al medio, hasta VERIFICADA.
    log("· Oferta con la ventana abierta y la asignación hasta VERIFICADA")
    const campana = await crearCampana(entorno, empresa, {
      anuncianteId: ANUNCIANTE_E2E_ID,
      nombre: `${PREFIJO_PAUTA} ${sufijoUnico()}`,
      diasAtras: 2,
    })
    const ofertaA = await crearOferta(entorno, empresa, {
      campanaId: campana.id,
      estado: "PUBLICADA",
      ventanaDesdeHoy: { diasAtras: 2 },
      segmentacion: { paraMedio: MEDIO_E2E_ID },
      cortes: ["H24"],
    })
    const marketplace = await conClienteDeUsuario(
      entorno,
      medio.credenciales,
      async (cliente) => {
        const { data, error } = await cliente.rpc("marketplace_medio", {
          p_limite: 100,
        })
        if (error) throw new Error(error.message)
        return data
      }
    )
    comprobar(
      marketplace.some((fila) => fila.id === ofertaA.id),
      "la oferta dirigida al Medio E2E aparece en su marketplace"
    )
    const verificada = await prepararAsignacion(entorno, medio, {
      ofertaId: ofertaA.id,
      hasta: "VERIFICADA",
    })
    const estadoA = await leerAsignacion(servicio, verificada.asignacionId)
    comprobar(
      estadoA.estado === "VERIFICADA",
      `asignación VERIFICADA (${estadoA.estado})`
    )
    comprobar(
      estadoA.publicaciones.every(
        (p) => p.estado === "APROBADA" && p.etiquetaVerificada
      ) &&
        estadoA.metricas.length === 1 &&
        estadoA.metricas[0]?.estado === "APROBADA",
      "evidencia y corte H24 aprobados"
    )

    // 2. Ventana abierta hoy, 2 publicaciones y los tres cortes.
    log("· Ejecución con versión nueva, evidencia rechazada y cortes")
    const ofertaB = await crearOferta(entorno, empresa, {
      campanaId: campana.id,
      estado: "PUBLICADA",
      ventanaDesdeHoy: true,
      segmentacion: { paraMedio: MEDIO_E2E_ID },
      publicacionesPorMedio: 2,
    })
    const aceptadaB = await aceptarOferta(entorno, medio, {
      ofertaId: ofertaB.id,
    })
    comprobar(
      aceptadaB.montoMedio > 0,
      `precio congelado (${aceptadaB.montoMedio} para el medio)`
    )
    comprobar(
      await fallaCon(
        aceptarOferta(entorno, medio, { ofertaId: ofertaB.id }),
        "AMO_YA_ACEPTADA"
      ),
      "aceptar otra vez da AMO_YA_ACEPTADA"
    )
    const v1 = await entregarContenido(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
    })
    comprobar(
      v1.version === 1 && v1.archivos.length > 0,
      "descarga la versión 1 con sus archivos"
    )
    const v2 = await publicarNuevaVersionCreativo(entorno, empresa, {
      ofertaId: ofertaB.id,
    })
    const avisos = await avisosDeMedio(servicio, MEDIO_E2E_ID, {
      tipo: "creativo.actualizado",
      entidadId: ofertaB.id,
    })
    comprobar(
      v2.version === 2 && avisos.length > 0,
      "la versión 2 avisa al medio (creativo.actualizado)"
    )
    const descargada = await entregarContenido(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
    })
    comprobar(descargada.version === 2, "descarga la versión 2")
    await publicarEvidencia(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
      numero: 1,
    })
    comprobar(
      (await leerAsignacion(servicio, aceptadaB.asignacionId)).estado ===
        "CONTENIDO_ENTREGADO",
      "con 1 de 2 evidencias sigue en CONTENIDO_ENTREGADO"
    )
    await publicarEvidencia(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
      numero: 2,
    })
    comprobar(
      (await leerAsignacion(servicio, aceptadaB.asignacionId)).estado ===
        "PUBLICADA",
      "con las 2 evidencias pasa a PUBLICADA"
    )
    await rechazarEvidencia(entorno, {
      asignacionId: aceptadaB.asignacionId,
      numero: 1,
      observaciones: "La captura no muestra la etiqueta de publicidad.",
    })
    const rechazada = await leerAsignacion(servicio, aceptadaB.asignacionId)
    comprobar(
      rechazada.estado === "CONTENIDO_ENTREGADO" &&
        rechazada.publicaciones[0]?.estado === "RECHAZADA" &&
        rechazada.publicaciones[0]?.observaciones !== null,
      "la evidencia rechazada lleva observaciones y la asignación vuelve a CONTENIDO_ENTREGADO"
    )
    await publicarEvidencia(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
      numero: 1,
    })
    const corregida = await leerAsignacion(servicio, aceptadaB.asignacionId)
    comprobar(
      corregida.estado === "PUBLICADA" &&
        corregida.publicaciones[0]?.estado === "PENDIENTE",
      "la corrección vuelve a PENDIENTE y la asignación a PUBLICADA"
    )
    let corteTemprano = false
    try {
      await cargarMetrica(entorno, medio, {
        asignacionId: aceptadaB.asignacionId,
        corte: "H24",
      })
    } catch (error) {
      corteTemprano = error instanceof RangeError
    }
    comprobar(corteTemprano, "un corte H24 que no se ha cumplido no se carga")
    const personalizado = await cargarMetrica(entorno, medio, {
      asignacionId: aceptadaB.asignacionId,
      corte: "PERSONALIZADO",
    })
    await rechazarMetrica(entorno, {
      metricaId: personalizado.metricaId,
      observaciones: "El alcance no coincide con la captura.",
    })
    const conMetrica = await leerAsignacion(servicio, aceptadaB.asignacionId)
    comprobar(
      conMetrica.metricas.some(
        (m) => m.corte === "PERSONALIZADO" && m.estado === "RECHAZADA"
      ),
      "el corte personalizado se carga y se rechaza"
    )

    // 3. Ventana futura con un cupo: llenar, desistir, clave reusada, «No me interesa».
    log("· Cupo único, desistir e idempotencia")
    const ofertaC = await crearOferta(entorno, empresa, {
      campanaId: campana.id,
      estado: "PUBLICADA",
      cupos: 1,
      segmentacion: { paraMedio: MEDIO_E2E_ID },
    })
    const clave = randomUUID()
    const aceptadaC = await aceptarOferta(entorno, medio, {
      ofertaId: ofertaC.id,
      claveIdempotencia: clave,
    })
    comprobar(
      (await leerCuposOferta(servicio, ofertaC.id)).estado ===
        "CUPOS_COMPLETOS",
      "el único cupo deja la oferta en CUPOS_COMPLETOS"
    )
    await desistirAsignacion(entorno, medio, {
      asignacionId: aceptadaC.asignacionId,
      motivo: "Ya no tengo fechas libres.",
    })
    const liberada = await leerCuposOferta(servicio, ofertaC.id)
    comprobar(
      liberada.estado === "PUBLICADA" && liberada.cuposOcupados === 0,
      "desistir libera el cupo y la oferta vuelve a PUBLICADA"
    )
    comprobar(
      await fallaCon(
        aceptarOferta(entorno, medio, {
          ofertaId: ofertaC.id,
          claveIdempotencia: clave,
        }),
        "AMO_IDEMPOTENCIA_INVALIDA"
      ),
      "reusar la clave tras desistir da AMO_IDEMPOTENCIA_INVALIDA"
    )
    const rechazo = await rechazarOferta(entorno, medio, {
      ofertaId: ofertaC.id,
      motivo: "No es de mi audiencia.",
    })
    const propias = await asignacionesDeMedio(servicio, MEDIO_E2E_ID)
    comprobar(
      propias.some(
        (a) =>
          a.id === rechazo && a.estado === "RECHAZADA" && a.aceptadaAt === null
      ),
      "«No me interesa» queda como rechazo sin aceptación"
    )

    // 4. Oferta demo y campaña de un spec del anunciante.
    log("· Restablecer: oferta demo y campaña de otro spec")
    const demoVisible = marketplace.find(
      (fila) => fila.id !== ofertaA.id && !fila.titulo.startsWith("Oferta E2E")
    )
    if (demoVisible) {
      const antes = await leerCuposOferta(servicio, demoVisible.id)
      try {
        await aceptarOferta(entorno, medio, { ofertaId: demoVisible.id })
        demo = { ofertaId: demoVisible.id, ocupados: antes.cuposOcupados }
      } catch (error) {
        log(
          `  · la oferta demo no se pudo aceptar (${error instanceof Error ? error.message : String(error)}): se omite`
        )
      }
    } else {
      log("  · no hay ofertas demo visibles para el medio: se omite")
    }
    const ajena = await crearCampana(entorno, empresa, {
      anuncianteId: ANUNCIANTE_E2E_ID,
      nombre: `${PREFIJO_PAUTA_ANUNCIANTE} ${sufijoUnico()}`,
    })
    const ofertaAjena = await crearOferta(entorno, empresa, {
      campanaId: ajena.id,
      estado: "PUBLICADA",
    })
    const aceptadaAjena = await aceptarOferta(entorno, medio, {
      ofertaId: ofertaAjena.id,
    })

    const restablecida = await restablecerPautaMedio(entorno, superadmin, medio)
    log(`  · ${resumen(restablecida)}`)
    comprobar(
      restablecida.archivadas === 1,
      "la campaña con descargas queda cancelada y archivada (la BD no deja borrarla)"
    )
    const abiertas = await asignacionesAbiertas(servicio)
    comprobar(
      abiertas.length === 1 && abiertas[0] === aceptadaAjena.asignacionId,
      "solo queda abierta la asignación de la campaña del otro spec"
    )
    const descargadas = [verificada.asignacionId, aceptadaB.asignacionId]
    const retenidas = await Promise.all(
      descargadas.map((id) => leerAsignacion(servicio, id))
    )
    comprobar(
      retenidas.every((a) => a.estado === "CANCELADA"),
      "las asignaciones con descargas quedan CANCELADAS"
    )
    if (demo) {
      const despues = await leerCuposOferta(servicio, demo.ofertaId)
      comprobar(
        despues.cuposOcupados === demo.ocupados,
        "la oferta demo recupera sus cupos (desistir antes de borrar)"
      )
      demo = null
    }
    const { count } = await servicio
      .from("campanas")
      .select("id", { count: "exact", head: true })
      .like("nombre", `${PREFIJO_PAUTA}%`)
      .is("deleted_at", null)
    comprobar(count === 0, "no quedan campañas de la pauta sin archivar")
    const marketplaceFinal = await conClienteDeUsuario(
      entorno,
      medio.credenciales,
      async (cliente) => {
        const { data, error } = await cliente.rpc("marketplace_medio", {
          p_limite: 100,
        })
        if (error) throw new Error(error.message)
        return data
      }
    )
    comprobar(
      !marketplaceFinal.some((fila) =>
        [ofertaA.id, ofertaB.id, ofertaC.id].includes(fila.id)
      ),
      "las ofertas de la pauta ya no aparecen en el marketplace"
    )
    const borrada = await borrarPauta(entorno, superadmin, {
      anuncianteId: ANUNCIANTE_E2E_ID,
      prefijo: PREFIJO_PAUTA_ANUNCIANTE,
    })
    comprobar(
      borrada.campanas === 1 && borrada.asignaciones === 1,
      "borrarPauta quita la campaña del otro spec con su asignación"
    )
  } finally {
    log("· Limpieza")
    try {
      await restablecerPautaMedio(entorno, superadmin, medio)
      await borrarPauta(entorno, superadmin, {
        anuncianteId: ANUNCIANTE_E2E_ID,
        prefijo: PREFIJO_PAUTA_ANUNCIANTE,
      })
      const restantes = await asignacionesAbiertas(servicio)
      comprobar(
        restantes.length === 0,
        "el Medio E2E queda sin asignaciones abiertas"
      )
    } catch (error) {
      // No tapa el error de la comprobación (si lo hubo).
      log(
        `  ✗ limpieza: ${error instanceof Error ? error.message : String(error)}`
      )
      fallas.push("limpieza")
    }
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
