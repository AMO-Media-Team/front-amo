/**
 * Mensajes de la vinculación y traducción de errores entre acciones (módulo
 * puro). «Invitar» reutiliza `registrarMedio` y `crearUsuario`: sus errores de
 * campo llegan con los nombres de esos formularios y aquí se llevan a los de la
 * hoja de la solicitud.
 */
import { type ErrorBd, interpretarErrorBd } from "@/lib/errores-bd"
import { type ErroresCampo, fallo, type ResultadoFallo } from "@/lib/result"

export const MENSAJES_VINCULACION = {
  envioFallido:
    "No pudimos enviar tu solicitud. Revisa tu conexión e intenta de nuevo en unos minutos; lo que escribiste sigue aquí.",
  municipioDesconocido: "Elige un municipio de la lista.",
  solicitudInexistente:
    "La solicitud ya no está en la cola. Actualiza la página para ver la información vigente.",
  solicitudAtendida:
    "Otra persona ya atendió esta solicitud. La cola se actualizó.",
  medioInexistente:
    "El medio elegido ya no está disponible. Elige otro o registra uno nuevo.",
  sinPermisoInvitar:
    "Para invitar necesitas el permiso «Invitar usuarios». Pide a un administrador que la atienda.",
  sinRolMedio:
    "No tienes roles de medio que puedas asignar. Pide a un administrador que la atienda.",
  sinPermisoRegistrar:
    "Para registrar un medio nuevo necesitas el permiso «Editar medios». Puedes vincular la persona a un medio ya registrado.",
  sinMarcarInvitada:
    "La invitación quedó creada, pero la solicitud sigue en la cola. Descártala con el motivo «Invitada» para cerrarla.",
} as const

/** Lleva los errores de campo de otra acción a los nombres de esta hoja. */
export function renombrarCampos(
  resultado: ResultadoFallo,
  equivalencias: Readonly<Record<string, string>>
): ResultadoFallo {
  if (!resultado.erroresCampo) return resultado
  const renombrados: ErroresCampo = {}
  const sinCampo: string[] = []
  for (const [campo, mensajes] of Object.entries(resultado.erroresCampo)) {
    const destino = equivalencias[campo]
    if (destino) renombrados[destino] = mensajes
    else sinCampo.push(...mensajes)
  }
  // Un error de un campo que la hoja no tiene se muestra como mensaje general.
  if (Object.keys(renombrados).length === 0) {
    return fallo(sinCampo[0] ?? resultado.error)
  }
  return fallo(resultado.error, renombrados)
}

/**
 * Antepone a un fallo del alta de la persona que el medio sí quedó
 * registrado: reintentar no lo registra de nuevo.
 */
export function conMedioRegistrado(
  resultado: ResultadoFallo,
  nombreMedio: string
): ResultadoFallo {
  const aviso = `Registramos el medio «${nombreMedio}», pero no pudimos crear la cuenta: ${resultado.error} Corrige y vuelve a intentarlo; no se registrará de nuevo.`
  return resultado.erroresCampo
    ? fallo(aviso, resultado.erroresCampo)
    : fallo(aviso)
}

/** Error de la BD al enviar la solicitud pública: municipio o límite por conexión. */
export function interpretarErrorEnvio(error: ErrorBd): {
  resultado: ResultadoFallo
  esperado: boolean
} {
  const { codigo, mensaje, esperado } = interpretarErrorBd(error)
  if (codigo === "AMO_CONFIG_INVALIDA") {
    return {
      resultado: fallo(mensaje, { municipioCodigo: [mensaje] }),
      esperado,
    }
  }
  if (codigo === "AMO_LIMITE_SOLICITUDES") {
    return { resultado: fallo(mensaje), esperado }
  }
  return {
    resultado: fallo(MENSAJES_VINCULACION.envioFallido),
    esperado: false,
  }
}
