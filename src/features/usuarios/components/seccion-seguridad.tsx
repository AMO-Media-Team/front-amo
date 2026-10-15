import {
  KeyRound,
  Monitor,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Tablet,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Badge } from "@/components/ui/badge"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"

import { estadoMfa } from "../presentacion"
import { sesionesUsuario, ultimoAcceso } from "../queries"
import type {
  SeguridadUsuario,
  SesionUsuario,
  UltimoAcceso,
  UsuarioDetalle,
} from "../tipos"
import { IndicadorMfa } from "./distintivos"
import type { UsuarioAcciones } from "./dialogos-accion-usuario"
import { BotonAccionUsuario } from "./menu-acciones-usuario"
import { ListaDatos, SinDato, TarjetaFicha } from "./tarjeta-ficha"

const nombresPais = new Intl.DisplayNames(["es"], { type: "region" })

function ubicacion(acceso: UltimoAcceso): string {
  const pais = acceso.paisIso2
    ? (nombresPais.of(acceso.paisIso2) ?? acceso.paisIso2)
    : null
  return (
    [acceso.ciudad, pais].filter(Boolean).join(", ") || "Ubicación desconocida"
  )
}

function Instante({ valor, vacio }: { valor: string | null; vacio: string }) {
  if (!valor) return <SinDato>{vacio}</SinDato>
  return (
    <time dateTime={valor} title={formatearFechaHora(valor)}>
      {formatearRelativo(valor)}
    </time>
  )
}

function IconoDispositivo({ dispositivo }: { dispositivo: string | null }) {
  const clase = "size-4"
  switch (dispositivo) {
    case "ESCRITORIO":
      return <Monitor className={clase} aria-hidden />
    case "MOVIL":
      return <Smartphone className={clase} aria-hidden />
    case "TABLETA":
      return <Tablet className={clase} aria-hidden />
    default:
      return <MonitorSmartphone className={clase} aria-hidden />
  }
}

function FilaSesion({ sesion }: { sesion: SesionUsuario }) {
  const agente = [sesion.navegador, sesion.sistemaOperativo]
    .filter(Boolean)
    .join(" en ")

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <IconoDispositivo dispositivo={sesion.dispositivo} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {agente || "Navegador desconocido"}
          <Badge
            variant={sesion.aal === "aal2" ? "secondary" : "outline"}
            className="font-normal"
          >
            {sesion.aal === "aal2" ? "Con verificación" : "Solo contraseña"}
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          {sesion.ultimaActividadAt ? (
            <>Actividad {formatearRelativo(sesion.ultimaActividadAt)} · </>
          ) : null}
          Iniciada el {formatearFechaHora(sesion.creadaAt)}
          {sesion.ip ? (
            <>
              {" "}
              · IP <span className="font-mono">{sesion.ip}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  )
}

/**
 * Pestaña Seguridad: verificación en dos pasos, acceso y sesiones abiertas,
 * con accesos directos a las acciones permitidas.
 */
export async function SeccionSeguridad({
  usuario,
  seguridad,
  acciones,
  exigeMfa,
  puedeVerAccesos,
}: {
  usuario: UsuarioDetalle
  seguridad: SeguridadUsuario
  acciones: UsuarioAcciones
  exigeMfa: boolean
  /** `accesos.ver`: ubicación del último ingreso (RLS lo exige igualmente). */
  puedeVerAccesos: boolean
}) {
  const [sesiones, acceso] = await Promise.all([
    sesionesUsuario(usuario.id),
    puedeVerAccesos ? ultimoAcceso(usuario.id) : Promise.resolve(null),
  ])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TarjetaFicha
        titulo="Verificación en dos pasos"
        descripcion="App autenticadora (TOTP) además de la contraseña."
        icono={ShieldCheck}
        acciones={
          <BotonAccionUsuario usuario={acciones} accion="restablecer_mfa">
            Restablecer
          </BotonAccionUsuario>
        }
      >
        <ListaDatos
          datos={[
            {
              etiqueta: "Estado",
              valor: (
                <IndicadorMfa
                  estado={estadoMfa(
                    usuario.mfaActivo,
                    exigeMfa,
                    usuario.estado
                  )}
                />
              ),
              ayuda:
                !usuario.mfaActivo && exigeMfa
                  ? "Su rol la exige: deberá configurarla al ingresar."
                  : undefined,
            },
            {
              etiqueta: "Configurada",
              valor: seguridad.mfaActivadoAt ? (
                formatearFecha(seguridad.mfaActivadoAt, "largo")
              ) : (
                <SinDato />
              ),
            },
            {
              etiqueta: "Último uso",
              valor: (
                <Instante
                  valor={seguridad.mfaUltimoUsoAt}
                  vacio="Sin usos registrados"
                />
              ),
            },
          ]}
        />
      </TarjetaFicha>

      <TarjetaFicha
        titulo="Acceso"
        descripcion="Correo, ingresos y contraseña."
        icono={KeyRound}
        acciones={
          <>
            <BotonAccionUsuario usuario={acciones} accion="enlace_recuperacion">
              Enlace de recuperación
            </BotonAccionUsuario>
            <BotonAccionUsuario usuario={acciones} accion="forzar_cambio">
              Exigir cambio
            </BotonAccionUsuario>
          </>
        }
      >
        <ListaDatos
          datos={[
            {
              etiqueta: "Correo confirmado",
              valor: seguridad.emailConfirmadoAt ? (
                formatearFecha(seguridad.emailConfirmadoAt, "largo")
              ) : (
                <SinDato>Pendiente</SinDato>
              ),
            },
            {
              etiqueta: "Último ingreso",
              valor: (
                <Instante valor={seguridad.ultimoIngresoAt} vacio="Nunca" />
              ),
            },
            {
              etiqueta: "Ubicación del último ingreso",
              valor: puedeVerAccesos ? (
                acceso ? (
                  ubicacion(acceso)
                ) : (
                  <SinDato>Sin registros</SinDato>
                )
              ) : (
                <SinDato>Requiere permiso de accesos</SinDato>
              ),
            },
            {
              etiqueta: "Contraseña",
              valor: usuario.debeCambiarPassword
                ? "Cambio pendiente"
                : "Vigente",
              ayuda: seguridad.bloqueadoHasta
                ? `Bloqueada en Auth hasta el ${formatearFecha(seguridad.bloqueadoHasta, "largo")}`
                : undefined,
            },
          ]}
        />
      </TarjetaFicha>

      <TarjetaFicha
        titulo="Sesiones abiertas"
        descripcion={
          sesiones.length === 1
            ? "1 dispositivo con sesión iniciada."
            : `${sesiones.length} dispositivos con sesión iniciada.`
        }
        icono={MonitorSmartphone}
        className="lg:col-span-2"
        acciones={
          sesiones.length > 0 ? (
            <BotonAccionUsuario usuario={acciones} accion="cerrar_sesiones">
              Cerrar todas
            </BotonAccionUsuario>
          ) : null
        }
      >
        {sesiones.length > 0 ? (
          <ul className="divide-y">
            {sesiones.map((sesion) => (
              <FilaSesion key={sesion.id} sesion={sesion} />
            ))}
          </ul>
        ) : (
          <EstadoVacio
            variante="simple"
            icono={MonitorSmartphone}
            titulo="Sin sesiones abiertas"
            descripcion="Cuando ingrese, sus dispositivos aparecerán aquí."
            className="py-6"
          />
        )}
      </TarjetaFicha>
    </div>
  )
}
