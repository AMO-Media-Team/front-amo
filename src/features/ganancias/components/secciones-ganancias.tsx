import { CircleAlert, Hourglass, Landmark, Scale } from "lucide-react"
import Link from "next/link"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TarjetaPanel } from "@/features/dashboard/components/tarjeta-panel"
import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { AvisoEstadoFicha } from "@/features/operacion/components/ficha"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import { contarPublicaciones, lineasCondicion } from "../presentacion"
import type { AsignacionPorLiquidar, CondicionTributaria } from "../tipos"

// ── Seguridad social ─────────────────────────────────────────────────────────

/**
 * «Seguridad social pendiente»: sin la planilla al día del periodo el pago
 * queda con alerta (o, con la política BLOQUEAR, no se aprueba). Enlaza a sus
 * documentos para cargarla.
 */
export function AvisoSeguridadSocial({
  bloquea = false,
  enlaceDocumentos,
}: {
  /** Con la política BLOQUEAR: la liquidación no se aprueba sin ella. */
  bloquea?: boolean
  /** «Mis documentos» si puede editar su medio. */
  enlaceDocumentos: boolean
}) {
  return (
    <AvisoEstadoFicha
      id="aviso-seguridad-social"
      tono="aviso"
      icono={CircleAlert}
      titulo="Seguridad social pendiente"
      accion={
        enlaceDocumentos ? (
          <EnlaceBoton
            href={RUTAS_MI_MEDIO.documentos}
            variant="outline"
            size="sm"
            className="w-full sm:w-fit"
          >
            Cargar mi planilla de seguridad social
          </EnlaceBoton>
        ) : null
      }
    >
      {bloquea
        ? "Necesitamos tu planilla de seguridad social (PILA) del último periodo: sin ella no podemos aprobar ni pagar tu liquidación."
        : "Necesitamos tu planilla de seguridad social (PILA) del último periodo para respaldar tus pagos. Cárgala cuanto antes para evitar demoras."}
    </AvisoEstadoFicha>
  )
}

// ── Por liquidar ─────────────────────────────────────────────────────────────

/**
 * Publicaciones verificadas que aún no entran en una liquidación, con su
 * valor estimado antes de retenciones (MED-015 c2). Cada una abre su campaña
 * si el rol puede verla.
 */
export function PorLiquidar({
  asignaciones,
  total,
  valorTotal,
  enlazarCampanas,
}: {
  asignaciones: readonly AsignacionPorLiquidar[]
  /** Del resumen: las que hay aunque la lista se acote. */
  total: number
  valorTotal: number
  enlazarCampanas: boolean
}) {
  const restantes = Math.max(0, total - asignaciones.length)
  return (
    <TarjetaPanel
      titulo="Por liquidar"
      icono={Hourglass}
      descripcion="Publicaciones verificadas que entran en tu próxima liquidación."
      pie={
        total > 0 ? (
          <span className="cifras">
            {formatearCOP(valorTotal)} · Estimado antes de retenciones
          </span>
        ) : null
      }
    >
      {asignaciones.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          No tienes publicaciones por liquidar. Cuando el equipo AMO verifique
          una, aparecerá aquí con su valor estimado.
        </p>
      ) : (
        <ul
          aria-label="Publicaciones por liquidar"
          className="flex flex-col divide-y"
        >
          {asignaciones.map((asignacion) => (
            <li
              key={asignacion.id}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {enlazarCampanas ? (
                  <Link
                    href={rutaAsignacionMedio(asignacion.id)}
                    className="text-sm font-medium break-words underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {asignacion.oferta}
                  </Link>
                ) : (
                  <span className="text-sm font-medium break-words">
                    {asignacion.oferta}
                  </span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <MarcaPlataforma plataforma={asignacion.plataforma} />
                  {[
                    asignacion.marca,
                    asignacion.verificadaAt
                      ? `verificada el ${formatearFecha(asignacion.verificadaAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold cifras">
                {asignacion.montoMedio !== null
                  ? formatearCOP(asignacion.montoMedio)
                  : "—"}
                <span className="block text-[0.6875rem] font-normal text-muted-foreground">
                  estimado
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Y {contarPublicaciones(restantes)} más, incluidas en el total.
        </p>
      ) : null}
    </TarjetaPanel>
  )
}

// ── Condición tributaria ─────────────────────────────────────────────────────

/**
 * Lo que decide sus retenciones y si factura (`medios_privado` propio), con
 * el enlace a «Pago y condición tributaria» para corregirlo.
 */
export function CondicionTributariaMedio({
  condicion,
  enlacePago,
}: {
  condicion: CondicionTributaria | null
  /** «Mi medio › Pago» si puede editar su medio. */
  enlacePago: boolean
}) {
  return (
    <TarjetaPanel
      titulo="Tu condición tributaria"
      icono={Scale}
      descripcion="Define tus retenciones y si cargas factura o recibes documento soporte."
      enlace={
        enlacePago
          ? {
              href: RUTAS_MI_MEDIO.pago,
              texto: condicion
                ? "Revisar mis datos de pago"
                : "Registrar mis datos de pago",
            }
          : undefined
      }
    >
      {condicion ? (
        <ul className="flex flex-col gap-3">
          {lineasCondicion(condicion).map((linea) => (
            <li key={linea.clave} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                  linea.activa
                    ? "bg-primary/12 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Landmark className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{linea.titulo}</span>
                <span className="text-xs text-pretty text-muted-foreground">
                  {linea.detalle}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          Aún no registras tu condición tributaria: la necesitamos para calcular
          tus retenciones y saber si facturas o recibes documento soporte.
        </p>
      )}
    </TarjetaPanel>
  )
}
