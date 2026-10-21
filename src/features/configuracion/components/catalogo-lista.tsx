"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Archive,
  ArchiveRestore,
  EllipsisVertical,
  Factory,
  History,
  type LucideIcon,
  Pencil,
  Plus,
  Search,
  Shapes,
} from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { normalizarNombreGeo } from "@/lib/geo/normalizar"
import { cn } from "@/lib/utils"

import { archivarElementoCatalogo, guardarElementoCatalogo } from "../actions"
import { valoresElementoCatalogo } from "../formularios"
import { pluralizar } from "../presentacion"
import {
  type EntradaElementoCatalogo,
  esquemaElementoCatalogo,
} from "../schemas"
import type { ElementoCatalogo, NombreCatalogo } from "../tipos"
import { Bloque } from "./bloque"
import {
  CampoAreaTexto,
  CampoCifra,
  CampoInterruptor,
  CampoTexto,
} from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { Insignia } from "./insignias"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "nombre",
  "descripcion",
  "orden",
] as const satisfies readonly (keyof EntradaElementoCatalogo)[]

const TEXTOS: Readonly<
  Record<
    NombreCatalogo,
    {
      titulo: string
      descripcion: string
      singular: string
      plural: string
      nuevo: string
      ejemplo: string
      uso: string
      creado: string
      femenino: boolean
    }
  >
> = {
  sectores: {
    titulo: "Sectores económicos",
    descripcion:
      "Sector de cada anunciante; agrupa la analítica por industria.",
    singular: "sector",
    plural: "sectores",
    nuevo: "Nuevo sector",
    ejemplo: "Alimentos y bebidas",
    uso: "los anunciantes",
    creado: "Sector creado",
    femenino: false,
  },
  categorias: {
    titulo: "Categorías de medios",
    descripcion:
      "Temática de cada medio; los anunciantes segmentan sus ofertas con ellas.",
    singular: "categoría",
    plural: "categorías",
    nuevo: "Nueva categoría",
    ejemplo: "Noticias locales",
    uso: "los medios",
    creado: "Categoría creada",
    femenino: true,
  },
}

const ICONOS: Readonly<Record<NombreCatalogo, LucideIcon>> = {
  sectores: Factory,
  categorias: Shapes,
}

/**
 * Catálogo editable (sectores o categorías). Un elemento no se borra: se
 * archiva (deja de ofrecerse y conserva el historial de quien lo usa) y se
 * puede restaurar.
 */
export function CatalogoLista({
  catalogo,
  elementos,
}: {
  catalogo: NombreCatalogo
  elementos: readonly ElementoCatalogo[]
}) {
  const textos = TEXTOS[catalogo]
  const icono = ICONOS[catalogo]
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [busqueda, setBusqueda] = useState("")
  const [verArchivados, setVerArchivados] = useState(false)
  const [elegido, setElegido] = useState<ElementoCatalogo | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [archivar, setArchivar] = useState<ElementoCatalogo | null>(null)
  const editable = permisos.catalogos
  const archivados = elementos.filter((e) => e.archivado).length
  const texto = normalizarNombreGeo(busqueda)
  const visibles = elementos.filter(
    (e) =>
      (verArchivados || !e.archivado) &&
      (!texto || normalizarNombreGeo(e.nombre).includes(texto))
  )

  function abrir(elemento: ElementoCatalogo | null) {
    setElegido(elemento)
    setHojaAbierta(true)
  }

  return (
    <Bloque
      id={catalogo}
      titulo={textos.titulo}
      descripcion={textos.descripcion}
      icono={icono}
      acciones={
        editable ? (
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            {textos.nuevo}
          </Button>
        ) : null
      }
    >
      {elementos.length === 0 ? (
        <EstadoVacio
          icono={icono}
          variante="simple"
          titulo={`Sin ${textos.plural}`}
          descripcion={`Crea el primero para que ${textos.uso} puedan elegirlo.`}
          className="py-8"
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <InputGroup className="sm:max-w-64">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder={`Buscar ${textos.singular}…`}
                aria-label={`Buscar en ${textos.plural}`}
              />
            </InputGroup>
            {archivados > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={verArchivados}
                onClick={() => setVerArchivados((v) => !v)}
                className="self-start text-muted-foreground sm:self-auto"
              >
                <Archive data-icon="inline-start" aria-hidden />
                {verArchivados
                  ? "Ocultar archivados"
                  : `Ver archivados (${archivados})`}
              </Button>
            ) : null}
          </div>
          {visibles.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nada coincide con «{busqueda}».
            </p>
          ) : (
            <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0 sm:[&>li]:border-b sm:[&>li:nth-child(odd)]:border-r">
              {visibles.map((elemento) => (
                <li
                  key={elemento.id}
                  className={cn(
                    "flex items-start justify-between gap-2 px-4 py-3 sm:px-5",
                    (elemento.archivado || !elemento.activo) &&
                      "text-muted-foreground"
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {elemento.nombre}
                      {elemento.archivado ? (
                        <Insignia tono="neutro" icono={Archive}>
                          {textos.femenino ? "Archivada" : "Archivado"}
                        </Insignia>
                      ) : elemento.activo ? null : (
                        <Insignia tono="neutro">
                          {textos.femenino ? "Inactiva" : "Inactivo"}
                        </Insignia>
                      )}
                    </span>
                    {elemento.descripcion ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {elemento.descripcion}
                      </span>
                    ) : null}
                  </div>
                  {editable || abrirHistorial ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Acciones de ${elemento.nombre}`}
                          />
                        }
                      >
                        <EllipsisVertical aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {editable && !elemento.archivado ? (
                          <DropdownMenuItem onClick={() => abrir(elemento)}>
                            <Pencil aria-hidden />
                            Editar
                          </DropdownMenuItem>
                        ) : null}
                        {abrirHistorial ? (
                          <DropdownMenuItem
                            onClick={() =>
                              abrirHistorial({
                                entidad: catalogo,
                                entidadId: elemento.id,
                                titulo: elemento.nombre,
                              })
                            }
                          >
                            <History aria-hidden />
                            Ver historial
                          </DropdownMenuItem>
                        ) : null}
                        {editable ? (
                          <DropdownMenuItem
                            onClick={() => setArchivar(elemento)}
                          >
                            {elemento.archivado ? (
                              <ArchiveRestore aria-hidden />
                            ) : (
                              <Archive aria-hidden />
                            )}
                            {elemento.archivado ? "Restaurar" : "Archivar"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            {pluralizar(
              elementos.filter((e) => !e.archivado && e.activo).length,
              `${textos.singular} disponible`,
              `${textos.plural} disponibles`
            )}
          </p>
        </>
      )}

      <HojaLateral
        abierta={hojaAbierta}
        onAbiertaChange={setHojaAbierta}
        icono={icono}
        titulo={elegido ? `Editar ${textos.singular}` : textos.nuevo}
        descripcion={elegido?.nombre}
      >
        <FormularioElemento
          catalogo={catalogo}
          elemento={elegido}
          elementos={elementos}
        />
      </HojaLateral>

      <DialogoConfirmacion
        abierto={archivar !== null}
        onAbiertoChange={(abierto) => !abierto && setArchivar(null)}
        titulo={
          archivar?.archivado
            ? `¿Restaurar «${archivar.nombre}»?`
            : `¿Archivar «${archivar?.nombre ?? ""}»?`
        }
        descripcion={
          archivar?.archivado
            ? `Volverá a ofrecerse a ${textos.uso}.`
            : `Deja de ofrecerse a ${textos.uso}; quienes ya lo tienen lo conservan.`
        }
        textoConfirmar={archivar?.archivado ? "Restaurar" : "Archivar"}
        onConfirmar={async () => {
          if (!archivar) return false
          const resultado = await archivarElementoCatalogo({
            catalogo,
            id: archivar.id,
            archivar: !archivar.archivado,
            actualizadoAt: archivar.actualizadoAt,
          })
          if (resultado.ok) {
            toast.success(
              archivar.archivado
                ? "Restaurado al catálogo"
                : "Archivado del catálogo",
              {
                description: archivar.nombre,
              }
            )
          }
          return resultado
        }}
      />
    </Bloque>
  )
}

function FormularioElemento({
  catalogo,
  elemento,
  elementos,
}: {
  catalogo: NombreCatalogo
  elemento: ElementoCatalogo | null
  elementos: readonly ElementoCatalogo[]
}) {
  const textos = TEXTOS[catalogo]
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaElementoCatalogo),
    defaultValues: valoresElementoCatalogo(catalogo, elemento, elementos),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarElementoCatalogo,
    campos: CAMPOS,
    onExito: () => {
      toast.success(elemento ? "Cambios guardados" : textos.creado)
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
        textoEnviar={elemento ? "Guardar cambios" : "Crear"}
      >
        <CampoTexto
          nombre="nombre"
          etiqueta="Nombre"
          placeholder={textos.ejemplo}
          deshabilitado={pendiente}
        />
        <CampoAreaTexto
          nombre="descripcion"
          etiqueta="Descripción"
          opcional
          filas={3}
          deshabilitado={pendiente}
        />
        <CampoCifra
          nombre="orden"
          etiqueta="Orden"
          className="max-w-40"
          descripcion="Posición en las listas (los iguales se ordenan por nombre)."
          deshabilitado={pendiente}
        />
        <CampoInterruptor
          nombre="activo"
          etiqueta="Disponible"
          descripcion={`Si lo desactivas, deja de ofrecerse a ${textos.uso} sin archivarlo.`}
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
