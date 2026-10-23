"use client"

import {
  ChevronDown,
  Eye,
  FileSearch,
  FileText,
  FileUp,
  History,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  InsigniaEstado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import { ESTADOS_DOCUMENTO } from "@/features/operacion/estados"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  enFraseDocumento,
  ETIQUETAS_EXIGENCIA,
  SITUACIONES_REQUISITO_ANUNCIANTE,
  tituloDocumento,
} from "../presentacion"
import {
  type FilaDocumentos,
  filasDocumentos,
  type TipoDocumentoAnunciante,
  tipoSugerido,
} from "../requisitos"
import type { DocumentoExpediente, ExpedienteAnunciante } from "../tipos"
import { HojaCargaInterna } from "./hoja-carga-interna"
import { type EmpresaRevisada, HojaDocumentoAnunciante } from "./hoja-documento"
import { useCargaInterna } from "./use-carga-interna"

function Fechas({ documento }: { documento: DocumentoExpediente }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span title={formatearFechaHora(documento.subidoAt)}>
        Cargado el {formatearFecha(documento.subidoAt)}
      </span>
      {documento.venceAt ? (
        <span>
          {" "}
          · vigente hasta el {formatearFecha(instanteDeDia(documento.venceAt))}
        </span>
      ) : null}
    </p>
  )
}

function Historial({
  documentos,
  onVer,
}: {
  documentos: readonly DocumentoExpediente[]
  onVer: (documento: DocumentoExpediente) => void
}) {
  if (documentos.length === 0) return null
  return (
    <details className="group">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:anillo-foco [&::-webkit-details-marker]:hidden">
        <History aria-hidden className="size-3.5" />
        Cargas anteriores ({documentos.length})
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="mt-2 flex flex-col gap-2 border-l pl-3">
        {documentos.map((documento) => (
          <li
            key={documento.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <InsigniaEstado
                  catalogo={ESTADOS_DOCUMENTO}
                  estado={documento.estado}
                  className="h-5 px-2 text-[0.6875rem]"
                />
              </span>
              <Fechas documento={documento} />
              {documento.observaciones ? (
                <span className="text-xs text-pretty text-muted-foreground">
                  {documento.observaciones}
                </span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onVer(documento)}
              aria-label={`Ver ${enFraseDocumento(documento.tipo)} del ${formatearFecha(documento.subidoAt)}`}
            >
              <Eye data-icon="inline-start" aria-hidden />
              Ver
            </Button>
          </li>
        ))}
      </ul>
    </details>
  )
}

function FilaDocumento({
  fila,
  puedeCargar,
  cambioIdentificacion,
  onAbrir,
  onCargar,
}: {
  fila: FilaDocumentos<DocumentoExpediente>
  puedeCargar: boolean
  /** Último cambio de la identificación de la empresa (ISO). */
  cambioIdentificacion: string | null
  onAbrir: (documento: DocumentoExpediente) => void
  onCargar: (tipo: TipoDocumentoAnunciante) => void
}) {
  const titulo = tituloDocumento(fila.tipo)
  const enFrase = enFraseDocumento(fila.tipo)
  const { etiqueta, tono } = SITUACIONES_REQUISITO_ANUNCIANTE[fila.situacion]
  const exigencia = ETIQUETAS_EXIGENCIA[fila.exigencia]
  const { principal, porRevisar } = fila
  const reemplazo = porRevisar && porRevisar !== principal ? porRevisar : null
  const corregir =
    fila.situacion === "falta" ||
    fila.situacion === "rechazado" ||
    fila.situacion === "vencido" ||
    fila.situacion === "desactualizado"
  // El primer botón es siempre el mismo nodo («Revisar» y, decidido, «Ver»):
  // al cerrar la hoja el foco vuelve a él y no se pierde en <body>.
  const primero = porRevisar ?? principal
  return (
    <li className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {titulo}
            {exigencia ? (
              <span className="text-xs font-normal text-muted-foreground">
                {exigencia}
              </span>
            ) : null}
          </h3>
          {principal ? (
            <Fechas documento={principal} />
          ) : (
            <p className="text-xs text-muted-foreground">
              La empresa aún no lo carga.
            </p>
          )}
        </div>
        <InsigniaTono tono={tono} etiqueta={etiqueta} />
      </div>
      {principal?.observaciones && principal.estado === "RECHAZADO" ? (
        <p className="text-xs text-pretty text-muted-foreground">
          <span className="font-medium text-foreground/80">Motivo:</span>{" "}
          {principal.observaciones}
        </p>
      ) : null}
      {fila.situacion === "desactualizado" &&
      principal?.validadoAt &&
      cambioIdentificacion ? (
        <p className="text-xs text-pretty text-warning">
          Aprobado el {formatearFecha(principal.validadoAt)}, antes de que la
          identificación de la empresa cambiara (el{" "}
          {formatearFecha(cambioIdentificacion)}): debe cargarse y aprobarse de
          nuevo.
        </p>
      ) : null}
      {reemplazo ? (
        <p className="text-xs text-pretty text-warning">
          Cargó un reemplazo que espera revisión.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {primero ? (
          <Button
            size="sm"
            variant={porRevisar ? "default" : "outline"}
            onClick={() => onAbrir(primero)}
            aria-label={`${porRevisar ? "Revisar" : "Ver"} ${enFrase}`}
          >
            {porRevisar ? (
              <FileSearch data-icon="inline-start" aria-hidden />
            ) : (
              <Eye data-icon="inline-start" aria-hidden />
            )}
            {porRevisar ? "Revisar" : "Ver"}
          </Button>
        ) : null}
        {porRevisar && principal && principal !== porRevisar ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAbrir(principal)}
            aria-label={`Ver ${enFrase}`}
          >
            <Eye data-icon="inline-start" aria-hidden />
            Ver
          </Button>
        ) : null}
        {puedeCargar && corregir && !porRevisar ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCargar(fila.tipo)}
            aria-label={`Cargar ${enFrase} por la empresa`}
          >
            <FileUp data-icon="inline-start" aria-hidden />
            Cargar
          </Button>
        ) : null}
      </div>
      <Historial documentos={fila.historial} onVer={onAbrir} />
    </li>
  )
}

/**
 * Documentos de la empresa frente a lo que exige su país: primero lo
 * exigido y después lo demás que cargó. Cada carga se abre en la hoja de
 * revisión; con `anunciantes.editar`, el equipo AMO puede cargar un documento
 * por cuenta de la empresa.
 */
export function DocumentosExpediente({
  expediente,
  empresa,
  puedeCargar,
}: {
  expediente: ExpedienteAnunciante
  empresa: EmpresaRevisada
  /** `anunciantes.editar`: carga por cuenta de la empresa. */
  puedeCargar: boolean
}) {
  const { anunciante, documentos, hoy } = expediente
  const cambio = anunciante.identificacionCambiadaAt
  const [abierto, setAbierto] = useState<DocumentoExpediente | null>(null)
  const [carga, setCarga] = useState<{
    abierta: boolean
    tipo: TipoDocumentoAnunciante
  }>(() => ({
    abierta: false,
    tipo: tipoSugerido(anunciante.paisIso2, documentos, hoy, cambio),
  }))
  const cargaInterna = useCargaInterna(anunciante.id, carga.tipo)

  const filas = filasDocumentos(anunciante.paisIso2, documentos, hoy, cambio)
  // Si la hoja quedó abierta sobre un documento que ya cambió, se usa su versión nueva.
  const actual = abierto
    ? (documentos.find((documento) => documento.id === abierto.id) ?? abierto)
    : null

  function abrirCarga(tipo: TipoDocumentoAnunciante) {
    setCarga({ abierta: true, tipo })
  }

  return (
    <TarjetaFicha
      titulo="Documentos"
      icono={FileText}
      descripcion={
        anunciante.paisIso2 === "CO"
          ? "En Colombia se exigen el RUT y la Cámara de Comercio, aprobados y vigentes."
          : "En el exterior basta un documento de existencia de la empresa: Cámara de Comercio u otro equivalente."
      }
      acciones={
        puedeCargar ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              abrirCarga(
                tipoSugerido(anunciante.paisIso2, documentos, hoy, cambio)
              )
            }
          >
            <FileUp data-icon="inline-start" aria-hidden />
            Cargar documento
          </Button>
        ) : null
      }
    >
      <ul className="flex flex-col divide-y">
        {filas.map((fila) => (
          <FilaDocumento
            key={fila.tipo}
            fila={fila}
            puedeCargar={puedeCargar}
            cambioIdentificacion={cambio}
            onAbrir={setAbierto}
            onCargar={abrirCarga}
          />
        ))}
      </ul>

      {actual ? (
        <HojaDocumentoAnunciante
          key={actual.id}
          documento={actual}
          empresa={empresa}
          hoy={hoy}
          abierta
          onAbiertaChange={(abierta) => {
            if (!abierta) setAbierto(null)
          }}
          puedeDecidir
        />
      ) : null}

      {puedeCargar ? (
        <HojaCargaInterna
          empresa={anunciante.nombreComercial}
          tipo={carga.tipo}
          onTipo={(tipo) => setCarga((previa) => ({ ...previa, tipo }))}
          carga={cargaInterna}
          abierta={carga.abierta}
          onAbiertaChange={(abierta) =>
            setCarga((previa) => ({ ...previa, abierta }))
          }
        />
      ) : null}
    </TarjetaFicha>
  )
}
