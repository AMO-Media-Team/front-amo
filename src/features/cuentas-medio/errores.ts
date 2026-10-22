/**
 * Errores de «Mi medio › Cuentas sociales» (módulo puro): restricciones de
 * `cuentas_sociales` y `verificaciones_cuenta` con el campo del formulario
 * donde se muestran, y los mensajes de las reglas que comprueba el servidor.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const RESTRICCIONES_CUENTAS: Restricciones = {
  cuentas_sociales_plataforma_handle_key: {
    campo: "perfil",
    mensaje:
      "Esa cuenta ya está registrada en AMO. Si es tuya y no la registraste tú, avísale al equipo de AMO.",
  },
  cuentas_sociales_handle_chk: {
    campo: "perfil",
    mensaje:
      "El usuario solo puede tener letras, números, puntos y guiones bajos.",
  },
  cuentas_sociales_url_chk: {
    campo: "perfil",
    mensaje: "El enlace no corresponde a un perfil de esa red social.",
  },
  cuentas_sociales_tarifa_referencia_chk: {
    campo: "tarifa",
    mensaje: "La tarifa debe ser mayor que cero.",
  },
  verificaciones_cuenta_una_pendiente_key:
    "Esta cuenta ya tiene una verificación en curso. Actualiza la página para verla.",
  verificaciones_cuenta_reportados_chk: {
    campo: "seguidores",
    mensaje: "Escribe un número de seguidores válido.",
  },
}

export function interpretarErrorCuenta(error: ErrorBd): ErrorBdInterpretado {
  return interpretarErrorBd(error, RESTRICCIONES_CUENTAS)
}

export const MENSAJES_CUENTAS = {
  sinMedio:
    "Tu usuario no está vinculado a un medio. Pídele al equipo de AMO que lo revise.",
  cuentaInexistente:
    "No encontramos esa cuenta o ya no está registrada. Actualiza la página.",
  cuentaDesactualizada:
    "La cuenta cambió desde que abriste el formulario. Revisa los datos actuales e intenta de nuevo.",
  plataformaDistinta: "La red social de una cuenta no se puede cambiar.",
  cuentaRepetida:
    "Ya registraste esta cuenta. Búscala en la lista para verificarla o editarla.",
  perfilBloqueadoVerificada:
    "Una cuenta verificada no cambia de usuario ni de enlace. Si ahora usas otra cuenta, regístrala como nueva.",
  perfilBloqueadoRevision:
    "No puedes cambiar el usuario mientras revisamos la verificación de esta cuenta.",
  quitarVerificada:
    "Una cuenta verificada no se puede quitar desde aquí porque puede tener campañas asociadas. Pídeselo al equipo de AMO.",
  quitarEnRevision:
    "Espera a que terminemos de revisar la verificación de esta cuenta para quitarla.",
  verificacionEnRevision:
    "Esta cuenta ya tiene una verificación en revisión. Te avisaremos cuando la resolvamos.",
  verificacionInexistente:
    "No encontramos esa verificación o ya fue revisada. Actualiza la página.",
  codigoVencido:
    "El código venció antes de recibir la captura. Genera uno nuevo y vuelve a publicarlo.",
  noEsCodigo: "Esta verificación no usa un código en una historia.",
  capturaAjena:
    "La captura no corresponde a esta cuenta. Vuelve a cargarla desde aquí.",
} as const
