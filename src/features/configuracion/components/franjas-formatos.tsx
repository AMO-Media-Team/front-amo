"use client"

import { History, Layers, Pencil, Plus, SquareStack } from "lucide-react"
import { useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { siguienteClaveFranja } from "../formularios"
import { NOMBRES_FORMATO, rangoSeguidores } from "../presentacion"
import { ORDEN_PLATAFORMAS } from "../tarifas"
import type { Formato, Franja } from "../tipos"
import { Bloque } from "./bloque"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { HojaFormato, HojaFranja } from "./hoja-franja-formato"
import { Insignia } from "./insignias"

function BotonesFila({
  titulo,
  editable,
  onEditar,
  onHistorial,
}: {
  titulo: string
  editable: boolean
  onEditar: () => void
  onHistorial: (() => void) | null
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onHistorial ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Historial de ${titulo}`}
          onClick={onHistorial}
        >
          <History aria-hidden />
        </Button>
      ) : null}
      {editable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar ${titulo}`}
          onClick={onEditar}
        >
          <Pencil aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

function InsigniaActivo({
  activo,
  femenino = false,
}: {
  activo: boolean
  femenino?: boolean
}) {
  return activo ? null : (
    <Insignia tono="neutro">{femenino ? "Inactiva" : "Inactivo"}</Insignia>
  )
}

/** Rango de la franja; si el nombre ya es el rango, no se repite. */
function detalleFranja(franja: Franja): string {
  const rango = rangoSeguidores(franja.seguidoresMin, franja.seguidoresMax)
  return rango.startsWith(franja.nombre) ? "seguidores verificados" : rango
}

/** Franjas de seguidores: rangos sin cruces que definen la tarifa de cada cuenta. */
export function FranjasSeguidores({ franjas }: { franjas: readonly Franja[] }) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegida, setElegida] = useState<Franja | null>(null)
  const [abierta, setAbierta] = useState(false)
  const editable = permisos.catalogos
  const hayClaveLibre = siguienteClaveFranja(franjas) !== null
  const maximo = Math.max(
    1,
    ...franjas.map((f) => f.seguidoresMax ?? f.seguidoresMin * 1.6)
  )

  function editar(franja: Franja | null) {
    setElegida(franja)
    setAbierta(true)
  }

  return (
    <Bloque
      id="franjas"
      titulo="Franjas de seguidores"
      descripcion="Cada cuenta cae en una franja según sus seguidores verificados; la franja fija su tarifa base."
      icono={Layers}
      acciones={
        editable && hayClaveLibre ? (
          <Button variant="outline" size="sm" onClick={() => editar(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Nueva franja
          </Button>
        ) : null
      }
    >
      {franjas.length === 0 ? (
        <EstadoVacio
          icono={Layers}
          variante="simple"
          titulo="Sin franjas"
          descripcion="Sin franjas no se puede fijar ninguna tarifa."
          className="py-8"
        />
      ) : (
        // La barra del rango solo aparece si la TARJETA tiene ancho para ella.
        <ul className="@container flex flex-col divide-y">
          {franjas.map((franja) => {
            const fin = franja.seguidoresMax ?? maximo
            return (
              <li
                key={franja.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 @xl:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] @xl:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-7 min-w-9 place-items-center rounded-md bg-primary/10 px-1.5 font-mono text-xs font-semibold text-primary">
                    {franja.clave}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {franja.nombre}
                      <InsigniaActivo activo={franja.activa} femenino />
                    </span>
                    <span className="text-xs cifras text-muted-foreground">
                      {detalleFranja(franja)}
                    </span>
                  </div>
                </div>
                <div
                  aria-hidden
                  className="relative hidden h-1.5 rounded-full bg-muted @xl:block"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      franja.activa
                        ? "bg-primary/70"
                        : "bg-muted-foreground/40",
                      franja.seguidoresMax === null &&
                        "rounded-r-none bg-linear-to-r from-primary/70 to-transparent"
                    )}
                    style={{
                      left: `${(franja.seguidoresMin / maximo) * 100}%`,
                      width: `${Math.max(2, ((fin - franja.seguidoresMin) / maximo) * 100)}%`,
                    }}
                  />
                </div>
                <BotonesFila
                  titulo={`la franja ${franja.clave}`}
                  editable={editable}
                  onEditar={() => editar(franja)}
                  onHistorial={
                    abrirHistorial
                      ? () =>
                          abrirHistorial({
                            entidad: "franjas",
                            entidadId: franja.id,
                            titulo: `Franja ${franja.clave} · ${franja.nombre}`,
                          })
                      : null
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
      <HojaFranja
        abierta={abierta}
        onAbiertaChange={setAbierta}
        franja={elegida}
        franjas={franjas}
      />
    </Bloque>
  )
}

function requisitosEnTexto(formato: Formato): string[] {
  const r = formato.requisitos
  return [
    r.relacionesAspecto.length ? r.relacionesAspecto.join(" · ") : null,
    r.mime.length ? r.mime.map((m) => m.split("/")[1] ?? m).join(", ") : null,
    r.duracionMaxS !== null ? `≤ ${formatearNumero(r.duracionMaxS)} s` : null,
    r.pesoMaxMb !== null ? `≤ ${formatearNumero(r.pesoMaxMb)} MB` : null,
    r.maxArchivos !== null
      ? `hasta ${formatearNumero(r.maxArchivos)} archivos`
      : null,
  ].filter((x): x is string => x !== null)
}

/** Tipo del formato, solo cuando el nombre no lo dice ya («Reel» de tipo «Reel»). */
function tipoFormato(formato: Formato): string | null {
  const tipo = NOMBRES_FORMATO[formato.clave] ?? formato.clave
  const iguales =
    tipo.localeCompare(formato.nombre.trim(), "es-CO", {
      sensitivity: "base",
    }) === 0
  return iguales ? null : tipo
}

/** Formatos por plataforma con los requisitos que se validan al subir el contenido. */
export function FormatosPlataforma({
  formatos,
}: {
  formatos: readonly Formato[]
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegido, setElegido] = useState<Formato | null>(null)
  const [abierta, setAbierta] = useState(false)
  const editable = permisos.catalogos
  const grupos = ORDEN_PLATAFORMAS.map((plataforma) => ({
    plataforma,
    formatos: formatos
      .filter((f) => f.plataforma === plataforma)
      .sort((a, b) => a.orden - b.orden),
  })).filter((g) => g.formatos.length > 0)

  function editar(formato: Formato | null) {
    setElegido(formato)
    setAbierta(true)
  }

  return (
    <Bloque
      id="formatos"
      titulo="Formatos por plataforma"
      descripcion="Qué se puede pedir en cada red y qué requisitos debe cumplir el archivo."
      icono={SquareStack}
      acciones={
        editable ? (
          <Button variant="outline" size="sm" onClick={() => editar(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Nuevo formato
          </Button>
        ) : null
      }
    >
      {grupos.length === 0 ? (
        <EstadoVacio
          icono={SquareStack}
          variante="simple"
          titulo="Sin formatos"
          descripcion="Crea el primer formato para poder fijar tarifas y recibir ofertas."
          className="py-8"
        />
      ) : (
        <div className="@container">
          <div className="grid divide-y @3xl:grid-cols-3 @3xl:divide-x @3xl:divide-y-0">
            {grupos.map((grupo) => (
              <div key={grupo.plataforma} className="flex flex-col">
                <div className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
                  <MarcaPlataforma
                    plataforma={grupo.plataforma}
                    conNombre
                    className="font-medium"
                  />
                </div>
                <ul className="flex flex-col divide-y">
                  {grupo.formatos.map((formato) => (
                    <li
                      key={formato.id}
                      className="flex items-start justify-between gap-2 px-4 py-3 sm:px-5"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {formato.nombre}
                          <InsigniaActivo activo={formato.activo} />
                        </span>
                        {tipoFormato(formato) ? (
                          <span className="text-xs text-muted-foreground">
                            {tipoFormato(formato)}
                          </span>
                        ) : null}
                        <span className="flex flex-wrap gap-1">
                          {requisitosEnTexto(formato).map((texto) => (
                            <span
                              key={texto}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
                            >
                              {texto}
                            </span>
                          ))}
                        </span>
                      </div>
                      <BotonesFila
                        titulo={formato.nombre}
                        editable={editable}
                        onEditar={() => editar(formato)}
                        onHistorial={
                          abrirHistorial
                            ? () =>
                                abrirHistorial({
                                  entidad: "formatos",
                                  entidadId: formato.id,
                                  titulo: `Formato · ${formato.nombre}`,
                                })
                            : null
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <HojaFormato
        abierta={abierta}
        onAbiertaChange={setAbierta}
        formato={elegido}
        formatos={formatos}
      />
    </Bloque>
  )
}
