import { CORTES } from "@/features/operacion/estados"
import { formatearDiaMes } from "@/features/operacion/formato"
import { engagement, nombresColumnas } from "@/features/operacion/metricas"
import {
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import type { CorteAprobado, Plataforma } from "../tipos"

const CELDA = "px-3 py-2 text-right whitespace-nowrap cifras"
const CABECERA = "px-3 py-2 text-right font-medium whitespace-nowrap"

function Cifra({ valor }: { valor: number | null }) {
  return valor === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <>{formatearNumero(valor)}</>
  )
}

/**
 * Cortes de métricas APROBADOS de una publicación (los pendientes o
 * rechazados no llegan al anunciante). En TikTok el alcance son espectadores
 * únicos y las impresiones, reproducciones; la columna de reproducciones
 * aparte solo se muestra fuera de TikTok y si alguna fila la trae. La tabla se
 * desplaza dentro de su región en pantallas angostas (sin desborde de página).
 */
export function TablaCortes({
  cortes,
  plataforma,
  etiqueta,
}: {
  cortes: readonly CorteAprobado[]
  plataforma: Plataforma
  /** «Publicación 2 de @noticias.pasto»: nombra la región y la tabla. */
  etiqueta: string
}) {
  const columnas = nombresColumnas(plataforma)
  const conReproducciones =
    plataforma !== "TIKTOK" &&
    cortes.some((corte) => corte.reproducciones !== null)
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={`Métricas aprobadas: ${etiqueta} (tabla desplazable)`}
      className="overflow-x-auto rounded-lg border focus-visible:anillo-foco"
    >
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Métricas aprobadas: {etiqueta}</caption>
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Corte
            </th>
            <th scope="col" className={CABECERA}>
              {columnas.alcance}
            </th>
            <th scope="col" className={CABECERA}>
              {columnas.impresiones}
            </th>
            <th scope="col" className={CABECERA}>
              Interacciones
            </th>
            {conReproducciones ? (
              <th scope="col" className={CABECERA}>
                Reproducciones
              </th>
            ) : null}
            <th scope="col" className={CABECERA}>
              Clics
            </th>
            <th scope="col" className={CABECERA}>
              Engagement
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cortes.map((corte) => {
            const tasa = engagement(corte.interacciones, corte.alcance)
            return (
              <tr key={corte.corte}>
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {CORTES[corte.corte].etiqueta}
                  <time
                    dateTime={corte.fechaCorte}
                    title={formatearFecha(corte.fechaCorte)}
                    className="ml-1.5 text-[0.6875rem] font-normal cifras text-muted-foreground"
                  >
                    {formatearDiaMes(corte.fechaCorte)}
                  </time>
                </th>
                <td className={CELDA}>
                  <Cifra valor={corte.alcance} />
                </td>
                <td className={CELDA}>
                  <Cifra valor={corte.impresiones} />
                </td>
                <td className={CELDA}>
                  <Cifra valor={corte.interacciones} />
                </td>
                {conReproducciones ? (
                  <td className={CELDA}>
                    <Cifra valor={corte.reproducciones} />
                  </td>
                ) : null}
                <td className={CELDA}>
                  <Cifra valor={corte.clics} />
                </td>
                <td className={CELDA}>
                  {tasa === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    formatearPorcentaje(tasa, 1)
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
