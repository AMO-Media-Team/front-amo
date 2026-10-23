/**
 * `pnpm exec tsx --env-file=.env.local scripts/bootstrap/comprobar-validacion-e2e.ts`
 *
 * Recorre las fábricas de la fase 4 (`fabricas-validacion.ts`) contra la base
 * LOCAL (nunca producción; `vencerAsignacion` solo funciona ahí) con el «Medio
 * E2E», el «Medio Suspensión E2E», el «Anunciante E2E» y la cuenta de
 * OPERACIONES, como lo harán los specs `validacion-*`, `disputas-*`,
 * `pauta-medio-disputa` y `anunciante-disputa`, y comprueba cada efecto:
 *
 * 1. Evidencia pendiente, métrica pendiente con y sin alerta por múltiplo,
 *    lista para verificar y bloqueada por permanencia aparecen en las colas de
 *    OPERACIONES (ingreso con su TOTP) con lo que dicen sus columnas.
 * 2. Validar: aprobar una métrica con alerta sin anotar la revisión da
 *    `alerta_sin_revision`; con la revisión, queda APROBADA.
 * 3. Disputas: la empresa abre sobre METRICAS_CARGADAS; el medio escribe con
 *    una captura, el equipo AMO deja una nota interna que el medio no ve; se
 *    toma en revisión y se resuelve VERIFICAR; RESTAURAR y DESCARTAR devuelven
 *    el estado previo; cancelar en disputa da `en_disputa`.
 * 4. Vencida: el cron la vence (base local), el medio ve RECLAMAR, la empresa
 *    no puede reclamarla, el medio sí; REABRIR le da un plazo nuevo y publica.
 * 5. Cancelación por fraude con suspensión del medio dedicado: el medio deja de
 *    ver ofertas; reactivar y suspender son idempotentes; suspender con una
 *    causa administrativa se rechaza.
 * 6. La limpieza cierra disputas y reclamos pendientes, archiva lo que no se
 *    puede borrar, reactiva al medio y no deja nada en curso; el
 *    restablecimiento de la pauta también cierra una disputa con mensajes.
 *
 * Al final restablece todo (también si algo falla). Sale con código 1 si algo
 * no coincide.
 */
import { conClienteDeUsuario } from "./acciones-actor"
import { crearCampana, crearOferta } from "./fabricas-negocio"
import {
  aprobarEvidenciasCon,
  conOperador,
  leerAsignacion,
  type MedioPauta,
  prepararAsignacion,
  publicarEvidencia,
  restablecerPautaMedio,
  validarMetricaCon,
} from "./fabricas-pauta"
import {
  abrirDisputa,
  cambiarSuspensionMedio,
  cancelarAsignacion,
  mensajeDisputa,
  type PartesValidacion,
  prepararAsignacionValidacion,
  prepararEvidenciaPendiente,
  prepararListaParaVerificar,
  prepararMetricaPendiente,
  resolverDisputa,
  restablecerValidacion,
  tomarDisputa,
  vencerAsignacion,
} from "./fabricas-validacion"
import { MEDIO_E2E_ID, MEDIO_SUSPENSION_E2E_ID } from "./medios-e2e"
import { codigoTotpEstable } from "./mfa"
import { sufijoUnico } from "./negocio-e2e"
import { ANUNCIANTE_E2E_ID } from "./organizacion"
import { consumeCupo, PREFIJO_PAUTA } from "./pauta-e2e"
import {
  clienteComoSuperadmin,
  cuentaE2E,
  variableTotpDe,
} from "./provision-e2e"
import {
  buscarUsuarioPorEmail,
  cargarEntorno,
  type ClienteSupabase,
  crearClienteServicio,
  describirProyecto,
  type EntornoBootstrap,
} from "./supabase"
import {
  describirRestablecimiento,
  esBaseLocal,
  PREFIJO_VALIDACION,
} from "./validacion-e2e"

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

function credencialesDe(clave: string): { email: string; password: string } {
  const cuenta = cuentaE2E(clave)
  return {
    email: variable(cuenta.variableEmail),
    password: variable(cuenta.variablePassword),
  }
}

/** Recorre una cola página a página hasta encontrar la fila (o agotarla). */
async function buscarEnCola<T extends { total: number }>(
  pedir: (desplazamiento: number) => Promise<T[]>,
  coincide: (fila: T) => boolean
): Promise<T | null> {
  for (let desplazamiento = 0; ; desplazamiento += 200) {
    const filas = await pedir(desplazamiento)
    const fila = filas.find(coincide)
    if (fila) return fila
    if (filas.length === 0 || desplazamiento + 200 >= (filas[0]?.total ?? 0)) {
      return null
    }
  }
}

/**
 * Ingresa como OPERACIONES con su contraseña y su TOTP (aal2), como lo haría
 * en la app, y ejecuta `accion` con su cliente (RLS de su rol).
 */
async function conSesionOperaciones<T>(
  entorno: EntornoBootstrap,
  accion: (cliente: ClienteSupabase) => Promise<T>
): Promise<T> {
  const cuenta = cuentaE2E("OPERACIONES")
  const secreto = variable(variableTotpDe(cuenta))
  return conClienteDeUsuario(
    entorno,
    credencialesDe("OPERACIONES"),
    async (cliente) => {
      const { data, error } = await cliente.auth.mfa.listFactors()
      const factor = data?.totp.find((f) => f.status === "verified")
      if (error || !factor) {
        throw new Error("La cuenta de OPERACIONES no tiene un TOTP verificado.")
      }
      const verificacion = await cliente.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: await codigoTotpEstable(secreto),
      })
      if (verificacion.error) {
        throw new Error(
          `OPERACIONES no pasó el TOTP: ${verificacion.error.message}`
        )
      }
      return accion(cliente)
    }
  )
}

async function estadoMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<string> {
  const { data, error } = await servicio
    .from("medios")
    .select("estado")
    .eq("id", medioId)
    .single()
  if (error) throw new Error(error.message)
  return data.estado
}

async function main(): Promise<void> {
  const entorno = cargarEntorno()
  if (!esBaseLocal(entorno.url)) {
    throw new Error(
      "Este comprobador corre solo contra la base local (vence asignaciones por la conexión directa)."
    )
  }
  const superadmin = await clienteComoSuperadmin(entorno)
  const servicio = crearClienteServicio(entorno)
  log(`Validación E2E en ${describirProyecto(entorno)}`)

  const medio: MedioPauta = {
    id: MEDIO_E2E_ID,
    credenciales: credencialesDe("MEDIO"),
  }
  const suspension: MedioPauta = {
    id: MEDIO_SUSPENSION_E2E_ID,
    credenciales: credencialesDe("MEDIO_SUSPENSION"),
  }
  const empresaCredenciales = credencialesDe("ANUNCIANTE")
  const perfilEmpresa = await buscarUsuarioPorEmail(
    servicio,
    empresaCredenciales.email
  )
  if (!perfilEmpresa) throw new Error(`No existe ${empresaCredenciales.email}.`)
  const partes: PartesValidacion = {
    empresa: { id: perfilEmpresa.id, ...empresaCredenciales },
    medios: [medio, suspension],
  }
  const restablecer = () =>
    restablecerValidacion(entorno, superadmin, {
      medios: partes.medios,
      medioSuspension: MEDIO_SUSPENSION_E2E_ID,
    })

  log(`· Restablecer: ${describirRestablecimiento(await restablecer())}`)
  try {
    // 1. Las colas.
    log("· Asignaciones para cada cola y lo que ve OPERACIONES")
    const evidencia = await prepararEvidenciaPendiente(entorno, partes, medio)
    const conAlerta = await prepararMetricaPendiente(entorno, partes, medio, {
      conAlerta: true,
    })
    const sinAlerta = await prepararMetricaPendiente(entorno, partes, medio)
    const lista = await prepararListaParaVerificar(entorno, partes, medio)
    const bloqueada = await prepararListaParaVerificar(entorno, partes, medio, {
      permanenciaDias: 30,
    })
    comprobar(
      (await leerAsignacion(servicio, evidencia.asignacionId)).estado ===
        "PUBLICADA" && evidencia.publicaciones.length === 1,
      "evidencia pendiente: PUBLICADA con su publicación"
    )
    comprobar(
      conAlerta.alerta.multiplo &&
        conAlerta.alerta.limiteAlcance === 80_000 &&
        (await leerAsignacion(servicio, conAlerta.asignacionId)).estado ===
          "METRICAS_CARGADAS",
      `métrica con alerta por múltiplo (límite ${conAlerta.alerta.limiteAlcance}) y la asignación METRICAS_CARGADAS`
    )
    comprobar(
      !sinAlerta.alerta.multiplo && !sinAlerta.alerta.desviacion,
      "métrica sin alerta"
    )
    comprobar(lista.lista, "lista para verificar: permanencia cumplida")
    comprobar(
      !bloqueada.lista && bloqueada.permanenciaHasta.getTime() > Date.now(),
      "con 30 días de permanencia queda bloqueada"
    )
    await conSesionOperaciones(entorno, async (cliente) => {
      const filaEvidencia = await buscarEnCola(
        async (p) => {
          const { data, error } = await cliente.rpc("cola_evidencias", {
            p_limite: 200,
            p_desplazamiento: p,
          })
          if (error) throw new Error(error.message)
          return data
        },
        (fila) => fila.asignacion_id === evidencia.asignacionId
      )
      comprobar(
        filaEvidencia?.url_post === evidencia.publicaciones[0]?.url &&
          filaEvidencia.captura_path !== null,
        "OPERACIONES ve la evidencia en su cola con el post y la captura"
      )
      const filaAlerta = await buscarEnCola(
        async (p) => {
          const { data, error } = await cliente.rpc("cola_metricas", {
            p_solo_alertas: true,
            p_limite: 200,
            p_desplazamiento: p,
          })
          if (error) throw new Error(error.message)
          return data
        },
        (fila) => fila.metrica_id === conAlerta.metricaId
      )
      comprobar(
        filaAlerta?.alerta_multiplo === true &&
          filaAlerta.evidencia_aprobada === true,
        "la métrica con alerta sale en «Solo con alertas» con su evidencia aprobada"
      )
      const { data: alertas, error } = await cliente.rpc("alertas_metricas", {
        p_asignacion_id: conAlerta.asignacionId,
      })
      if (error) throw new Error(error.message)
      comprobar(
        alertas.some(
          (a) => a.metrica_id === conAlerta.metricaId && a.alerta_multiplo
        ),
        "alertas_metricas(asignación) trae la alerta"
      )
      const verificacion = async (asignacionId: string) =>
        buscarEnCola(
          async (p) => {
            const { data, error: errorCola } = await cliente.rpc(
              "cola_verificacion",
              { p_limite: 200, p_desplazamiento: p }
            )
            if (errorCola) throw new Error(errorCola.message)
            return data
          },
          (fila) => fila.asignacion_id === asignacionId
        )
      const filaLista = await verificacion(lista.asignacionId)
      const filaBloqueada = await verificacion(bloqueada.asignacionId)
      comprobar(
        filaLista?.lista === true && filaLista.bloqueo === null,
        "la lista sale lista en la cola de verificación"
      )
      comprobar(
        filaBloqueada?.lista === false &&
          filaBloqueada.bloqueo === "PERMANENCIA",
        "la de 30 días sale bloqueada por PERMANENCIA"
      )
    })

    // 2. Validar con alerta.
    log("· Aprobar una métrica con alerta")
    await conOperador(entorno, async (sesion) => {
      comprobar(
        await fallaCon(
          validarMetricaCon(sesion, conAlerta.metricaId, { aprobar: true }),
          "alerta_sin_revision"
        ),
        "sin anotar la revisión da alerta_sin_revision"
      )
      await validarMetricaCon(sesion, conAlerta.metricaId, {
        aprobar: true,
        observaciones: "Revisé la captura y el alcance coincide.",
      })
    })
    comprobar(
      (await leerAsignacion(servicio, conAlerta.asignacionId)).metricas[0]
        ?.estado === "APROBADA",
      "con la revisión anotada queda APROBADA"
    )

    // 3. Disputas.
    log("· Disputas: mensajes, nota interna y resoluciones")
    const disputa = await abrirDisputa(entorno, partes, {
      asignacionId: lista.asignacionId,
      como: "ANUNCIANTE",
      motivo: "METRICAS",
      descripcion: "El alcance reportado no coincide con lo que vimos.",
    })
    comprobar(
      (await leerAsignacion(servicio, lista.asignacionId)).estado ===
        "EN_DISPUTA",
      "la empresa abre la disputa y la asignación queda EN_DISPUTA"
    )
    comprobar(
      await fallaCon(
        abrirDisputa(entorno, partes, {
          asignacionId: lista.asignacionId,
          como: "MEDIO",
          motivo: "OTRO",
          descripcion: "Otra disputa sobre lo mismo.",
        }),
        "AMO_"
      ),
      "no se abre una segunda disputa sobre la misma asignación"
    )
    const delMedio = await mensajeDisputa(entorno, partes, {
      disputaId: disputa,
      como: "MEDIO",
      mensaje: "Adjunto la captura del panel de estadísticas.",
      adjunto: "imagen",
    })
    const interna = await mensajeDisputa(entorno, partes, {
      disputaId: disputa,
      como: "ADMIN",
      mensaje: "Revisar el alcance contra la mediana de la cuenta.",
      interno: true,
      adjunto: "pdf",
    })
    comprobar(
      delMedio.adjuntoPath?.startsWith(`disputa/${disputa}/`) === true &&
        interna.adjuntoPath?.startsWith(`disputa/${disputa}/interno/`) === true,
      "el adjunto del medio y el de la nota interna quedan en su carpeta"
    )
    comprobar(
      await fallaCon(
        mensajeDisputa(entorno, partes, {
          disputaId: disputa,
          como: "MEDIO",
          mensaje: "Nota interna del medio",
          interno: true,
        }),
        "Solo el equipo AMO"
      ),
      "una parte no deja notas internas"
    )
    const hiloMedio = await conClienteDeUsuario(
      entorno,
      medio.credenciales,
      async (cliente) => {
        const { data, error } = await cliente.rpc("mensajes_disputa", {
          p_disputa_id: disputa,
        })
        if (error) throw new Error(error.message)
        return data
      }
    )
    comprobar(
      hiloMedio.length === 1 &&
        hiloMedio[0]?.es_mio === true &&
        hiloMedio[0].autor_parte === "MEDIO",
      "el medio ve su mensaje y no la nota interna"
    )
    const { count: avisosCola } = await servicio
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "cola.disputa_mensaje")
      .eq("entidad_id", disputa)
    comprobar(
      (avisosCola ?? 0) > 0,
      "el mensaje de una parte avisa al equipo (cola.disputa_mensaje)"
    )
    await tomarDisputa(entorno, { disputaId: disputa })
    const verificada = await resolverDisputa(entorno, {
      disputaId: disputa,
      resultado: "VERIFICAR",
    })
    comprobar(
      verificada.estadoDisputa === "RESUELTA" &&
        verificada.estadoAsignacion === "VERIFICADA",
      "tomar en revisión y resolver VERIFICAR la deja VERIFICADA"
    )
    const restaurar = await abrirDisputa(entorno, partes, {
      asignacionId: bloqueada.asignacionId,
      como: "MEDIO",
      motivo: "PAGO",
      descripcion: "Quiero confirmar cuándo me pagan esta publicación.",
    })
    comprobar(
      await fallaCon(
        cancelarAsignacion(entorno, {
          asignacionId: bloqueada.asignacionId,
          causa: "ADMINISTRATIVA",
        }),
        "en_disputa"
      ),
      "cancelar en disputa da en_disputa"
    )
    const restaurada = await resolverDisputa(entorno, {
      disputaId: restaurar,
      resultado: "RESTAURAR",
    })
    comprobar(
      restaurada.estadoAsignacion === "METRICAS_CARGADAS",
      "RESTAURAR devuelve el estado previo"
    )
    const descartar = await abrirDisputa(entorno, partes, {
      asignacionId: bloqueada.asignacionId,
      como: "ADMIN",
      motivo: "CONTENIDO",
      descripcion: "Revisión de oficio del contenido publicado.",
    })
    const descartada = await resolverDisputa(entorno, {
      disputaId: descartar,
      resultado: "DESCARTAR",
    })
    comprobar(
      descartada.estadoDisputa === "DESCARTADA" &&
        descartada.estadoAsignacion === "METRICAS_CARGADAS",
      "el equipo AMO abre una de oficio y DESCARTAR restaura el estado"
    )
    // Una abierta que la limpieza debe cerrar.
    await abrirDisputa(entorno, partes, {
      asignacionId: evidencia.asignacionId,
      como: "ANUNCIANTE",
      motivo: "CONTENIDO",
      descripcion: "La publicación no usa el copy acordado.",
    })

    // 4. Vencida y reclamo.
    log("· Vencida, reclamo y reapertura")
    const porVencer = await prepararAsignacionValidacion(
      entorno,
      partes,
      medio,
      { hasta: "CONTENIDO_ENTREGADO" }
    )
    const vencida = await vencerAsignacion(entorno, {
      asignacionId: porVencer.asignacionId,
    })
    const horas =
      (vencida.reclamoHasta.getTime() - Date.parse(vencida.vencidaAt)) /
      3_600_000
    comprobar(
      (await leerAsignacion(servicio, porVencer.asignacionId)).estado ===
        "VENCIDA_SIN_PUBLICAR" && horas === 72,
      `el cron la vence y el medio tiene ${horas} h para reclamar`
    )
    const acciones = await conClienteDeUsuario(
      entorno,
      medio.credenciales,
      async (cliente) => {
        const { data, error } = await cliente.rpc("proximas_acciones_medio", {
          p_limite: 100,
        })
        if (error) throw new Error(error.message)
        return data
      }
    )
    comprobar(
      acciones.some(
        (a) =>
          a.asignacion_id === porVencer.asignacionId && a.accion === "RECLAMAR"
      ),
      "el medio ve «Reclama la publicación» (RECLAMAR)"
    )
    comprobar(
      await fallaCon(
        abrirDisputa(entorno, partes, {
          asignacionId: porVencer.asignacionId,
          como: "ANUNCIANTE",
          motivo: "OTRO",
          descripcion: "La empresa no reclama una vencida.",
        }),
        "AMO_TRANSICION_INVALIDA"
      ),
      "la empresa no puede reclamar una vencida"
    )
    const reclamo = await abrirDisputa(entorno, partes, {
      asignacionId: porVencer.asignacionId,
      como: "MEDIO",
      motivo: "OTRO",
      descripcion: "Sí publiqué y no se registró",
    })
    const reabierta = await resolverDisputa(entorno, {
      disputaId: reclamo,
      resultado: "REABRIR",
    })
    const horasRecarga =
      (Date.parse(reabierta.fechaLimitePublicacion ?? "") - Date.now()) /
      3_600_000
    comprobar(
      reabierta.estadoAsignacion === "CONTENIDO_ENTREGADO" &&
        horasRecarga > 23 &&
        horasRecarga < 24.1,
      `REABRIR la devuelve a CONTENIDO_ENTREGADO con ${horasRecarga.toFixed(1)} h para la evidencia`
    )
    await publicarEvidencia(entorno, medio, {
      asignacionId: porVencer.asignacionId,
    })
    comprobar(
      (await leerAsignacion(servicio, porVencer.asignacionId)).estado ===
        "PUBLICADA",
      "el medio carga la evidencia dentro del plazo nuevo"
    )
    // Otra vencida sin reclamar: la limpieza la cierra con la sesión del medio.
    const sinReclamar = await prepararAsignacionValidacion(
      entorno,
      partes,
      medio,
      { hasta: "CONTENIDO_ENTREGADO" }
    )
    await vencerAsignacion(entorno, { asignacionId: sinReclamar.asignacionId })

    // 5. Cancelación y suspensión.
    log("· Cancelación por fraude con suspensión del medio dedicado")
    const deSuspension = await prepararEvidenciaPendiente(
      entorno,
      partes,
      suspension
    )
    const enCurso = await prepararEvidenciaPendiente(
      entorno,
      partes,
      suspension
    )
    comprobar(
      await fallaCon(
        cancelarAsignacion(entorno, {
          asignacionId: deSuspension.asignacionId,
          causa: "ADMINISTRATIVA",
          suspenderMedio: true,
        }),
        "AMO_TRANSICION_INVALIDA"
      ),
      "suspender con una causa administrativa se rechaza"
    )
    const cancelada = await cancelarAsignacion(entorno, {
      asignacionId: deSuspension.asignacionId,
      causa: "FRAUDE",
      motivo: "La captura del panel fue editada.",
      suspenderMedio: true,
    })
    comprobar(
      cancelada.medioSuspendido &&
        (await estadoMedio(servicio, MEDIO_SUSPENSION_E2E_ID)) === "SUSPENDIDO",
      "cancelar por fraude suspende al medio en la misma transacción"
    )
    const elegibilidad = await conClienteDeUsuario(
      entorno,
      suspension.credenciales,
      async (cliente) => {
        const { data, error } = await cliente.rpc("mi_elegibilidad_marketplace")
        if (error) throw new Error(error.message)
        return data[0]
      }
    )
    comprobar(
      elegibilidad?.motivo === "MEDIO_SUSPENDIDO" &&
        (await leerAsignacion(servicio, enCurso.asignacionId)).estado ===
          "PUBLICADA",
      "el medio suspendido no ve ofertas y conserva lo que tiene en curso"
    )
    comprobar(
      !(await cambiarSuspensionMedio(entorno, {
        medioId: MEDIO_SUSPENSION_E2E_ID,
        hacia: "SUSPENDIDO",
        motivo: "Otra vez",
      })),
      "suspender a un medio suspendido no hace nada"
    )
    comprobar(
      await cambiarSuspensionMedio(entorno, {
        medioId: MEDIO_SUSPENSION_E2E_ID,
        hacia: "VERIFICADO",
        motivo: "Revisión terminada.",
      }),
      "reactivar lo devuelve a VERIFICADO"
    )
    await cambiarSuspensionMedio(entorno, {
      medioId: MEDIO_SUSPENSION_E2E_ID,
      hacia: "SUSPENDIDO",
      motivo: "Suspensión para probar la limpieza.",
    })

    // 6. Limpieza.
    log("· Limpieza de la validación y de la pauta con disputas")
    const limpieza = await restablecer()
    log(`  · ${describirRestablecimiento(limpieza)}`)
    comprobar(
      limpieza.disputasCerradas >= 1 &&
        limpieza.reclamosCerrados === 1 &&
        limpieza.medioReactivado,
      "cierra la disputa abierta, el reclamo pendiente y reactiva al medio"
    )
    const { data: restantes, error } = await servicio
      .from("asignaciones")
      .select(
        "id, estado, estado_previo_disputa, campana:campanas!inner ( nombre, deleted_at )"
      )
      .like("campana.nombre", `${PREFIJO_VALIDACION}%`)
      .in("medio_id", [MEDIO_E2E_ID, MEDIO_SUSPENSION_E2E_ID])
    if (error) throw new Error(error.message)
    comprobar(
      restantes.every(
        (a) =>
          a.campana.deleted_at !== null &&
          !consumeCupo(a.estado, a.estado_previo_disputa) &&
          a.estado !== "EN_DISPUTA" &&
          a.estado !== "VENCIDA_SIN_PUBLICAR"
      ),
      `no queda nada en curso ni por reclamar (${restantes.length} asignaciones archivadas)`
    )

    const campanaPauta = await crearCampana(entorno, partes.empresa, {
      anuncianteId: ANUNCIANTE_E2E_ID,
      nombre: `${PREFIJO_PAUTA} ${sufijoUnico()}`,
    })
    const ofertaPauta = await crearOferta(entorno, partes.empresa, {
      campanaId: campanaPauta.id,
      estado: "PUBLICADA",
      ventanaDesdeHoy: true,
      segmentacion: { paraMedio: MEDIO_E2E_ID },
    })
    const enPauta = await prepararAsignacion(entorno, medio, {
      ofertaId: ofertaPauta.id,
      hasta: "PUBLICADA",
    })
    await conOperador(entorno, (sesion) =>
      aprobarEvidenciasCon(sesion, enPauta.asignacionId)
    )
    const disputaPauta = await abrirDisputa(entorno, partes, {
      asignacionId: enPauta.asignacionId,
      como: "ANUNCIANTE",
      motivo: "CONTENIDO",
      descripcion: "Disputa en la pauta del medio.",
    })
    await mensajeDisputa(entorno, partes, {
      disputaId: disputaPauta,
      como: "MEDIO",
      mensaje: "Publiqué el contenido tal cual.",
    })
    const pauta = await restablecerPautaMedio(entorno, superadmin, medio)
    comprobar(
      pauta.archivadas >= 1 &&
        (await leerAsignacion(servicio, enPauta.asignacionId)).estado ===
          "CANCELADA",
      "restablecer la pauta cierra la disputa con mensajes y archiva la campaña"
    )
  } finally {
    log("· Limpieza final")
    try {
      log(`  · ${describirRestablecimiento(await restablecer())}`)
      await restablecerPautaMedio(entorno, superadmin, medio)
      comprobar(
        (await estadoMedio(servicio, MEDIO_SUSPENSION_E2E_ID)) === "VERIFICADO",
        "el Medio Suspensión E2E queda VERIFICADO"
      )
    } catch (error) {
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
