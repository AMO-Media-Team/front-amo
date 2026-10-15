import {
  FileChartColumn,
  FileSpreadsheet,
  ListFilter,
  MousePointerClick,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import {
  GRUPOS_REPORTE,
  puedeExportarReporte,
  reportesPorGrupo,
  tarjetaPara,
} from "../catalogo"
import { ultimasExportaciones } from "../servidor"
import { TarjetaReporte } from "./tarjeta-reporte"

const PASOS = [
  { Icono: MousePointerClick, texto: "Elige un reporte" },
  { Icono: ListFilter, texto: "Ajusta el periodo y los filtros" },
] as const

const PASO_EXPORTAR = {
  Icono: FileSpreadsheet,
  texto: "Descárgalo en Excel o PDF",
} as const

/**
 * Los pasos de uso, para quien llega por primera vez. El de descarga solo se
 * anuncia a quien puede exportar (`reportes.exportar`).
 */
export function PasosReportes({ conExportacion }: { conExportacion: boolean }) {
  const pasos = conExportacion ? [...PASOS, PASO_EXPORTAR] : PASOS
  return (
    <ol
      aria-label="Cómo usar los reportes"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-muted-foreground"
    >
      {pasos.map(({ Icono, texto }, indice) => (
        <li key={texto} className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold cifras text-primary">
            {indice + 1}
          </span>
          <Icono aria-hidden className="size-3.5 text-muted-foreground/70" />
          {texto}
        </li>
      ))}
    </ol>
  )
}

/**
 * Reportes que la persona puede abrir, agrupados por tema, con la última
 * exportación de cada uno (del equipo con `auditoria.ver`; si no, la propia).
 */
export async function CentroReportes({ usuario }: { usuario: UsuarioSesion }) {
  const grupos = reportesPorGrupo(usuario)
  if (grupos.length === 0) {
    return (
      <EstadoVacio
        icono={FileChartColumn}
        titulo="No tienes reportes disponibles"
        descripcion="Tu rol puede entrar a Reportes, pero ninguno de sus informes. Pide a un administrador los permisos del reporte que necesitas."
      />
    )
  }

  const ultimas = await ultimasExportaciones(usuario)
  const ahora = new Date()
  // Posición global de cada tarjeta: la entrada escalonada sigue de un grupo al siguiente.
  const inicios = grupos.map((_, i) =>
    grupos.slice(0, i).reduce((total, g) => total + g.reportes.length, 0)
  )

  // Con un solo reporte (un anunciante) el encabezado del grupo sobra: su
  // descripción habla de informes que esa persona no ve.
  const unico = grupos.length === 1 && grupos[0].reportes.length === 1

  return (
    <div className="flex flex-col gap-10">
      {grupos.map(({ grupo, reportes }, posicionGrupo) => (
        <section
          key={grupo}
          aria-labelledby={`grupo-${grupo}`}
          className="flex flex-col gap-4"
        >
          <header className={cn("flex flex-col gap-1", unico && "sr-only")}>
            <h2
              id={`grupo-${grupo}`}
              className="font-heading text-lg font-semibold"
            >
              {unico ? "Tu reporte" : GRUPOS_REPORTE[grupo].titulo}
            </h2>
            {unico ? null : (
              <p className="text-sm text-muted-foreground">
                {GRUPOS_REPORTE[grupo].descripcion}
              </p>
            )}
          </header>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reportes.map((reporte, i) => (
              <TarjetaReporte
                key={reporte.slug}
                reporte={reporte}
                {...tarjetaPara(reporte, usuario)}
                ultima={ultimas[reporte.slug]}
                puedeExportar={puedeExportarReporte(usuario, reporte)}
                ahora={ahora}
                indice={inicios[posicionGrupo] + i}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
