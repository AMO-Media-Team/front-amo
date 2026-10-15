"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  History,
  MapPinned,
  Pencil,
  Plus,
  ReceiptText,
  Search,
} from "lucide-react"
import { useState } from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { normalizarNombreGeo } from "@/lib/geo/normalizar"
import { cn } from "@/lib/utils"

import { guardarReteica, guardarRetencion } from "../actions"
import { valoresReteica, valoresRetencion } from "../formularios"
import { textoANumero } from "../numeros"
import {
  NOMBRES_CONCEPTO,
  NOMBRES_RETENCION,
  pluralizar,
} from "../presentacion"
import {
  CONCEPTOS_RETENCION,
  type EntradaReteica,
  type EntradaRetencion,
  esquemaReteica,
  esquemaRetencion,
  TIPOS_RETENCION,
} from "../schemas"
import type { ReteicaMunicipal, Retencion } from "../tipos"
import {
  coincideReteica,
  estadoFilaTributaria,
  ordenarPorVigencia,
  ordenarReteica,
} from "../tributario"
import { decimalesPorcentaje } from "../valores"
import { textoVigenciaDias } from "../vigencias"
import { Bloque } from "./bloque"
import { CampoCifra, CampoFecha, CampoInterruptor, CampoSelect } from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { InsigniaPendiente, InsigniaVigencia } from "./insignias"
import { SelectorMunicipio } from "./selector-municipio"
import { useEnvio } from "./use-envio"

const CAMPOS_RETENCION = [
  "tipo",
  "concepto",
  "tarifa",
  "baseMinimaUvt",
  "desde",
  "hasta",
] as const satisfies readonly (keyof EntradaRetencion)[]

const CAMPOS_RETEICA = [
  "municipioCodigo",
  "tarifaPorMil",
  "baseMinimaUvt",
  "desde",
  "hasta",
] as const satisfies readonly (keyof EntradaReteica)[]

/** "Desde 27 UVT ($ 1.414.098)" · "Sin base mínima". */
function textoBase(baseUvt: number, uvt: number | null): string {
  if (baseUvt === 0) return "Sin base mínima"
  const pesos = uvt !== null ? ` (${formatearCOP(baseUvt * uvt)})` : ""
  return `Desde ${formatearNumero(baseUvt, 2)} UVT${pesos}`
}

/** Ayuda del campo «Base mínima» mientras se escribe. */
function ayudaBase(baseUvt: number | null, uvt: number | null): string {
  if (baseUvt === 0) return "Sin base mínima: se retiene desde el primer peso."
  if (baseUvt !== null && uvt !== null) {
    return `${formatearCOP(baseUvt * uvt)} con la UVT de este año. Los pagos por debajo no tienen retención.`
  }
  return "Los pagos por debajo no tienen retención."
}

function tarifaPorcentaje(fraccion: number): string {
  return formatearPorcentaje(
    fraccion,
    Math.max(decimalesPorcentaje(fraccion), fraccion < 0.01 ? 3 : 0)
  )
}

function AccionesFila({
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

// ── Retenciones ─────────────────────────────────────────────────────────────

/** Retención en la fuente, ReteIVA y ReteICA general por concepto y condición de declarante. */
export function Retenciones({
  retenciones,
  uvt,
}: {
  retenciones: readonly Retencion[]
  /** UVT del año en curso (para expresar bases en pesos). */
  uvt: number | null
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegida, setElegida] = useState<Retencion | null>(null)
  const [abierta, setAbierta] = useState(false)
  const ordenadas = ordenarPorVigencia(retenciones)

  function abrir(retencion: Retencion | null) {
    setElegida(retencion)
    setAbierta(true)
  }

  return (
    <Bloque
      id="retenciones"
      titulo="Retenciones"
      descripcion="Tarifas y bases mínimas que aplican las liquidaciones a los pagos de los medios."
      icono={ReceiptText}
      acciones={
        permisos.tributario ? (
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Nueva retención
          </Button>
        ) : null
      }
    >
      {ordenadas.length === 0 ? (
        <EstadoVacio
          icono={ReceiptText}
          variante="simple"
          titulo="Sin retenciones configuradas"
          descripcion="Las liquidaciones no aplicarán retenciones hasta que el contador las defina aquí."
          className="py-8"
        >
          {permisos.tributario ? (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus data-icon="inline-start" aria-hidden />
              Agregar la primera
            </Button>
          ) : null}
        </EstadoVacio>
      ) : (
        <ul className="flex flex-col divide-y">
          {ordenadas.map((retencion) => {
            const estado = estadoFilaTributaria(retencion)
            const titulo = `${NOMBRES_RETENCION[retencion.tipo]} · ${NOMBRES_CONCEPTO[retencion.concepto] ?? retencion.concepto}`
            return (
              <li
                key={retencion.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:gap-4 sm:px-5",
                  estado === "FINALIZADA" && "text-muted-foreground"
                )}
              >
                {/* En móvil el texto ocupa la fila y debajo van tarifa y acciones juntas. */}
                <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {titulo}
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                      {retencion.aplicaDeclarante
                        ? "Declarante"
                        : "No declarante"}
                    </span>
                    <InsigniaVigencia estado={estado} />
                    {retencion.pendienteValidacion &&
                    estado !== "FINALIZADA" ? (
                      <InsigniaPendiente compacta />
                    ) : null}
                  </span>
                  <span className="text-xs cifras text-muted-foreground">
                    {textoBase(retencion.baseMinimaUvt, uvt)} ·{" "}
                    {textoVigenciaDias(
                      retencion.vigenteDesde,
                      retencion.vigenteHasta
                    )}
                  </span>
                </div>
                <span className="text-lg font-semibold cifras sm:text-right">
                  {tarifaPorcentaje(retencion.tarifa)}
                </span>
                <AccionesFila
                  titulo={titulo}
                  editable={permisos.tributario}
                  onEditar={() => abrir(retencion)}
                  onHistorial={
                    abrirHistorial
                      ? () =>
                          abrirHistorial({
                            entidad: "retenciones_config",
                            entidadId: retencion.id,
                            titulo,
                          })
                      : null
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={ReceiptText}
        titulo={elegida ? "Editar retención" : "Nueva retención"}
        descripcion="Las vigencias del mismo tipo, concepto y condición no pueden cruzarse."
      >
        <FormularioRetencion retencion={elegida} uvt={uvt} />
      </HojaLateral>
    </Bloque>
  )
}

function FormularioRetencion({
  retencion,
  uvt,
}: {
  retencion: Retencion | null
  uvt: number | null
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaRetencion),
    defaultValues: valoresRetencion(retencion),
    mode: "onTouched",
  })
  const { control } = formulario
  const [textoBaseUvt, desde] = useWatch({
    control,
    name: ["baseMinimaUvt", "desde"],
  })
  const base = textoANumero(String(textoBaseUvt ?? ""))
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarRetencion,
    campos: CAMPOS_RETENCION,
    onExito: () => {
      toast.success(retencion ? "Retención actualizada" : "Retención creada")
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
        textoEnviar={retencion ? "Guardar cambios" : "Crear retención"}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            nombre="tipo"
            etiqueta="Tipo"
            opciones={TIPOS_RETENCION.map((t) => ({
              valor: t,
              etiqueta: NOMBRES_RETENCION[t],
            }))}
            deshabilitado={pendiente}
          />
          <CampoSelect
            nombre="concepto"
            etiqueta="Concepto"
            opciones={CONCEPTOS_RETENCION.map((c) => ({
              valor: c,
              etiqueta: NOMBRES_CONCEPTO[c] ?? c,
            }))}
            deshabilitado={pendiente}
          />
        </div>
        <Controller
          control={control}
          name="aplicaDeclarante"
          render={({ field }) => (
            <Field>
              <FieldLabel>Aplica a</FieldLabel>
              <ControlSegmentado
                etiqueta="Condición del medio"
                opciones={[
                  { valor: "si", etiqueta: "Declarantes de renta" },
                  { valor: "no", etiqueta: "No declarantes" },
                ]}
                valor={field.value ? "si" : "no"}
                onCambio={(valor) => field.onChange(valor === "si")}
              />
              <FieldDescription>
                La tarifa suele ser distinta para cada caso.
              </FieldDescription>
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCifra
            nombre="tarifa"
            etiqueta="Tarifa"
            sufijo="%"
            decimal
            placeholder="11"
            deshabilitado={pendiente}
            descripcion="Hasta 4 decimales (0,966)."
          />
          <CampoCifra
            nombre="baseMinimaUvt"
            etiqueta="Base mínima"
            sufijo="UVT"
            decimal
            deshabilitado={pendiente}
            descripcion={ayudaBase(base, uvt)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoFecha
            nombre="desde"
            etiqueta="Vigente desde"
            deshabilitado={pendiente}
          />
          <CampoFecha
            nombre="hasta"
            etiqueta="Hasta (inclusive)"
            opcional
            minimo={typeof desde === "string" ? desde : undefined}
            placeholder="Sin fecha de fin"
            deshabilitado={pendiente}
          />
        </div>
        <CampoInterruptor
          nombre="pendienteValidacion"
          etiqueta="Pendiente de validación con el contador"
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}

// ── ReteICA municipal ───────────────────────────────────────────────────────

function porMil(valor: number): string {
  return `${formatearNumero(valor, 4)} ‰`
}

/** Filas que se muestran de entrada y cuántas agrega cada «Ver más». */
const PAGINA_RETEICA = 10

/** Tarifa de ReteICA de cada municipio (por mil), con su vigencia. */
export function ReteicaMunicipios({
  reteica,
  uvt,
}: {
  reteica: readonly ReteicaMunicipal[]
  uvt: number | null
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegida, setElegida] = useState<ReteicaMunicipal | null>(null)
  const [abierta, setAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [limite, setLimite] = useState(PAGINA_RETEICA)
  const texto = normalizarNombreGeo(busqueda)
  // Con un centenar de municipios la lista solo sirve si se puede buscar y
  // sale en orden alfabético; de entrada se ve una página corta.
  const ordenadas = ordenarReteica(reteica).filter((fila) =>
    coincideReteica(fila, texto, normalizarNombreGeo)
  )
  const visibles = ordenadas.slice(0, limite)

  function abrir(fila: ReteicaMunicipal | null) {
    setElegida(fila)
    setAbierta(true)
  }

  return (
    <Bloque
      id="reteica"
      titulo="ReteICA municipal"
      descripcion="Tarifa por mil de cada municipio. Qué municipio aplica lo decide «Municipio base de ReteICA»."
      icono={MapPinned}
      acciones={
        permisos.tributario ? (
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Agregar municipio
          </Button>
        ) : null
      }
    >
      {reteica.length === 0 ? (
        <EstadoVacio
          icono={MapPinned}
          variante="simple"
          titulo="Sin tarifas municipales"
          descripcion="Agrega la tarifa de los municipios donde operan los medios o del domicilio de AMO."
          className="py-8"
        >
          {permisos.tributario ? (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus data-icon="inline-start" aria-hidden />
              Agregar el primero
            </Button>
          ) : null}
        </EstadoVacio>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <InputGroup className="sm:max-w-72">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={busqueda}
                onChange={(evento) => {
                  setBusqueda(evento.target.value)
                  setLimite(PAGINA_RETEICA)
                }}
                placeholder="Buscar municipio o departamento…"
                aria-label="Buscar en las tarifas de ReteICA"
              />
            </InputGroup>
            <p role="status" className="text-xs cifras text-muted-foreground">
              {texto
                ? `${pluralizar(ordenadas.length, "coincidencia", "coincidencias")} de ${formatearNumero(reteica.length)}`
                : pluralizar(reteica.length, "tarifa", "tarifas")}
            </p>
          </div>
          {ordenadas.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Ningún municipio coincide con «{busqueda.trim()}».
            </p>
          ) : null}
          <ul
            className={cn(
              "flex flex-col divide-y",
              ordenadas.length === 0 && "hidden"
            )}
          >
            {visibles.map((fila) => {
              const estado = estadoFilaTributaria(fila)
              const titulo = `ReteICA de ${fila.municipioNombre}`
              return (
                <li
                  key={fila.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:gap-4 sm:px-5",
                    estado === "FINALIZADA" && "text-muted-foreground"
                  )}
                >
                  <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {fila.municipioNombre}
                      {fila.departamentoNombre ? (
                        <span className="font-normal text-muted-foreground">
                          · {fila.departamentoNombre}
                        </span>
                      ) : null}
                      <InsigniaVigencia estado={estado} />
                      {fila.pendienteValidacion && estado !== "FINALIZADA" ? (
                        <InsigniaPendiente compacta />
                      ) : null}
                    </span>
                    <span className="text-xs cifras text-muted-foreground">
                      {textoBase(fila.baseMinimaUvt, uvt)} ·{" "}
                      {textoVigenciaDias(fila.vigenteDesde, fila.vigenteHasta)}
                    </span>
                  </div>
                  <span className="text-lg font-semibold cifras sm:text-right">
                    {porMil(fila.tarifaPorMil)}
                  </span>
                  <AccionesFila
                    titulo={titulo}
                    editable={permisos.tributario}
                    onEditar={() => abrir(fila)}
                    onHistorial={
                      abrirHistorial
                        ? () =>
                            abrirHistorial({
                              entidad: "reteica_municipal",
                              entidadId: fila.id,
                              titulo,
                            })
                        : null
                    }
                  />
                </li>
              )
            })}
          </ul>
          {ordenadas.length > visibles.length ? (
            <div className="border-t px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimite((n) => n + 25)}
              >
                Ver {Math.min(25, ordenadas.length - visibles.length)} más de{" "}
                {formatearNumero(ordenadas.length)}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={MapPinned}
        titulo={
          elegida
            ? `ReteICA de ${elegida.municipioNombre}`
            : "Agregar tarifa municipal"
        }
        descripcion="Las vigencias de un mismo municipio no pueden cruzarse."
      >
        <FormularioReteica fila={elegida} uvt={uvt} />
      </HojaLateral>
    </Bloque>
  )
}

function FormularioReteica({
  fila,
  uvt,
}: {
  fila: ReteicaMunicipal | null
  uvt: number | null
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaReteica),
    defaultValues: valoresReteica(fila),
    mode: "onTouched",
  })
  const { control } = formulario
  const [etiquetaMunicipio, setEtiquetaMunicipio] = useState<string | null>(
    fila
      ? `${fila.municipioNombre}${fila.departamentoNombre ? ` · ${fila.departamentoNombre}` : ""}`
      : null
  )
  const [textoBaseUvt, desde] = useWatch({
    control,
    name: ["baseMinimaUvt", "desde"],
  })
  const base = textoANumero(String(textoBaseUvt ?? ""))
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarReteica,
    campos: CAMPOS_RETEICA,
    onExito: () => {
      toast.success(fila ? "Tarifa actualizada" : "Tarifa agregada", {
        description: etiquetaMunicipio ?? undefined,
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
        textoEnviar={fila ? "Guardar cambios" : "Agregar"}
      >
        <Controller
          control={control}
          name="municipioCodigo"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="reteica-municipio">Municipio</FieldLabel>
              <SelectorMunicipio
                id="reteica-municipio"
                valor={field.value}
                etiqueta={etiquetaMunicipio}
                invalido={fieldState.invalid}
                deshabilitado={pendiente}
                onCambio={(municipio) => {
                  setEtiquetaMunicipio(
                    `${municipio.nombre} · ${municipio.departamento}`
                  )
                  field.onChange(municipio.codigo)
                  field.onBlur()
                }}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCifra
            nombre="tarifaPorMil"
            etiqueta="Tarifa"
            sufijo="por mil"
            decimal
            placeholder="9,66"
            deshabilitado={pendiente}
            descripcion="Entre 0 y 20 por mil."
          />
          <CampoCifra
            nombre="baseMinimaUvt"
            etiqueta="Base mínima"
            sufijo="UVT"
            decimal
            deshabilitado={pendiente}
            descripcion={ayudaBase(base, uvt)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoFecha
            nombre="desde"
            etiqueta="Vigente desde"
            deshabilitado={pendiente}
          />
          <CampoFecha
            nombre="hasta"
            etiqueta="Hasta (inclusive)"
            opcional
            minimo={typeof desde === "string" ? desde : undefined}
            placeholder="Sin fecha de fin"
            deshabilitado={pendiente}
          />
        </div>
        <CampoInterruptor
          nombre="pendienteValidacion"
          etiqueta="Pendiente de validación con el contador"
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
