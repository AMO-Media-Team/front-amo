"use client"

import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { unstable_rethrow } from "next/navigation"
import { useId, useTransition } from "react"
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
import { capturarGraficosReporte } from "@/features/reportes/components/captura-reporte"
import {
  construirDocumentoPdf,
  construirLibro,
} from "@/features/reportes/exportacion/documento"
import { exportarExcel } from "@/lib/export/excel"
import { exportarPdf } from "@/lib/export/pdf"
import { formatearNumero } from "@/lib/format"

import { prepararExportacionMetricas } from "../actions"
import { contenidoMetricas, encabezadoMetricas } from "../contenido"
import type { Dimension } from "../dimensiones"
import type { FormatoMetricas } from "../schemas"
import type { ArchivoMetricas } from "../tipos"

const NOMBRE_FORMATO: Readonly<Record<FormatoMetricas, string>> = {
  xlsx: "Excel",
  pdf: "PDF",
}

type AlAvanzar = (hechos: number, total: number) => void

/** Arma el documento de marca y lo descarga; devuelve los gráficos que no entraron. */
async function generarDocumento(
  archivo: ArchivoMetricas,
  formato: FormatoMetricas,
  alAvanzar: AlAvanzar
): Promise<{ filas: number; fallidos: string[] }> {
  const contenido = contenidoMetricas(archivo.datos, archivo.dimension)
  const encabezado = encabezadoMetricas(
    archivo.datos,
    archivo.dimension,
    archivo.generadoPor,
    new Date(archivo.generadoAt)
  )
  const nombre = `metricas ${archivo.datos.campana.nombre}`
  const filas = contenido.tabla.filas.length
  if (formato === "xlsx") {
    await exportarExcel(construirLibro(contenido, encabezado), nombre)
    return { filas, fallidos: [] }
  }
  const { imagenes, fallidos } = await capturarGraficosReporte(
    contenido.vista.graficos,
    encabezado.reporte.orientacionPdf,
    alAvanzar
  )
  await exportarPdf(
    construirDocumentoPdf(contenido, encabezado, imagenes),
    nombre
  )
  return { filas, fallidos }
}

/**
 * Descarga de las métricas de la campaña en Excel o PDF de marca, con el corte
 * elegido. El servidor vuelve a consultar, deja la exportación en la bitácora
 * y entrega los datos; el navegador arma el documento (portada con filtros,
 * indicadores, gráficos, detalle y notas). Sin negocios verificados no hay
 * nada que descargar y el botón lo explica.
 */
export function ExportarMetricas({
  campanaId,
  dimension,
  sinResultados,
}: {
  campanaId: string
  dimension: Dimension
  sinResultados: boolean
}) {
  const [exportando, iniciar] = useTransition()
  const idAyuda = useId()

  function exportar(formato: FormatoMetricas) {
    iniciar(async () => {
      const aviso = toast.loading(`Preparando el ${NOMBRE_FORMATO[formato]}…`, {
        description: "Consultando las métricas verificadas de la campaña.",
      })
      let resultado: Awaited<ReturnType<typeof prepararExportacionMetricas>>
      try {
        resultado = await prepararExportacionMetricas({
          campanaId,
          formato,
          dimension,
        })
      } catch (error) {
        // Sesión vencida o permiso retirado: Next redirige o muestra el 403.
        toast.dismiss(aviso)
        unstable_rethrow(error)
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

  if (sinResultados) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Button variant="outline" disabled aria-describedby={idAyuda}>
          <Download data-icon="inline-start" aria-hidden />
          Exportar
        </Button>
        <p id={idAyuda} className="text-xs text-muted-foreground">
          Podrás exportar cuando haya negocios verificados.
        </p>
      </div>
    )
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
            <span>Descargar las métricas</span>
            <span className="text-xs font-normal text-muted-foreground">
              Con el corte elegido. Cada descarga queda en la bitácora.
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
                Indicadores y una hoja por cada corte
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
