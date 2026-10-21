"use client"

import {
  Archive,
  Ban,
  KeyRound,
  Link2,
  LogOut,
  type LucideIcon,
  MailX,
  RotateCcwKey,
  ShieldX,
  Trash2,
  UserCheck,
  UserPen,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import type { ResultadoAccion } from "@/lib/result"

import {
  cerrarSesionesUsuario,
  desactivarUsuario,
  eliminarUsuario,
  forzarCambioContrasena,
  generarEnlaceAcceso,
  reactivarUsuario,
  restablecerMfa,
  suspenderUsuario,
} from "../actions"
import { nombreVisible } from "../presentacion"
import type { AccionUsuario, ObjetivoAcciones } from "../reglas-acciones"
import { TEXTO_CONFIRMAR_ELIMINAR } from "../schemas"
import {
  type CredencialParaMostrar,
  DialogoCredencial,
} from "./dialogo-credencial"
import { DialogoMotivo } from "./dialogo-motivo"

export const RUTA_USUARIOS = "/administracion/usuarios" as Route

export function rutaUsuario(id: string, editar = false): Route {
  return `${RUTA_USUARIOS}/${id}${editar ? "?editar=1" : ""}` as Route
}

export type UsuarioAcciones = ObjetivoAcciones & {
  nombre: string | null
  email: string
}

export interface ConfigAccion {
  etiqueta: string
  Icono: LucideIcon
  destructiva?: boolean
}

export const CONFIG_ACCIONES: Readonly<Record<AccionUsuario, ConfigAccion>> = {
  editar: { etiqueta: "Editar datos y rol", Icono: UserPen },
  enlace_invitacion: { etiqueta: "Regenerar invitación", Icono: Link2 },
  enlace_recuperacion: { etiqueta: "Enlace de recuperación", Icono: KeyRound },
  forzar_cambio: {
    etiqueta: "Exigir cambio de contraseña",
    Icono: RotateCcwKey,
  },
  restablecer_mfa: {
    etiqueta: "Restablecer verificación en dos pasos",
    Icono: ShieldX,
  },
  cerrar_sesiones: { etiqueta: "Cerrar sus sesiones", Icono: LogOut },
  reactivar: { etiqueta: "Reactivar cuenta", Icono: UserCheck },
  suspender: { etiqueta: "Suspender", Icono: Ban, destructiva: true },
  revocar_invitacion: {
    etiqueta: "Revocar invitación",
    Icono: MailX,
    destructiva: true,
  },
  desactivar: {
    etiqueta: "Desactivar cuenta",
    Icono: Archive,
    destructiva: true,
  },
  eliminar: {
    etiqueta: "Eliminar definitivamente",
    Icono: Trash2,
    destructiva: true,
  },
}

interface DialogosAccionUsuarioProps {
  usuario: UsuarioAcciones
  /** Acción cuyo diálogo está abierto (`null`: ninguno). */
  accion: AccionUsuario | null
  onCerrar: () => void
  /** Tras eliminar desde la ficha se vuelve al listado. */
  volverAlListadoTrasEliminar?: boolean
}

/**
 * Diálogos de confirmación de cada acción sobre un usuario (patrón de acción
 * destructiva: motivo obligatorio o texto de verificación, error dentro del
 * diálogo, toast al terminar). Los comparten el menú de la fila, los botones
 * de la ficha y los accesos directos de la pestaña Seguridad.
 */
export function DialogosAccionUsuario({
  usuario,
  accion,
  onCerrar,
  volverAlListadoTrasEliminar = false,
}: DialogosAccionUsuarioProps) {
  const router = useRouter()
  const [credencial, setCredencial] = useState<CredencialParaMostrar | null>(
    null
  )
  const nombre = nombreVisible(usuario)
  const id = usuario.id

  const alCambiar = (abierto: boolean) => {
    if (!abierto) onCerrar()
  }

  async function conAviso<T>(
    resultado: Promise<ResultadoAccion<T>>,
    mensaje: string
  ): Promise<ResultadoAccion<T>> {
    const respuesta = await resultado
    if (respuesta.ok) toast.success(mensaje, { description: nombre })
    return respuesta
  }

  async function generarEnlace() {
    const resultado = await generarEnlaceAcceso({ usuarioId: id })
    if (resultado.ok) {
      setCredencial({
        credencial: resultado.datos,
        email: usuario.email,
        motivo: "regeneracion",
      })
    }
    return resultado
  }

  return (
    <>
      <DialogoMotivo
        abierto={accion === "suspender"}
        onAbiertoChange={alCambiar}
        titulo={`¿Suspender a ${nombre}?`}
        descripcion="No podrá ingresar y sus sesiones abiertas se cerrarán de inmediato. Puedes reactivarla cuando quieras."
        textoConfirmar="Suspender"
        destructivo
        onConfirmar={(motivo) =>
          conAviso(
            suspenderUsuario({ usuarioId: id, motivo }),
            "Cuenta suspendida"
          )
        }
      />
      <DialogoMotivo
        abierto={accion === "reactivar"}
        onAbiertoChange={alCambiar}
        titulo={`¿Reactivar a ${nombre}?`}
        descripcion="Podrá volver a ingresar con su contraseña y su verificación en dos pasos."
        textoConfirmar="Reactivar"
        onConfirmar={(motivo) =>
          conAviso(
            reactivarUsuario({ usuarioId: id, motivo }),
            "Cuenta reactivada"
          )
        }
      />
      <DialogoMotivo
        abierto={accion === "revocar_invitacion"}
        onAbiertoChange={alCambiar}
        titulo="¿Revocar la invitación?"
        descripcion={`El enlace enviado a ${usuario.email} dejará de funcionar y la cuenta quedará desactivada.`}
        textoConfirmar="Revocar invitación"
        destructivo
        onConfirmar={(motivo) =>
          conAviso(
            desactivarUsuario({ usuarioId: id, motivo }),
            "Invitación revocada"
          )
        }
      />
      <DialogoMotivo
        abierto={accion === "desactivar"}
        onAbiertoChange={alCambiar}
        titulo={`¿Desactivar a ${nombre}?`}
        descripcion="Es una baja: no podrá ingresar y dejará de aparecer en el listado (usa el filtro Desactivado para verla). Su historial se conserva."
        textoConfirmar="Desactivar"
        destructivo
        onConfirmar={(motivo) =>
          conAviso(
            desactivarUsuario({ usuarioId: id, motivo }),
            "Cuenta desactivada"
          )
        }
      />

      <DialogoConfirmacion
        abierto={accion === "cerrar_sesiones"}
        onAbiertoChange={alCambiar}
        titulo={`¿Cerrar las sesiones de ${nombre}?`}
        descripcion="Tendrá que volver a ingresar en todos sus dispositivos."
        textoConfirmar="Cerrar sesiones"
        onConfirmar={() =>
          conAviso(
            cerrarSesionesUsuario({ usuarioId: id }),
            "Sesiones cerradas"
          )
        }
      />
      <DialogoConfirmacion
        abierto={accion === "restablecer_mfa"}
        onAbiertoChange={alCambiar}
        titulo="¿Restablecer la verificación en dos pasos?"
        descripcion="Se borrará su app autenticadora y se cerrarán sus sesiones. Al volver a ingresar deberá configurarla de nuevo. Úsalo si perdió su teléfono."
        textoConfirmar="Restablecer"
        destructivo
        onConfirmar={() =>
          conAviso(
            restablecerMfa({ usuarioId: id }),
            "Verificación restablecida"
          )
        }
      />
      <DialogoConfirmacion
        abierto={accion === "forzar_cambio"}
        onAbiertoChange={alCambiar}
        titulo="¿Exigir un cambio de contraseña?"
        descripcion="La próxima vez que use AMO deberá crear una contraseña nueva antes de continuar."
        textoConfirmar="Exigir cambio"
        onConfirmar={() =>
          conAviso(
            forzarCambioContrasena({ usuarioId: id }),
            "Cambio de contraseña exigido"
          )
        }
      />
      <DialogoConfirmacion
        abierto={
          accion === "enlace_invitacion" || accion === "enlace_recuperacion"
        }
        onAbiertoChange={alCambiar}
        titulo={
          accion === "enlace_invitacion"
            ? "¿Generar una invitación nueva?"
            : "¿Generar un enlace de recuperación?"
        }
        descripcion={
          accion === "enlace_invitacion"
            ? "El enlace anterior dejará de funcionar. Verás el nuevo una sola vez para compartirlo."
            : `Con él ${usuario.email} podrá crear una contraseña nueva. Lo verás una sola vez.`
        }
        textoConfirmar="Generar enlace"
        onConfirmar={generarEnlace}
      />
      <DialogoConfirmacion
        abierto={accion === "eliminar"}
        onAbiertoChange={alCambiar}
        titulo={`¿Eliminar a ${nombre} definitivamente?`}
        descripcion="Se borran su cuenta, sus sesiones y su verificación. No se puede deshacer; la bitácora conserva solo un registro mínimo."
        textoConfirmar="Eliminar definitivamente"
        textoVerificacion={TEXTO_CONFIRMAR_ELIMINAR}
        destructivo
        onConfirmar={async () => {
          const resultado = await conAviso(
            eliminarUsuario({
              usuarioId: id,
              confirmacion: TEXTO_CONFIRMAR_ELIMINAR,
            }),
            "Usuario eliminado"
          )
          if (resultado.ok && volverAlListadoTrasEliminar)
            router.replace(RUTA_USUARIOS)
          return resultado
        }}
      />

      <DialogoCredencial
        datos={credencial}
        onCerrar={() => setCredencial(null)}
      />
    </>
  )
}
