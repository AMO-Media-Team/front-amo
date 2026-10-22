import { History, MailPlus } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { SolicitudParaInvitar } from "../invitacion"
import { resumenPendientes } from "../presentacion"
import { colaSolicitudes, LIMITE_PENDIENTES } from "../queries"
import type { SolicitudVinculacion } from "../tipos"
import { AccionesSolicitud } from "./acciones-solicitud"
import { BotonCopiarEnlace } from "./boton-copiar-enlace"
import { ProveedorColaSolicitudes } from "./proveedor-cola"
import { FilaAtendida, TarjetaSolicitud } from "./tarjeta-solicitud"

const ID_RESUMEN = "cola-solicitudes-resumen"

/** Solo lo que la hoja «Invitar» necesita viaja al navegador. */
function paraInvitar(solicitud: SolicitudVinculacion): SolicitudParaInvitar {
  return {
    id: solicitud.id,
    nombreMedio: solicitud.nombreMedio,
    tipo: solicitud.tipo,
    municipioCodigo: solicitud.municipioCodigo,
    ubicacion: solicitud.ubicacion,
    contactoNombre: solicitud.contactoNombre,
    email: solicitud.email,
    celular: solicitud.celular,
    coincidencias: solicitud.coincidencias,
  }
}

function Atendidas({
  solicitudes,
  verMedios,
}: {
  solicitudes: readonly SolicitudVinculacion[]
  verMedios: boolean
}) {
  if (solicitudes.length === 0) return null
  return (
    <details className="group rounded-xl border bg-muted/20">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium outline-none select-none hover:bg-muted/40 focus-visible:anillo-foco [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <History aria-hidden className="size-4 text-muted-foreground" />
          Atendidas recientemente
          <span className="cifras text-muted-foreground">
            ({formatearNumero(solicitudes.length)})
          </span>
        </span>
        <span
          aria-hidden
          className="text-xs text-muted-foreground group-open:hidden"
        >
          Ver
        </span>
        <span
          aria-hidden
          className="hidden text-xs text-muted-foreground group-open:inline"
        >
          Ocultar
        </span>
      </summary>
      <ul className="flex flex-col gap-2 px-3 pb-3">
        {solicitudes.map((solicitud) => (
          <FilaAtendida
            key={solicitud.id}
            solicitud={solicitud}
            verMedios={verMedios}
          />
        ))}
      </ul>
    </details>
  )
}

/**
 * Cola de solicitudes de vinculación (MED-001): las pendientes, la más
 * antigua primero, con «Invitar» y «Descartar»; debajo, las atendidas
 * recientes. La monta `/operacion/verificacion?cola=solicitudes`. Vuelve a
 * exigir `medios.verificar` (la RLS de la tabla pide lo mismo).
 */
export async function ColaSolicitudes() {
  const usuario = await requerirPermiso("medios.verificar")
  const cola = await colaSolicitudes(usuario)
  const verMedios = tieneAlgunPermiso(usuario, ["medios.ver"])
  const recortada = cola.totalPendientes > cola.pendientes.length
  const vacia = cola.pendientes.length === 0

  return (
    <ProveedorColaSolicitudes
      idResumen={ID_RESUMEN}
      datos={{
        capacidades: cola.capacidades,
        roles: cola.roles,
        smtpConfigurado: cola.smtpConfigurado,
      }}
    >
      <div className="flex flex-col gap-4">
        {/* Sin pendientes, el resumen solo lo oye el lector de pantalla (el
            estado vacío ya lo dice) y sigue recibiendo el foco tras atender
            la última. */}
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
            vacia && "sr-only"
          )}
        >
          <p
            id={ID_RESUMEN}
            tabIndex={-1}
            className="rounded-sm text-sm text-muted-foreground outline-none focus-visible:anillo-foco"
          >
            <span className="font-medium text-foreground">
              {resumenPendientes(cola.totalPendientes)}
            </span>
            {cola.totalPendientes > 1 ? " · la más antigua primero" : null}
          </p>
          {vacia ? null : <BotonCopiarEnlace url={cola.urlFormulario} />}
        </div>

        {vacia ? (
          <EstadoVacio
            icono={MailPlus}
            titulo="No hay solicitudes de vinculación pendientes."
            descripcion="Cuando un medio pida unirse desde el formulario público, su solicitud aparecerá aquí. Comparte el enlace con los medios que quieras sumar."
          >
            <BotonCopiarEnlace url={cola.urlFormulario} variante="default" />
          </EstadoVacio>
        ) : (
          <ol
            aria-label="Solicitudes por atender"
            className="flex flex-col gap-3"
          >
            {cola.pendientes.map((solicitud) => (
              <li key={solicitud.id}>
                <TarjetaSolicitud
                  solicitud={solicitud}
                  umbral={cola.umbralSeguidores}
                  verMedios={verMedios}
                  acciones={
                    <AccionesSolicitud solicitud={paraInvitar(solicitud)} />
                  }
                />
              </li>
            ))}
          </ol>
        )}

        {recortada ? (
          <p className="text-center text-xs text-muted-foreground">
            Mostramos las {formatearNumero(LIMITE_PENDIENTES)} más antiguas de{" "}
            {formatearNumero(cola.totalPendientes)}. Al atenderlas aparecerán
            las siguientes.
          </p>
        ) : null}

        <Atendidas solicitudes={cola.atendidas} verMedios={verMedios} />
      </div>
    </ProveedorColaSolicitudes>
  )
}

/** Respaldo de `<Suspense>` mientras llega la cola. */
export function EsqueletoColaSolicitudes() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando las solicitudes…</span>
      <Esqueleto className="h-5 w-48 rounded-md" />
      {[0, 1].map((indice) => (
        <Esqueleto key={indice} className="h-72 rounded-xl sm:h-60" />
      ))}
    </div>
  )
}
