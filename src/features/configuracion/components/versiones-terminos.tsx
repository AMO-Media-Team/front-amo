"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CalendarClock,
  Eye,
  FilePen,
  FilePlus2,
  FileText,
  Fingerprint,
  History,
  Megaphone,
  Pencil,
  Scale,
  Send,
  Users,
} from "lucide-react"
import { Suspense, use, useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoError } from "@/components/feedback/estado-error"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import {
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
} from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import { guardarVersionTerminos, leerVersionTerminos } from "../actions"
import { valoresVersionTerminos } from "../formularios"
import { NOMBRES_TERMINOS } from "../presentacion"
import {
  type EntradaVersionTerminos,
  esquemaVersionTerminos,
  LONGITUD_MAXIMA_TERMINOS,
  TIPOS_TERMINOS,
} from "../schemas"
import {
  type EstadoVersion,
  ordenarVersiones,
  siguienteVersion,
  versionesPorTipo,
} from "../terminos"
import type { TipoTerminos, VersionTerminos } from "../tipos"
import { Bloque } from "./bloque"
import { CampoAreaTexto, CampoTexto } from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { DialogoPublicar } from "./dialogo-publicar"
import {
  CuerpoHoja,
  FormularioHoja,
  HojaLateral,
  useHojaLateral,
} from "./hoja-lateral"
import { InsigniaVersion } from "./insignias"
import { useEnvio } from "./use-envio"
import { VistaMarkdown } from "./vista-markdown"

const CAMPOS = [
  "version",
  "contenido",
] as const satisfies readonly (keyof EntradaVersionTerminos)[]

const ICONOS_TIPO: Readonly<Record<TipoTerminos, typeof FileText>> = {
  TERMINOS_MEDIO: Megaphone,
  TERMINOS_ANUNCIANTE: FileText,
  POLITICA_DATOS: Fingerprint,
  CONDICIONES_COMERCIALES: Scale,
}

type VersionConEstado = VersionTerminos & { estado: EstadoVersion }

type Hoja =
  | { modo: "crear"; tipo: TipoTerminos; sugerida: string }
  | {
      modo: "editar"
      version: VersionConEstado
      contenido: Promise<ResultadoAccion<string>>
    }
  | {
      modo: "ver"
      version: VersionConEstado
      contenido: Promise<ResultadoAccion<string>>
    }

/**
 * Versiones de los términos y de la política de datos (Ley 1581). Un
 * borrador se edita hasta publicarlo; publicada, la versión es inmutable y
 * su huella (SHA-256) queda como evidencia de lo que cada persona aceptó.
 */
export function VersionesTerminos({
  versiones,
}: {
  versiones: readonly VersionTerminos[]
}) {
  const permisos = usePermisosConfiguracion()
  const [hoja, setHoja] = useState<Hoja | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [publicar, setPublicar] = useState<VersionConEstado | null>(null)

  function abrir(siguiente: Hoja) {
    setHoja(siguiente)
    setHojaAbierta(true)
  }

  function abrirVersion(modo: "editar" | "ver", version: VersionConEstado) {
    abrir({ modo, version, contenido: leerVersionTerminos({ id: version.id }) })
  }

  return (
    <>
      <div className="@container">
        <div className="grid gap-6 @3xl:grid-cols-2">
          {TIPOS_TERMINOS.map((tipo) => {
            const delTipo = versionesPorTipo(versiones, tipo)
            return (
              <DocumentoLegal
                key={tipo}
                tipo={tipo}
                versiones={ordenarVersiones(delTipo)}
                editable={permisos.catalogos}
                onCrear={() =>
                  abrir({
                    modo: "crear",
                    tipo,
                    sugerida: siguienteVersion(delTipo),
                  })
                }
                onEditar={(version) => abrirVersion("editar", version)}
                onVer={(version) => abrirVersion("ver", version)}
                onPublicar={setPublicar}
              />
            )
          })}
        </div>
      </div>

      <HojaLateral
        abierta={hojaAbierta}
        onAbiertaChange={setHojaAbierta}
        icono={
          hoja?.modo === "ver"
            ? Eye
            : hoja?.modo === "editar"
              ? FilePen
              : FilePlus2
        }
        titulo={
          hoja?.modo === "crear"
            ? "Nueva versión"
            : hoja
              ? `Versión ${hoja.version.version}`
              : "Versión"
        }
        descripcion={
          hoja
            ? NOMBRES_TERMINOS[
                hoja.modo === "crear" ? hoja.tipo : hoja.version.tipo
              ].titulo
            : undefined
        }
        ancho="xl"
      >
        {hoja?.modo === "crear" ? (
          <FormularioVersion
            tipo={hoja.tipo}
            version={null}
            contenido=""
            sugerida={hoja.sugerida}
          />
        ) : hoja ? (
          <Suspense fallback={<EsqueletoContenido />}>
            <ContenidoVersion hoja={hoja} />
          </Suspense>
        ) : null}
      </HojaLateral>

      <DialogoPublicar version={publicar} onCerrar={() => setPublicar(null)} />
    </>
  )
}

function DocumentoLegal({
  tipo,
  versiones,
  editable,
  onCrear,
  onEditar,
  onVer,
  onPublicar,
}: {
  tipo: TipoTerminos
  versiones: VersionConEstado[]
  editable: boolean
  onCrear: () => void
  onEditar: (version: VersionConEstado) => void
  onVer: (version: VersionConEstado) => void
  onPublicar: (version: VersionConEstado) => void
}) {
  const abrirHistorial = useHistorial()
  const [verTodas, setVerTodas] = useState(false)
  const { titulo, resumen } = NOMBRES_TERMINOS[tipo]
  const vigente = versiones.find((v) => v.estado === "VIGENTE") ?? null
  const visibles = verTodas
    ? versiones
    : versiones.filter((v) => v.estado !== "ANTERIOR").slice(0, 4)
  const anteriores = versiones.length - visibles.length

  return (
    <Bloque
      id={`legal-${tipo.toLowerCase()}`}
      titulo={titulo}
      descripcion={resumen}
      icono={ICONOS_TIPO[tipo]}
      acciones={
        editable ? (
          <Button variant="outline" size="sm" onClick={onCrear}>
            <FilePlus2 data-icon="inline-start" aria-hidden />
            Nueva versión
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-1 border-b bg-muted/20 px-4 py-3 sm:px-5">
        {vigente ? (
          <p className="text-sm">
            Vigente:{" "}
            <span className="font-semibold">versión {vigente.version}</span>
            <span className="text-muted-foreground">
              {" "}
              desde el {formatearFecha(vigente.vigenteDesde, "largo")}
            </span>
          </p>
        ) : (
          <p className="text-sm font-medium text-warning">
            Sin versión publicada: nadie puede aceptarlo todavía.
          </p>
        )}
        {vigente?.aceptaciones !== null &&
        vigente?.aceptaciones !== undefined ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users aria-hidden className="size-3.5" />
            {formatearNumero(vigente.aceptaciones)}{" "}
            {vigente.aceptaciones === 1 ? "aceptación" : "aceptaciones"}
          </p>
        ) : null}
      </div>
      {versiones.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Aún no hay versiones.{" "}
          {editable ? "Crea un borrador para empezar." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {visibles.map((version) => (
            <li
              key={version.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Versión {version.version}
                  <InsigniaVersion estado={version.estado} />
                </span>
                <span className="text-xs cifras text-muted-foreground">
                  {version.estado === "BORRADOR"
                    ? `Borrador creado el ${formatearFecha(version.creadaAt, "medio")}`
                    : version.estado === "PROGRAMADA"
                      ? `Entra en vigor el ${formatearFechaHora(version.vigenteDesde)}`
                      : `Publicada el ${formatearFecha(version.vigenteDesde, "medio")}`}
                  {version.hash ? (
                    <span
                      className="ml-1.5 font-mono"
                      title={`SHA-256: ${version.hash}`}
                    >
                      · {version.hash.slice(0, 8)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {abrirHistorial ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Historial de la versión ${version.version}`}
                    onClick={() =>
                      abrirHistorial({
                        entidad: "terminos_versiones",
                        entidadId: version.id,
                        titulo: `${titulo} · versión ${version.version}`,
                      })
                    }
                  >
                    <History aria-hidden />
                  </Button>
                ) : null}
                {version.estado === "BORRADOR" && editable ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditar(version)}
                    >
                      <Pencil data-icon="inline-start" aria-hidden />
                      Editar
                    </Button>
                    <Button size="sm" onClick={() => onPublicar(version)}>
                      <Send data-icon="inline-start" aria-hidden />
                      Publicar
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVer(version)}
                  >
                    <Eye data-icon="inline-start" aria-hidden />
                    Ver
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {anteriores > 0 ? (
        <div className="border-t px-4 py-2.5 sm:px-5">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={() => setVerTodas(true)}
          >
            <CalendarClock data-icon="inline-start" aria-hidden />
            Ver {anteriores}{" "}
            {anteriores === 1 ? "versión anterior" : "versiones anteriores"}
          </Button>
        </div>
      ) : null}
    </Bloque>
  )
}

function EsqueletoContenido() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-3 px-5 py-5"
    >
      <span className="sr-only">Cargando el contenido…</span>
      <Esqueleto className="h-5 w-1/2" />
      <Esqueleto className="h-4 w-full" />
      <Esqueleto className="h-4 w-11/12" />
      <Esqueleto className="h-4 w-4/5" />
      <Esqueleto className="h-40 w-full rounded-xl" />
    </div>
  )
}

function ContenidoVersion({
  hoja,
}: {
  hoja: Extract<Hoja, { modo: "editar" | "ver" }>
}) {
  const resultado = use(hoja.contenido)
  if (!resultado.ok) {
    return (
      <CuerpoHoja>
        <EstadoError
          titulo="No pudimos abrir la versión"
          descripcion={resultado.error}
          className="py-8"
        />
      </CuerpoHoja>
    )
  }
  if (hoja.modo === "editar") {
    return (
      <FormularioVersion
        tipo={hoja.version.tipo}
        version={hoja.version}
        contenido={resultado.datos}
        sugerida={hoja.version.version}
      />
    )
  }
  return (
    <CuerpoHoja>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <InsigniaVersion estado={hoja.version.estado} />
        {hoja.version.vigenteDesde ? (
          <span>
            Vigente desde el {formatearFechaHora(hoja.version.vigenteDesde)}
          </span>
        ) : null}
      </div>
      {hoja.version.hash ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Huella SHA-256:{" "}
          <span className="font-mono break-all text-foreground">
            {hoja.version.hash}
          </span>
        </p>
      ) : null}
      <article className="rounded-xl border p-4 sm:p-5">
        <VistaMarkdown texto={resultado.datos} />
      </article>
    </CuerpoHoja>
  )
}

function FormularioVersion({
  tipo,
  version,
  contenido,
  sugerida,
}: {
  tipo: TipoTerminos
  version: VersionTerminos | null
  contenido: string
  sugerida: string
}) {
  const { cerrar } = useHojaLateral()
  const [vista, setVista] = useState<"escribir" | "previa">("escribir")
  const formulario = useForm({
    resolver: zodResolver(esquemaVersionTerminos),
    defaultValues: valoresVersionTerminos(tipo, version, contenido, sugerida),
    mode: "onTouched",
  })
  const texto = useWatch({ control: formulario.control, name: "contenido" })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarVersionTerminos,
    campos: CAMPOS,
    onExito: () => {
      toast.success(version ? "Borrador guardado" : "Borrador creado", {
        description: "Publícalo cuando esté listo.",
      })
      cerrar()
    },
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar={version ? "Guardar borrador" : "Crear borrador"}
      >
        <CampoTexto
          nombre="version"
          etiqueta="Versión"
          className="max-w-64"
          deshabilitado={version !== null || pendiente}
          descripcion={version ? undefined : "Letras, números, punto o guion."}
        />
        <div className="flex flex-col gap-3">
          <ControlSegmentado
            etiqueta="Modo del editor"
            opciones={[
              { valor: "escribir", etiqueta: "Escribir" },
              { valor: "previa", etiqueta: "Vista previa" },
            ]}
            valor={vista}
            onCambio={setVista}
          />
          <div className={cn(vista === "previa" && "hidden")}>
            <CampoAreaTexto
              nombre="contenido"
              etiqueta="Contenido"
              filas={18}
              mono
              deshabilitado={pendiente}
              placeholder={"# Términos y condiciones\n\n1. **Objeto.** …"}
              descripcion={`Markdown: # títulos, - listas, **negrita**. Máximo ${formatearNumero(LONGITUD_MAXIMA_TERMINOS)} caracteres (${formatearNumero(String(texto ?? "").length)} usados).`}
            />
          </div>
          {vista === "previa" ? (
            <article className="min-h-64 rounded-xl border p-4 sm:p-5">
              <VistaMarkdown texto={String(texto ?? "")} />
            </article>
          ) : null}
        </div>
      </FormularioHoja>
    </FormProvider>
  )
}
