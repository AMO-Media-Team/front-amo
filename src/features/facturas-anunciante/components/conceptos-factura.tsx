import { ChevronRight, ListChecks } from "lucide-react"

import { rutaMiCampana } from "@/features/campanas/rutas"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  EnlaceFicha,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { PLATAFORMAS } from "@/features/operacion/estados"
import { ESTADOS_PARA_ANUNCIANTE } from "@/features/seguimiento/estados"
import { rutaSeguimiento } from "@/features/seguimiento/rutas"
import { formatearCOP, formatearFecha, formatearNumero } from "@/lib/format"

import type {
  ConceptoFactura,
  EstadoAsignacion,
  GrupoConceptos,
} from "../tipos"

/** Estados en que una asignación facturada ya no está cumplida (D88). */
const REQUIEREN_ATENCION: readonly EstadoAsignacion[] = [
  "EN_DISPUTA",
  "CANCELADA",
]

function contarPublicaciones(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "publicación" : "publicaciones"}`
}

function Concepto({
  concepto,
  verSeguimiento,
  pagada,
}: {
  concepto: ConceptoFactura
  verSeguimiento: boolean
  pagada: boolean
}) {
  const detalle = [concepto.formato, concepto.oferta]
    .filter(Boolean)
    .join(" · ")
  const atencion = REQUIEREN_ATENCION.includes(concepto.estado)
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* La plataforma ya se dice en la línea de detalle. */}
          <span aria-hidden className="inline-flex">
            <MarcaPlataforma plataforma={concepto.plataforma} />
          </span>
          <EnlaceFicha
            href={rutaSeguimiento(concepto.campanaId, concepto.id)}
            permitido={verSeguimiento}
            className="min-w-0 font-medium break-words"
          >
            {concepto.medio ?? "Medio"}
          </EnlaceFicha>
          {atencion ? (
            <InsigniaEstado
              catalogo={ESTADOS_PARA_ANUNCIANTE}
              estado={concepto.estado}
              className="h-5 px-2 text-[0.6875rem]"
            />
          ) : null}
        </p>
        <p className="text-xs text-pretty break-words text-muted-foreground">
          {PLATAFORMAS[concepto.plataforma]}
          {detalle ? ` · ${detalle}` : ""}
        </p>
        {concepto.verificadaAt ? (
          <p className="text-xs text-muted-foreground">
            Verificada el{" "}
            <time dateTime={concepto.verificadaAt}>
              {formatearFecha(concepto.verificadaAt)}
            </time>
          </p>
        ) : null}
        {concepto.estado === "CANCELADA" ? (
          <p className="text-xs text-pretty text-destructive">
            {pagada
              ? "AMO la canceló con la factura ya pagada: por ahora la devolución o el saldo a favor se gestionan fuera de la plataforma."
              : "AMO la canceló después de facturarla: la corrige con una nota crédito."}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-sm font-medium cifras sm:text-right">
        {formatearCOP(concepto.valor)}
      </span>
    </li>
  )
}

/**
 * Lo que la factura cobra: cada publicación verificada (medio, plataforma,
 * formato, oferta y valor), agrupada por campaña con su total. El primer
 * grupo llega abierto; los demás se despliegan (`<details>`, sin JavaScript).
 */
export function ConceptosFactura({
  grupos,
  mandato,
  anulada,
  pagada = false,
  verSeguimiento,
  verCampanas,
}: {
  grupos: readonly GrupoConceptos[]
  /** En mandato la factura reparte cada valor entre comisión y terceros. */
  mandato: boolean
  anulada: boolean
  /**
   * Pagada: ya no admite notas crédito, así que una publicación cancelada se
   * devuelve o queda como saldo a favor por fuera de la plataforma.
   */
  pagada?: boolean
  /** `asignaciones.ver_propias`: el medio enlaza a su tarjeta en el seguimiento. */
  verSeguimiento: boolean
  /** `campanas.gestionar_propias`: el nombre de la campaña enlaza a su ficha. */
  verCampanas: boolean
}) {
  const publicaciones = grupos.reduce(
    (total, grupo) => total + grupo.conceptos.length,
    0
  )
  const valor = grupos.reduce((total, grupo) => total + grupo.total, 0)

  return (
    <TarjetaFicha
      titulo="Conceptos"
      icono={ListChecks}
      descripcion={
        publicaciones > 0
          ? `${contarPublicaciones(publicaciones)}${
              grupos.length > 1
                ? ` de ${formatearNumero(grupos.length)} campañas`
                : ""
            } · ${formatearCOP(valor)} de pauta`
          : undefined
      }
    >
      {publicaciones === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {anulada
            ? "Al anularse la factura, su pauta quedó libre para facturarse de nuevo."
            : "Esta factura no tiene conceptos vigentes."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((grupo, indice) => (
            <details
              key={grupo.campanaId}
              open={indice === 0}
              className="group overflow-hidden rounded-lg border"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/30 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:anillo-foco [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  />
                  <span className="min-w-0 font-medium break-words">
                    {grupo.campana ?? "Campaña archivada"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold cifras">
                    {formatearCOP(grupo.total)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {contarPublicaciones(grupo.conceptos.length)}
                  </span>
                </span>
              </summary>
              {verCampanas && grupo.campana ? (
                <p className="border-t px-4 py-2 text-xs">
                  <EnlaceFicha
                    href={rutaMiCampana(grupo.campanaId)}
                    permitido
                    className="text-primary"
                  >
                    Ver la campaña
                  </EnlaceFicha>
                </p>
              ) : null}
              <ul
                aria-label={`Conceptos de ${grupo.campana ?? "la campaña archivada"}`}
                className="flex flex-col divide-y border-t"
              >
                {grupo.conceptos.map((concepto) => (
                  <Concepto
                    key={concepto.id}
                    concepto={concepto}
                    verSeguimiento={verSeguimiento}
                    pagada={pagada}
                  />
                ))}
              </ul>
            </details>
          ))}
          {mandato ? (
            <p className="text-xs text-pretty text-muted-foreground">
              Cada valor es lo que pagas por la publicación; en mandato, la
              factura lo reparte entre la comisión de AMO (con IVA) y el ingreso
              recibido para los medios.
            </p>
          ) : null}
        </div>
      )}
    </TarjetaFicha>
  )
}
