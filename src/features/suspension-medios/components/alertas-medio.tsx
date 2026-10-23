import {
  ArrowRight,
  History,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { CORTES, ESTADOS_VALIDACION } from "@/features/operacion/estados"
import { contar, formatearHandle } from "@/features/operacion/formato"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearFechaHora, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type Comparacion,
  type MotivoAlerta,
  motivosAlerta,
  notaValidacion,
  resumirAlertas,
  textoAlertaPrevia,
  textoEsperado,
} from "../alertas"
import type { AlertaDelMedio } from "../tipos"

function tituloAlerta(alerta: AlertaDelMedio): string {
  const corte = alerta.corte
    ? alerta.corte === "PERSONALIZADO"
      ? "Corte personalizado"
      : `Corte de ${CORTES[alerta.corte].etiqueta}`
    : "Métrica"
  return alerta.numeroPublicacion !== null
    ? `${corte} · publicación ${formatearNumero(alerta.numeroPublicacion)}`
    : corte
}

/** La cifra reportada al lado de lo esperable para la cuenta (ADM-008 c1). */
function TablaComparaciones({
  motivo,
  comparaciones,
}: {
  motivo: string
  comparaciones: readonly Comparacion[]
}) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Cifras de «{motivo}»</caption>
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="py-1 pr-3 font-medium">
            Cifra
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Reportado
          </th>
          <th scope="col" className="py-1 font-medium">
            Esperado
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {comparaciones.map((comparacion) => (
          <tr key={comparacion.cifra} className="align-top">
            <th scope="row" className="py-1.5 pr-3 font-normal">
              {comparacion.cifra}
            </th>
            <td
              className={cn(
                "py-1.5 pr-3 font-medium cifras",
                comparacion.fuera && "text-destructive"
              )}
            >
              <span className="inline-flex items-center gap-1">
                {comparacion.fuera ? (
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                ) : null}
                {formatearNumero(comparacion.reportado)}
              </span>
              {comparacion.fuera ? (
                <span className="sr-only"> (fuera de lo esperado)</span>
              ) : null}
            </td>
            <td className="py-1.5">
              <span className="flex flex-col">
                <span className="cifras">{textoEsperado(comparacion)}</span>
                <span className="text-muted-foreground">
                  {comparacion.referencia}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Motivo({ motivo }: { motivo: MotivoAlerta }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2.5">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold">
        <ShieldAlert aria-hidden className="size-3.5 shrink-0 text-warning" />
        {motivo.titulo}
      </h4>
      <p className="text-xs text-pretty">{motivo.explicacion}</p>
      {motivo.comparaciones.length > 0 ? (
        <TablaComparaciones
          motivo={motivo.titulo}
          comparaciones={motivo.comparaciones}
        />
      ) : null}
    </div>
  )
}

function Alerta({ alerta }: { alerta: AlertaDelMedio }) {
  const idTitulo = `alerta-${alerta.metricaId}`
  const motivos = motivosAlerta(alerta)
  const previa = textoAlertaPrevia(alerta.detalle.previa, alerta.plataforma)
  const nota = notaValidacion(alerta)
  const oferta = alerta.oferta ?? "Oferta sin título"
  const contexto = [
    oferta,
    alerta.anunciante,
    alerta.fechaCorte
      ? `corte del ${formatearFechaHora(alerta.fechaCorte)}`
      : null,
  ].filter(Boolean)

  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        className="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3
              id={idTitulo}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold"
            >
              {alerta.plataforma ? (
                <MarcaPlataforma plataforma={alerta.plataforma} />
              ) : null}
              {tituloAlerta(alerta)}
              {alerta.handle ? (
                <span className="font-normal text-muted-foreground">
                  {formatearHandle(alerta.handle)}
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-pretty text-muted-foreground">
              {contexto.join(" · ")}
            </p>
          </div>
          <InsigniaEstado
            catalogo={ESTADOS_VALIDACION}
            estado={alerta.estado}
          />
        </header>

        <div className="flex flex-col gap-2">
          {motivos.map((motivo) => (
            <Motivo key={motivo.clave} motivo={motivo} />
          ))}
        </div>

        {previa ? (
          <p className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
            <History aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {previa}
          </p>
        ) : null}

        <p className="text-xs text-pretty break-words">
          <span className="font-medium">{nota.etiqueta}:</span> {nota.texto}
        </p>

        <EnlaceBoton
          variant="outline"
          size="sm"
          className="w-fit"
          href={rutaAsignacion(alerta.asignacionId)}
        >
          Ver la asignación
          <span className="sr-only">{` de «${oferta}»`}</span>
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      </article>
    </li>
  )
}

/**
 * Pestaña «Alertas» de la ficha del medio (INT-003, INT-004, ADM-002): sus
 * métricas que se salieron de lo esperable para su cuenta, las que esperan
 * validación primero, con el porqué y las cifras lado a lado, lo que anotó
 * quien las validó y el enlace a la asignación.
 */
export function AlertasMedio({
  alertas,
  total,
}: {
  alertas: readonly AlertaDelMedio[]
  /** Cuántas tuvo en total (se detallan las primeras). */
  total: number
}) {
  if (total === 0) {
    return (
      <EstadoVacio
        icono={ShieldCheck}
        titulo="Sin alertas"
        descripcion="Ninguna de sus métricas se ha salido de lo esperable para su cuenta."
      />
    )
  }
  const resumen = resumirAlertas(alertas)
  const conAlerta = contar(total, "métrica con alerta", "métricas con alerta")
  return (
    <TarjetaFicha
      titulo="Métricas con alerta"
      icono={ShieldAlert}
      descripcion={`${
        total > alertas.length
          ? `Se muestran ${formatearNumero(alertas.length)} de ${conAlerta}, primero las que esperan validación.`
          : `${conAlerta}: ${[
              contar(resumen.porValidar, "por validar", "por validar"),
              contar(resumen.aprobadas, "aprobada", "aprobadas"),
              contar(resumen.rechazadas, "rechazada", "rechazadas"),
            ].join(", ")}.`
      } Solo las ve el equipo AMO.`}
    >
      <ul aria-label="Métricas con alerta" className="flex flex-col gap-3">
        {alertas.map((alerta) => (
          <Alerta key={alerta.metricaId} alerta={alerta} />
        ))}
      </ul>
    </TarjetaFicha>
  )
}
