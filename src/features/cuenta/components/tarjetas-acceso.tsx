import { KeyRound, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import type { SeguridadPropia } from "../tipos"
import { AccionesMfa } from "./acciones-mfa"
import { DialogoContrasena } from "./dialogo-contrasena"
import { AccionesPie, SeccionCuenta } from "./seccion-cuenta"

function Instante({ valor }: { valor: string }) {
  return (
    <time
      dateTime={valor}
      title={formatearFechaHora(valor)}
      suppressHydrationWarning
    >
      {formatearRelativo(valor)}
    </time>
  )
}

/** Contraseña: cuándo se cambió por última vez y el diálogo para cambiarla. */
export function TarjetaContrasena({
  seguridad,
}: {
  seguridad: SeguridadPropia
}) {
  return (
    <SeccionCuenta
      id="contrasena"
      titulo="Contraseña"
      icono={KeyRound}
      descripcion={
        seguridad.contrasenaCambiadaAt ? (
          <>
            Última actualización{" "}
            <Instante valor={seguridad.contrasenaCambiadaAt} />.
          </>
        ) : (
          "Úsala solo en AMO y cámbiala si sospechas que alguien la conoce."
        )
      }
      pie={
        <>
          <p className="text-xs text-muted-foreground">
            Mínimo 12 caracteres con mayúscula, número y símbolo.
          </p>
          <DialogoContrasena />
        </>
      }
    />
  )
}

function EstadoMfa({
  activa,
  obligatoria,
}: {
  activa: boolean
  obligatoria: boolean
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 px-2.5",
        activa
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-warning"
      )}
    >
      {activa ? <ShieldCheck aria-hidden /> : <ShieldAlert aria-hidden />}
      {activa ? "Activa" : obligatoria ? "Pendiente" : "Inactiva"}
    </Badge>
  )
}

/**
 * Verificación en dos pasos: estado, factores con su fecha de alta y último
 * uso, y las acciones que permite el rol (si la exige, no se puede quitar).
 */
export function TarjetaMfa({ seguridad }: { seguridad: SeguridadPropia }) {
  const activa = seguridad.factores.length > 0
  const obligatoria = seguridad.mfaObligatoria

  return (
    <SeccionCuenta
      id="verificacion"
      titulo="Verificación en dos pasos"
      icono={ShieldCheck}
      descripcion={
        obligatoria
          ? "Tu rol la exige: protege el acceso aunque alguien conozca tu contraseña."
          : "Un código de tu app autenticadora además de la contraseña."
      }
      acciones={<EstadoMfa activa={activa} obligatoria={obligatoria} />}
      pie={
        <>
          <p className="text-xs text-muted-foreground">
            {activa
              ? "¿Cambiaste de celular? Configura la app en el nuevo antes de borrar la anterior."
              : "Te tomará un minuto con tu celular a mano."}
          </p>
          <AccionesPie>
            <AccionesMfa activa={activa} obligatoria={obligatoria} />
          </AccionesPie>
        </>
      }
    >
      {activa ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {seguridad.factores.map((factor) => (
            <li key={factor.id} className="flex items-center gap-3 px-3.5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Smartphone className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-medium">{factor.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  Configurada el{" "}
                  <span title={formatearFechaHora(factor.creadoAt)}>
                    {formatearFecha(factor.creadoAt, "largo")}
                  </span>
                  {factor.ultimoUsoAt ? (
                    <>
                      {" · "}último uso <Instante valor={factor.ultimoUsoAt} />
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </SeccionCuenta>
  )
}
