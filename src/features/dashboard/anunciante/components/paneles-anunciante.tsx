import { CircleCheck, Heart, MapPinned, Radar, ReceiptText } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { MiniMapaColombia } from "@/components/maps/mini-mapa-colombia"
import {
  formatearCompacto,
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  MAPA_EN_REJILLA,
  REJILLA_MAPA_RANKING,
} from "../../components/esqueletos-panel"
import { TarjetaPanel } from "../../components/tarjeta-panel"
import {
  type FilaDesempeno,
  MINIMO_COMPARABLES,
  type RankingMedios,
  type ResumenCartera,
} from "../datos"

const VISIBLES = 5

/** Dónde están los medios que publicaron la pauta (municipio del medio). */
export function CoberturaAnunciante({
  departamentos,
  municipios,
  className,
}: {
  departamentos: Readonly<Record<string, number | null>>
  municipios: readonly FilaDesempeno[]
  className?: string
}) {
  const top = [...municipios].sort((a, b) => b.gmv - a.gmv).slice(0, VISIBLES)
  const maximo = Math.max(1, ...top.map((fila) => fila.gmv))
  const totalDepartamentos = Object.keys(departamentos).length
  return (
    <TarjetaPanel
      titulo="Cobertura territorial"
      descripcion="Inversión verificada según el municipio de cada medio."
      icono={MapPinned}
      className={className}
      pie={
        totalDepartamentos > 0
          ? `Tu pauta llegó a ${formatearNumero(municipios.length)} ${municipios.length === 1 ? "municipio" : "municipios"} de ${formatearNumero(totalDepartamentos)} ${totalDepartamentos === 1 ? "departamento" : "departamentos"}.`
          : null
      }
    >
      {top.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={MapPinned}
          titulo="Aún sin cobertura en el periodo"
          descripcion="Verás aquí los municipios donde se publicó tu pauta verificada."
          className="h-full py-6"
        />
      ) : (
        <div className={REJILLA_MAPA_RANKING}>
          <MiniMapaColombia
            valores={departamentos}
            metrica="gmv"
            etiqueta="Inversión verificada por departamento"
            className={MAPA_EN_REJILLA}
          />
          <ol
            className="flex min-w-0 flex-col gap-2.5"
            aria-label="Municipios con más inversión"
          >
            {top.map((fila, indice) => (
              <li key={fila.clave} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold cifras text-muted-foreground"
                >
                  {indice + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.8125rem] font-medium">
                      {fila.nombre}
                    </span>
                    <span className="shrink-0 text-[0.8125rem] font-semibold cifras">
                      {formatearCOPCompacto(fila.gmv)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/80"
                        style={{ width: `${(fila.gmv / maximo) * 100}%` }}
                      />
                    </span>
                    <span className="shrink-0 text-[0.6875rem] cifras text-muted-foreground">
                      {formatearCompacto(fila.alcance)} personas
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </TarjetaPanel>
  )
}

/**
 * Medios con mejor engagement (solo con muestra suficiente) o, si ninguno la
 * reúne todavía, con más alcance: un ranking de tasas con pocos negocios
 * engaña (docs/kpis.md §0.4).
 */
export function MediosDestacados({
  ranking,
  nMinimo,
  className,
}: {
  ranking: RankingMedios
  nMinimo: number
  className?: string
}) {
  const porEngagement = ranking.criterio === "engagement"
  // Sin medios no hay criterio que explicar: el estado vacío dice qué falta.
  const sinMedios = ranking.filas.length === 0
  return (
    <TarjetaPanel
      titulo={
        sinMedios
          ? "Medios destacados"
          : porEngagement
            ? "Medios con mejor engagement"
            : "Medios con más alcance"
      }
      descripcion={
        sinMedios
          ? "Los medios que mejor respondieron a tu pauta."
          : porEngagement
            ? "Interacciones por persona alcanzada, entre medios con muestra suficiente."
            : `Ordenados por alcance: para comparar su engagement hacen falta ${formatearNumero(MINIMO_COMPARABLES)} medios con al menos ${formatearNumero(nMinimo)} negocios medidos.`
      }
      icono={porEngagement ? Heart : Radar}
      className={className}
    >
      {sinMedios ? (
        <EstadoVacio
          variante="simple"
          icono={Radar}
          titulo="Sin medios con métricas en el periodo"
          descripcion="Los medios aparecerán aquí cuando se validen las métricas de sus publicaciones."
          className="h-full py-6"
        />
      ) : (
        <>
          <ListaMediosMovil ranking={ranking} />
          <TablaMedios ranking={ranking} />
        </>
      )}
    </TarjetaPanel>
  )
}

/**
 * Celda angosta (menos de 42 rem): una fila por medio con el valor del
 * criterio a la vista. En la tabla (34 rem de ancho mínimo) quedaba detrás
 * del desplazamiento horizontal.
 */
function ListaMediosMovil({ ranking }: { ranking: RankingMedios }) {
  const porEngagement = ranking.criterio === "engagement"
  return (
    <ol
      className="flex flex-col divide-y @2xl/bloque:hidden"
      aria-label={
        porEngagement ? "Medios por engagement" : "Medios por alcance"
      }
    >
      {ranking.filas.map((fila, indice) => (
        <li
          key={fila.clave}
          className="flex items-start gap-3 py-2.5 first:pt-0"
        >
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold cifras text-muted-foreground"
          >
            {indice + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.8125rem] font-medium">
                {fila.nombre}
              </span>
              <span className="shrink-0 text-[0.8125rem] font-semibold cifras text-primary">
                {porEngagement
                  ? formatearPorcentaje(fila.engagement, 1)
                  : formatearCompacto(fila.alcance)}
              </span>
            </span>
            <span className="truncate text-[0.6875rem] cifras text-muted-foreground">
              {[
                porEngagement
                  ? `${formatearCompacto(fila.alcance)} personas`
                  : `${formatearPorcentaje(fila.engagement, 1)} engagement`,
                `${formatearCompacto(fila.interacciones)} interacciones`,
                formatearCOPCompacto(fila.gmv),
                `n = ${formatearNumero(fila.n)}`,
              ].join(" · ")}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Desde 42 rem de celda: tabla con todas las columnas. */
function TablaMedios({ ranking }: { ranking: RankingMedios }) {
  const porEngagement = ranking.criterio === "engagement"
  return (
    <div className="overflow-x-auto @max-2xl/bloque:hidden">
      <table className="w-full min-w-[34rem] text-left text-[0.8125rem]">
        <caption className="sr-only">
          {porEngagement ? "Medios por engagement" : "Medios por alcance"}
        </caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="w-8 pb-2 font-medium">
              <span className="sr-only">Puesto</span>
            </th>
            <th scope="col" className="pb-2 font-medium">
              Medio
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Alcance
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Interacciones
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Engagement
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Inversión
            </th>
          </tr>
        </thead>
        <tbody className="cifras">
          {ranking.filas.map((fila, indice) => (
            <tr
              key={fila.clave}
              className="border-b border-border/60 last:border-0"
            >
              <td className="py-2.5 text-xs font-semibold text-muted-foreground">
                {indice + 1}
              </td>
              <th scope="row" className="max-w-56 truncate py-2.5 font-medium">
                {fila.nombre}
                <span className="ml-1.5 text-[0.6875rem] font-normal text-muted-foreground">
                  n = {formatearNumero(fila.n)}
                </span>
              </th>
              <td className="py-2.5 text-right">
                {formatearCompacto(fila.alcance)}
              </td>
              <td className="py-2.5 text-right">
                {formatearCompacto(fila.interacciones)}
              </td>
              <td
                className={cn(
                  "py-2.5 text-right",
                  porEngagement && "font-semibold text-primary"
                )}
              >
                {formatearPorcentaje(fila.engagement, 1)}
              </td>
              <td className="py-2.5 text-right">
                {formatearCOPCompacto(fila.gmv)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Facturas con saldo: total por pagar, lo vencido y las próximas a vencer. */
export function CarteraAnunciante({
  cartera,
  className,
}: {
  cartera: ResumenCartera
  className?: string
}) {
  const alDia = cartera.saldo === 0
  return (
    <TarjetaPanel
      titulo="Facturas por pagar"
      descripcion="Saldo de tus facturas emitidas."
      icono={ReceiptText}
      className={className}
    >
      {alDia ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
            <CircleCheck aria-hidden className="size-4.5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Estás al día</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              No tienes facturas con saldo pendiente.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Saldo total</span>
              <span className="font-heading text-2xl font-semibold tracking-tight">
                {formatearCOP(cartera.saldo)}
              </span>
            </div>
            {cartera.vencido > 0 ? (
              <span className="rounded-md bg-destructive/12 px-2 py-1 text-xs font-semibold text-destructive">
                {formatearCOPCompacto(cartera.vencido)} vencido ·{" "}
                {cartera.facturasVencidas}{" "}
                {cartera.facturasVencidas === 1 ? "factura" : "facturas"}
              </span>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {cartera.facturas.map((factura) => (
              <li
                key={factura.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-[0.8125rem]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {factura.numero ? `Factura ${factura.numero}` : "Factura"}
                  </span>
                  <span
                    className={cn(
                      "text-[0.6875rem]",
                      factura.vencida
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {factura.fechaVencimiento
                      ? `${factura.vencida ? "Venció" : "Vence"} el ${formatearFecha(`${factura.fechaVencimiento}T12:00:00-05:00`)}`
                      : "Sin fecha de vencimiento"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold cifras">
                  {formatearCOPCompacto(factura.saldo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TarjetaPanel>
  )
}
