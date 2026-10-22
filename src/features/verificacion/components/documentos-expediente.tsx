"use client"

import {
  ChevronDown,
  Eye,
  FileSearch,
  FileText,
  History,
  LockKeyhole,
  Video,
} from "lucide-react"
import { useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  InsigniaEstado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import {
  ESTADOS_DOCUMENTO,
  TIPOS_DOCUMENTO_MEDIO,
} from "@/features/operacion/estados"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  enFrase,
  ORDEN_TIPOS_DOCUMENTO,
  SITUACIONES_REQUISITO,
  tituloRequisito,
} from "../presentacion"
import {
  CLAVE_CERTIFICADO_PAGO,
  type FilaDocumentos,
  filasDocumentos,
} from "../requisitos"
import type {
  DocumentoExpediente,
  ExpedienteMedio,
  NivelExpediente,
} from "../tipos"
import { DialogoVideollamada } from "./dialogo-videollamada"
import { HojaDocumento } from "./revision-documento"

function Fechas({ documento }: { documento: DocumentoExpediente }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span title={formatearFechaHora(documento.subidoAt)}>
        {documento.metodo === "VIDEOLLAMADA" ? "Registrada" : "Cargado"} el{" "}
        {formatearFecha(documento.subidoAt)}
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
                {TIPOS_DOCUMENTO_MEDIO[documento.tipo]}
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
              aria-label={`Ver ${enFrase(TIPOS_DOCUMENTO_MEDIO[documento.tipo])} del ${formatearFecha(documento.subidoAt)}`}
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

function FilaRequisitoDocumento({
  fila,
  onAbrir,
  onVideollamada,
}: {
  fila: FilaDocumentos<DocumentoExpediente>
  onAbrir: (documento: DocumentoExpediente) => void
  onVideollamada: () => void
}) {
  const titulo = tituloRequisito(fila.clave)
  const { etiqueta, tono } = SITUACIONES_REQUISITO[fila.situacion]
  const { principal, porRevisar } = fila
  const reemplazo = porRevisar && porRevisar !== principal ? porRevisar : null
  const ofrecerVideollamada =
    fila.clave === "PRUEBA_VIDA" && fila.situacion !== "aprobado"
  return (
    <li className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {titulo}
            {!fila.exigido ? (
              <span className="text-xs font-normal text-muted-foreground">
                Adicional
              </span>
            ) : null}
            {principal?.metodo === "VIDEOLLAMADA" ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Video aria-hidden className="size-3.5" />
                Por videollamada
              </span>
            ) : null}
          </h3>
          {principal ? (
            <Fechas documento={principal} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {fila.clave === CLAVE_CERTIFICADO_PAGO
                ? "Bancaria o de billetera, según su método de pago."
                : "El medio aún no lo carga."}
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
      {reemplazo ? (
        <p className="text-xs text-pretty text-warning">
          Cargó un reemplazo que espera revisión.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {porRevisar ? (
          <Button
            size="sm"
            onClick={() => onAbrir(porRevisar)}
            aria-label={`Revisar ${enFrase(titulo)}`}
          >
            <FileSearch data-icon="inline-start" aria-hidden />
            Revisar
          </Button>
        ) : null}
        {principal && principal !== porRevisar ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAbrir(principal)}
            aria-label={`Ver ${enFrase(titulo)}`}
          >
            <Eye data-icon="inline-start" aria-hidden />
            Ver
          </Button>
        ) : null}
        {ofrecerVideollamada ? (
          <Button variant="outline" size="sm" onClick={onVideollamada}>
            <Video data-icon="inline-start" aria-hidden />
            Registrar videollamada
          </Button>
        ) : null}
      </div>
      <Historial documentos={fila.historial} onVer={onAbrir} />
    </li>
  )
}

/**
 * Documentos del medio frente al nivel que se evalúa: lo exigido (con el
 * certificado de su medio de pago) y lo demás que cargó. Cada carga se abre
 * en la hoja de revisión; la prueba de vida admite la constancia de una
 * videollamada en lugar de la foto.
 */
export function DocumentosExpediente({
  expediente,
  nivel,
}: {
  expediente: ExpedienteMedio
  nivel: NivelExpediente
}) {
  const [abierto, setAbierto] = useState<DocumentoExpediente | null>(null)
  const [videollamada, setVideollamada] = useState(false)
  const { medio, documentos, hoy } = expediente

  if (!documentos) {
    return (
      <TarjetaFicha titulo="Documentos" icono={FileText}>
        <EstadoVacio
          variante="simple"
          icono={LockKeyhole}
          titulo="Sin acceso a los documentos"
          descripcion="Ver y revisar documentos de identidad exige además el permiso de datos sensibles."
          className="py-6"
        />
      </TarjetaFicha>
    )
  }

  const filas = filasDocumentos(nivel, documentos, hoy, ORDEN_TIPOS_DOCUMENTO)
  // Si la hoja quedó abierta sobre un documento que ya cambió, se usa su versión nueva.
  const actual = abierto
    ? (documentos.find((documento) => documento.id === abierto.id) ?? abierto)
    : null

  return (
    <TarjetaFicha
      titulo="Documentos"
      icono={FileText}
      descripcion={`Lo que exige el nivel ${nivel.nivel} y lo demás que cargó.`}
    >
      <ul className="flex flex-col divide-y">
        {filas.map((fila) => (
          <FilaRequisitoDocumento
            key={fila.clave}
            fila={fila}
            onAbrir={setAbierto}
            onVideollamada={() => setVideollamada(true)}
          />
        ))}
      </ul>

      {actual ? (
        <HojaDocumento
          key={actual.id}
          documento={actual}
          medio={medio}
          hoy={hoy}
          abierta
          onAbiertaChange={(abierta) => {
            if (!abierta) setAbierto(null)
          }}
        />
      ) : null}

      <DialogoVideollamada
        abierto={videollamada}
        onAbiertoChange={setVideollamada}
        medio={medio}
      />
    </TarjetaFicha>
  )
}
