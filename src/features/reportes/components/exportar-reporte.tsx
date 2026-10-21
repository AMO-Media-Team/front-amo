"use client"

import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { unstable_rethrow } from "next/navigation"
import { useQueryStates } from "nuqs"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { exportarExcel } from "@/lib/export/excel"
import { exportarPdf } from "@/lib/export/pdf"
import { formatearNumero } from "@/lib/format"

import { prepararExportacionReporte } from "../actions"
import { REPORTES, type SlugReporte } from "../catalogo"
import { contenidoReporte } from "../definiciones"
import {
  construirDocumentoPdf,
  construirLibro,
  type EncabezadoDocumento,
} from "../exportacion/documento"
import { entradaDesdeValores, parsersFiltros } from "../filtros"
import type { FormatoReporte } from "../schemas"
import type { ArchivoReporte } from "../tipos"
import { capturarGraficosReporte } from "./captura-reporte"

type AlAvanzar = (hechos: number, total: number) => void

/** Arma y descarga el documento; devuelve los gráficos que no entraron al PDF. */
async function generarDocumento(
  archivo: ArchivoReporte,
  formato: FormatoReporte,
  alAvanzar: AlAvanzar
): Promise<{ filas: number; fallidos: string[] }> {
  const reporte = REPORTES[archivo.reporte]
  const contenido = contenidoReporte(archivo)
  const encabezado: EncabezadoDocumento = {
    reporte,
    contexto: archivo.datos.contexto,
    generadoPor: archivo.generadoPor,
    fecha: new Date(archivo.generadoAt),
  }
  const filas = contenido.tabla.filas.length
  if (formato === "xlsx") {
    await exportarExcel(construirLibro(contenido, encabezado), reporte.titulo)
    return { filas, fallidos: [] }
  }
  const { imagenes, fallidos } = await capturarGraficosReporte(
    contenido.vista.graficos,
    reporte.orientacionPdf,
    alAvanzar
  )
  await exportarPdf(
    construirDocumentoPdf(contenido, encabezado, imagenes),
    reporte.titulo
  )
  return { filas, fallidos }
}

const NOMBRE_FORMATO: Readonly<Record<FormatoReporte, string>> = {
  xlsx: "Excel",
  pdf: "PDF",
}

/**
 * Descarga del reporte en Excel o PDF con el periodo y los filtros de la URL.
 * El servidor vuelve a consultar, deja la exportación en la bitácora y
 * entrega los datos; el navegador arma el documento de marca (portada,
 * filtros, indicadores, gráficos, detalle y notas) y lo descarga.
 */
export function ExportarReporte({ reporte }: { reporte: SlugReporte }) {
  const [exportando, iniciar] = useTransition()
  const [valores] = useQueryStates(parsersFiltros)

  function exportar(formato: FormatoReporte) {
    iniciar(async () => {
      const aviso = toast.loading(`Preparando el ${NOMBRE_FORMATO[formato]}…`, {
        description:
          "Consultando los datos con el periodo y los filtros actuales.",
      })
      let resultado: Awaited<ReturnType<typeof prepararExportacionReporte>>
      try {
        resultado = await prepararExportacionReporte({
          reporte,
          formato,
          filtros: entradaDesdeValores(valores),
        })
      } catch (error) {
        // Sesión vencida o permiso retirado: Next redirige o muestra el 403.
        toast.dismiss(aviso)
        unstable_rethrow(error)
        // Sin conexión o servidor caído: el reporte sigue en pantalla.
        toast.error("No pudimos conectar con el servidor", {
          description:
            "Revisa tu conexión e intenta de nuevo. El archivo no se descargó.",
        })
        return
      }
      if (!resultado.ok) {
        toast.error(resultado.error, { id: aviso, description: undefined })
        return
      }
      try {
        const { filas, fallidos } = await generarDocumento(
          resultado.datos,
          formato,
          (hechos, total) =>
            toast.loading(
              `Dibujando los gráficos (${hechos + 1} de ${total})…`,
              {
                id: aviso,
                description: "El PDF incluye cada gráfico en tema claro.",
              }
            )
        )
        const detalle = `${formatearNumero(filas)} ${filas === 1 ? "fila" : "filas"} de detalle · la descarga quedó registrada en la bitácora.`
        if (fallidos.length > 0) {
          toast.warning(
            `${NOMBRE_FORMATO[formato]} descargado sin ${fallidos.length === 1 ? "un gráfico" : `${fallidos.length} gráficos`}`,
            {
              id: aviso,
              description: `No se pudo dibujar: ${fallidos.join(", ")}. ${detalle}`,
            }
          )
          return
        }
        toast.success(`${NOMBRE_FORMATO[formato]} descargado`, {
          id: aviso,
          description: detalle,
        })
      } catch {
        toast.error("No se pudo generar el archivo. Intenta de nuevo.", {
          id: aviso,
          description:
            "La exportación quedó registrada, pero el navegador no pudo armar el documento.",
        })
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            disabled={exportando}
            aria-busy={exportando}
            className="shadow-glow"
          />
        }
      >
        {exportando ? (
          <Spinner data-icon="inline-start" aria-hidden />
        ) : (
          <Download data-icon="inline-start" aria-hidden />
        )}
        Exportar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span>Descargar el reporte</span>
            <span className="text-xs font-normal text-muted-foreground">
              Con el periodo y los filtros actuales. Cada descarga queda en la
              bitácora.
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => exportar("xlsx")}
            className="items-start"
          >
            <FileSpreadsheet aria-hidden className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span>Excel (.xlsx)</span>
              <span className="text-xs text-muted-foreground">
                Detalle completo y una hoja con los datos de cada gráfico
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => exportar("pdf")}
            className="items-start"
          >
            <FileText aria-hidden className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span>PDF (.pdf)</span>
              <span className="text-xs text-muted-foreground">
                Informe con portada, indicadores, gráficos y notas
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
