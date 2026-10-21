import { ChevronDown, ExternalLink, History, UsersRound } from "lucide-react"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import {
  formatearCompacto,
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { ESTADOS_VALIDACION, VIGENCIAS_VERIFICACION } from "../estados"
import { formatearHandle, formatearMultiplicador } from "../formato"
import type { CuentaSocialDetalle, VerificacionCuenta } from "../tipos"
import {
  IndicadorVerificada,
  InsigniaEstado,
  MarcaPlataforma,
} from "./distintivos"
import { FechaRelativa } from "./ficha"

function Dato({
  etiqueta,
  children,
  ayuda,
}: {
  etiqueta: string
  children: ReactNode
  ayuda?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm font-medium break-words">
        {children}
        {ayuda ? (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {ayuda}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

/** El multiplicador de calidad premia (> 1) o castiga (< 1) el precio de la cuenta. */
function Multiplicador({ cuenta }: { cuenta: CuentaSocialDetalle }) {
  const tono =
    cuenta.multiplicador > 1
      ? "text-success"
      : cuenta.multiplicador < 1
        ? "text-warning"
        : undefined
  return (
    <Dato
      etiqueta="Multiplicador de calidad"
      ayuda={
        cuenta.multiplicadorProximo !== null &&
        cuenta.multiplicadorProximoDesde ? (
          <>
            Pasará a {formatearMultiplicador(cuenta.multiplicadorProximo)} el{" "}
            {formatearFecha(cuenta.multiplicadorProximoDesde)}
          </>
        ) : cuenta.multiplicadorCalculadoAt ? (
          <>Calculado el {formatearFecha(cuenta.multiplicadorCalculadoAt)}</>
        ) : (
          "Neutro hasta tener publicaciones verificadas"
        )
      }
    >
      <span className={cn("cifras", tono)}>
        {formatearMultiplicador(cuenta.multiplicador)}
      </span>
    </Dato>
  )
}

function Verificacion({ cuenta }: { cuenta: CuentaSocialDetalle }) {
  if (!cuenta.ultimaVerificacionAt) {
    return (
      <Dato
        etiqueta="Última verificación"
        ayuda="Necesaria para aceptar ofertas"
      >
        <span className="text-muted-foreground">Pendiente</span>
      </Dato>
    )
  }
  return (
    <Dato
      etiqueta="Última verificación"
      ayuda={
        <>
          {cuenta.metodo ?? "Verificada"}
          {cuenta.venceAt ? (
            <>
              {" · "}
              {cuenta.vigencia === "en_gracia" || cuenta.vigencia === "vencida"
                ? "venció"
                : "vence"}{" "}
              el {formatearFecha(cuenta.venceAt)}
            </>
          ) : null}
          {cuenta.vigencia === "en_gracia" && cuenta.elegibleHasta
            ? ` · elegible hasta el ${formatearFecha(cuenta.elegibleHasta)}`
            : ""}
        </>
      }
    >
      <time
        dateTime={cuenta.ultimaVerificacionAt}
        title={formatearFechaHora(cuenta.ultimaVerificacionAt)}
        className="cifras"
      >
        {formatearFecha(cuenta.ultimaVerificacionAt)}
      </time>
    </Dato>
  )
}

function HistorialVerificaciones({
  verificaciones,
}: {
  verificaciones: readonly VerificacionCuenta[]
}) {
  if (verificaciones.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History aria-hidden className="size-3.5" />
        Sin solicitudes de verificación registradas.
      </p>
    )
  }
  return (
    <details className="group/historial">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:anillo-foco [&::-webkit-details-marker]:hidden">
        <History aria-hidden className="size-3.5" />
        Historial de verificaciones ({formatearNumero(verificaciones.length)})
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open/historial:rotate-180"
        />
      </summary>
      <ol className="mt-3 flex flex-col divide-y rounded-lg border bg-background/40">
        {verificaciones.map((verificacion) => (
          <li
            key={verificacion.id}
            className="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <time
                dateTime={verificacion.creadaAt}
                title={formatearFechaHora(verificacion.creadaAt)}
                className="cifras text-muted-foreground"
              >
                {formatearFecha(verificacion.creadaAt)}
              </time>
              <span className="font-medium">{verificacion.metodo}</span>
              <InsigniaEstado
                catalogo={ESTADOS_VALIDACION}
                estado={verificacion.estado}
                className="h-5 px-2 text-[0.6875rem]"
              />
            </span>
            <span className="cifras text-muted-foreground">
              {formatearNumero(verificacion.seguidoresReportados)} reportados
              {verificacion.seguidoresVerificados !== null
                ? ` → ${formatearNumero(verificacion.seguidoresVerificados)} verificados`
                : ""}
            </span>
            {verificacion.observaciones ? (
              <span className="text-pretty text-muted-foreground sm:basis-full">
                {verificacion.observaciones}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  )
}

function TarjetaCuenta({
  cuenta,
  indice,
}: {
  cuenta: CuentaSocialDetalle
  indice: number
}) {
  const vigencia = VIGENCIAS_VERIFICACION[cuenta.vigencia]
  return (
    <article
      style={{ animationDelay: `${indice * 60}ms` }}
      className="flex animate-aparecer-arriba flex-col gap-4 rounded-xl border bg-card p-4 motion-reduce:animate-none sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MarcaPlataforma
            plataforma={cuenta.plataforma}
            className="[&>span:first-child]:size-9 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
          />
          <div className="flex min-w-0 flex-col">
            <a
              href={cuenta.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-w-0 items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              <span className="truncate">{formatearHandle(cuenta.handle)}</span>
              <ExternalLink
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">
                {" "}
                (abre el perfil en una pestaña nueva)
              </span>
            </a>
            <IndicadorVerificada verificada={cuenta.verificada} />
          </div>
        </div>
        <InsigniaEstado
          catalogo={VIGENCIAS_VERIFICACION}
          estado={cuenta.vigencia}
          className={cn(
            vigencia.tono === "neutro" && "border border-dashed bg-transparent"
          )}
        />
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
        <Dato
          etiqueta="Seguidores verificados"
          ayuda={
            cuenta.franja
              ? `Franja ${cuenta.franja.clave} · ${cuenta.franja.nombre}`
              : cuenta.seguidores !== null
                ? "Por debajo de la primera franja"
                : null
          }
        >
          <span className="font-heading text-lg cifras">
            {cuenta.seguidores === null
              ? "—"
              : formatearNumero(cuenta.seguidores)}
          </span>
        </Dato>
        <Multiplicador cuenta={cuenta} />
        <Dato
          etiqueta="Alcance mediano"
          ayuda={
            cuenta.indiceCalidad !== null
              ? `${formatearPorcentaje(cuenta.indiceCalidad, 1)} de sus seguidores`
              : "Sin publicaciones verificadas"
          }
        >
          <span className="cifras">
            {formatearCompacto(cuenta.alcanceMediano)}
          </span>
        </Dato>
        <Dato etiqueta="Publicaciones verificadas">
          <span className="cifras">
            {formatearNumero(cuenta.publicacionesVerificadas)}
          </span>
        </Dato>
        <Dato
          etiqueta="Tarifa de referencia"
          ayuda={
            cuenta.tarifaReferencia === null
              ? "El medio no la ha declarado"
              : "Declarada por el medio (informativa)"
          }
        >
          <span className="cifras">
            {cuenta.tarifaReferencia === null
              ? "—"
              : formatearCOP(cuenta.tarifaReferencia)}
          </span>
        </Dato>
        <Verificacion cuenta={cuenta} />
      </dl>

      {cuenta.verificaciones ? (
        <footer className="mt-auto border-t pt-3">
          <HistorialVerificaciones verificaciones={cuenta.verificaciones} />
        </footer>
      ) : null}
    </article>
  )
}

/**
 * Cuentas sociales del medio: seguidores verificados y franja, vigencia de la
 * verificación, multiplicador de calidad (con el próximo, si ya está
 * programado) e historial de verificaciones para quien puede verificar.
 */
export function CuentasSociales({
  cuentas,
}: {
  cuentas: readonly CuentaSocialDetalle[]
}) {
  if (cuentas.length === 0) {
    return (
      <EstadoVacio
        icono={UsersRound}
        titulo="Sin cuentas sociales registradas"
        descripcion="El medio debe registrar al menos una cuenta de Instagram, Facebook o TikTok y verificarla para recibir ofertas."
      />
    )
  }
  // Alcance, índice y multiplicador los recalcula el cron nocturno.
  const ultimaActualizacion = cuentas
    .map((cuenta) => cuenta.multiplicadorCalculadoAt)
    .filter((fecha): fecha is string => fecha !== null)
    .sort()
    .at(-1)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 xl:grid-cols-2">
        {cuentas.map((cuenta, indice) => (
          <TarjetaCuenta key={cuenta.id} cuenta={cuenta} indice={indice} />
        ))}
      </div>
      {ultimaActualizacion ? (
        <p className="text-xs text-muted-foreground">
          Alcance y multiplicadores recalculados:{" "}
          <FechaRelativa valor={ultimaActualizacion} estilo="medio" />
        </p>
      ) : null}
    </div>
  )
}
