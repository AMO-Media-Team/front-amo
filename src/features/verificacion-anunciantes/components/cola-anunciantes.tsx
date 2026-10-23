import {
  ArrowRight,
  Building2,
  CircleAlert,
  FileCheck2,
  FileClock,
  Hourglass,
  MapPin,
  RotateCcw,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { banderaEmoji } from "@/features/accesos/catalogo"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { Monograma } from "@/features/operacion/components/ficha"
import { ESTADOS_ANUNCIANTE } from "@/features/operacion/estados"
import { contar, unirUbicacion } from "@/features/operacion/formato"
import { COLAS_VERIFICACION } from "@/features/verificacion/colas"
import { PaginacionCola } from "@/features/verificacion/components/paginacion-cola"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { rutaRevisionAnunciante } from "../cola"
import { colaAnunciantes } from "../queries"
import { tituloRequisito } from "../requisitos"
import type { AnuncianteEnCola } from "../tipos"

function Dato({
  icono,
  tono,
  children,
}: {
  icono: ReactNode
  tono?: "aviso" | "exito"
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        tono === "aviso" && "text-warning",
        tono === "exito" && "text-success"
      )}
    >
      {icono}
      {children}
    </span>
  )
}

const ETIQUETA_PEQUENA =
  "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[0.6875rem] font-medium"

/** Por qué está en la cola: su envío o, si no la envió, sus documentos. */
function Espera({ anunciante }: { anunciante: AnuncianteEnCola }) {
  const texto = anunciante.enviadoAt ? "Enviada" : "Documento cargado"
  return (
    <Dato icono={<Hourglass aria-hidden />}>
      <span title={formatearFechaHora(anunciante.desde)}>
        {texto}{" "}
        <time dateTime={anunciante.desde} suppressHydrationWarning>
          {formatearRelativo(anunciante.desde)}
        </time>
      </span>
    </Dato>
  )
}

function Requisitos({ anunciante }: { anunciante: AnuncianteEnCola }) {
  if (anunciante.listos) {
    return (
      <Dato icono={<FileCheck2 aria-hidden />} tono="exito">
        Documentos exigidos aprobados
      </Dato>
    )
  }
  if (anunciante.faltan.length > 0) {
    return (
      <Dato icono={<CircleAlert aria-hidden />} tono="aviso">
        Falta: {anunciante.faltan.map(tituloRequisito).join(", ")}
      </Dato>
    )
  }
  return (
    <Dato icono={<FileCheck2 aria-hidden />}>Documentos exigidos cargados</Dato>
  )
}

function TarjetaAnunciante({ anunciante }: { anunciante: AnuncianteEnCola }) {
  const ruta = rutaRevisionAnunciante(anunciante.id)
  const bandera = banderaEmoji(anunciante.paisIso2)
  const lugar = unirUbicacion(anunciante.ciudad, anunciante.pais)
  return (
    <article
      aria-label={anunciante.nombreComercial}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Monograma
          texto={anunciante.nombreComercial}
          className="size-11 rounded-xl text-sm sm:size-12 sm:text-base"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold">
            <Link
              href={ruta}
              className="break-words underline-offset-4 hover:underline focus-visible:underline"
            >
              {anunciante.nombreComercial}
            </Link>
            {anunciante.reenvio ? (
              <span
                className={cn(
                  ETIQUETA_PEQUENA,
                  "border-info/40 bg-info/8 text-info"
                )}
              >
                <RotateCcw aria-hidden className="size-3" />
                Reenvío
              </span>
            ) : null}
            {anunciante.estado === "PENDIENTE" && !anunciante.enviadoAt ? (
              <span
                className={cn(
                  ETIQUETA_PEQUENA,
                  "border-dashed text-muted-foreground"
                )}
              >
                Aún no la envía
              </span>
            ) : null}
            {anunciante.estado !== "PENDIENTE" ? (
              <InsigniaEstado
                catalogo={ESTADOS_ANUNCIANTE}
                estado={anunciante.estado}
                className="h-5 px-2 text-[0.6875rem]"
              />
            ) : null}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="break-words">{anunciante.razonSocial}</span>
            {anunciante.identificacion ? (
              <span>
                {anunciante.tipoIdentificacion}{" "}
                <span className="font-mono text-[0.75rem] tracking-tight text-foreground/80">
                  {anunciante.identificacion}
                </span>
              </span>
            ) : null}
            {lugar ? (
              <span className="inline-flex items-center gap-1">
                {bandera ? (
                  <span aria-hidden>{bandera}</span>
                ) : (
                  <MapPin aria-hidden className="size-3.5" />
                )}
                {lugar}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Espera anunciante={anunciante} />
            <Dato
              icono={<FileClock aria-hidden />}
              tono={anunciante.documentosPorRevisar > 0 ? "aviso" : undefined}
            >
              {anunciante.documentosPorRevisar > 0
                ? contar(
                    anunciante.documentosPorRevisar,
                    "documento por revisar",
                    "documentos por revisar"
                  )
                : "Documentos revisados"}
            </Dato>
            <Requisitos anunciante={anunciante} />
          </div>
        </div>
      </div>
      <EnlaceBoton
        href={ruta}
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${anunciante.nombreComercial}`}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </article>
  )
}

/**
 * Cola de anunciantes (ADM-003): empresas enviadas a verificación y las que
 * tienen documentos por revisar, lo que más lleva esperando primero. Cada
 * tarjeta abre el expediente en la ficha de la empresa.
 */
export async function ColaAnunciantes({ pagina }: { pagina: number }) {
  const cola = await colaAnunciantes(pagina)
  return (
    <div className="flex flex-col gap-4">
      {cola.filas.length === 0 ? (
        <EstadoVacio
          icono={Building2}
          titulo={COLAS_VERIFICACION.anunciantes.vacia}
          descripcion="Cuando una empresa envíe sus documentos o cargue uno nuevo, aparecerá aquí para que lo revises."
        />
      ) : (
        <ol
          aria-label="Anunciantes por verificar"
          className="flex flex-col gap-3"
        >
          {cola.filas.map((anunciante) => (
            <li key={anunciante.id}>
              <TarjetaAnunciante anunciante={anunciante} />
            </li>
          ))}
        </ol>
      )}
      <PaginacionCola
        cola="anunciantes"
        pagina={cola.pagina}
        total={cola.total}
      />
    </div>
  )
}
