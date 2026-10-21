"use client"

import {
  ChevronsDownUp,
  ChevronsUpDown,
  Crown,
  Info,
  Lock,
  SearchX,
  TriangleAlert,
  UserLock,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { useEsApple } from "@/components/layout/use-plataforma"
import { NumeroAnimado } from "@/components/motion/numero-animado"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  CLAVES_PERMISO,
  type ClavePermiso,
  PERMISOS,
} from "@/lib/auth/permisos"

import { guardarPermisosRol } from "../actions"
import {
  alternarGrupo,
  calcularDiff,
  catalogoPorArea,
  coincideBusqueda,
  contarSensibles,
  totalCambios,
} from "../catalogo"
import { pluralizar, TIPOS_ROL_ETIQUETA } from "../presentacion"
import {
  esAplicable,
  type MotivoSoloLectura,
  noAplicables,
  puedeOtorgar,
  totalAplicables,
} from "../reglas"
import type { ActorRoles, RolListado, TipoRol } from "../tipos"
import { BarraCambios } from "./barra-cambios"
import { CampoBusqueda } from "./campo-busqueda"
import { useInformarCambios } from "./contexto-cambios"
import { ControlSegmentado } from "./control-segmentado"
import { DialogoRevision } from "./dialogo-revision"
import { BarraCobertura } from "./distintivos-rol"
import type { CambioPermiso } from "./fila-permiso"
import { ModuloPermisos } from "./modulo-permisos"
import { useGuardiaSalida } from "./use-guardia-salida"

type Filtro = "todos" | "otorgados" | "sin_otorgar" | "sensibles"

/** Permisos de cada módulo dentro del universo del rol (contadores y "seleccionar todo"). */
function permisosPorModulo(
  universo: ReadonlySet<ClavePermiso>
): Map<string, ClavePermiso[]> {
  return new Map(
    catalogoPorArea((clave) => universo.has(clave))
      .flatMap((area) => area.modulos)
      .map((modulo) => [modulo.modulo, modulo.permisos] as const)
  )
}

const AVISOS: Readonly<
  Record<
    MotivoSoloLectura,
    { Icono: typeof Lock; titulo: string; texto: string }
  >
> = {
  superadmin: {
    Icono: Crown,
    titulo: "El superadministrador tiene todos los permisos",
    texto:
      "Recibe automáticamente cada permiso nuevo del catálogo. No se puede recortar: para un acceso amplio pero limitado, duplica el rol Administrador.",
  },
  sistema: {
    Icono: Lock,
    titulo: "Rol de sistema: solo lectura",
    texto:
      "Sus permisos vienen con la plataforma y solo cambian con una actualización. Si necesitas una variante, duplícalo y ajusta la copia.",
  },
  "sin-permiso": {
    Icono: Lock,
    titulo: "Solo lectura",
    texto:
      "Para cambiar permisos necesitas «Crear, editar y eliminar roles personalizados». Pídeselo a un administrador.",
  },
  propio: {
    Icono: UserLock,
    titulo: "Es tu propio rol",
    texto:
      "Nadie puede cambiar los permisos de su propio rol: así nadie se otorga más acceso a sí mismo. Pide a otra persona con este permiso que lo haga.",
  },
}

const PORTAL: Readonly<Record<Exclude<TipoRol, "ADMIN">, string>> = {
  ANUNCIANTE: "del portal de anunciantes",
  MEDIO: "del portal de medios",
}

/** Por qué la matriz de un rol externo ofrece solo algunos permisos. */
function AvisoExterno({
  tipo,
  ajenos,
}: {
  tipo: Exclude<TipoRol, "ADMIN">
  /** Permisos internos que el rol ya tiene (solo se pueden retirar). */
  ajenos: number
}) {
  if (ajenos > 0) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>
          {pluralizar(
            ajenos,
            "permiso no corresponde",
            "permisos no corresponden"
          )}{" "}
          a un rol de tipo «{TIPOS_ROL_ETIQUETA[tipo]}»
        </AlertTitle>
        <AlertDescription>
          Los permisos del equipo interno le abren datos de toda la plataforma,
          no solo los de su organización. Retíralos y guarda los cambios.
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert className="border-info/40 bg-info/8">
      <Info className="text-info" aria-hidden />
      <AlertDescription>
        Un rol de tipo «{TIPOS_ROL_ETIQUETA[tipo]}» solo admite los permisos{" "}
        {PORTAL[tipo]}, que alcanzan únicamente los datos de su propia
        organización. Los del equipo interno no se ofrecen.
      </AlertDescription>
    </Alert>
  )
}

function ResumenMatriz({
  marcados,
  total,
  interno,
  sensibles,
  color,
}: {
  marcados: number
  /** Permisos que el rol admite (todo el catálogo si es interno). */
  total: number
  interno: boolean
  sensibles: number
  color: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="flex items-baseline gap-1.5">
          <span className="font-heading text-2xl leading-none font-semibold tracking-tight">
            <NumeroAnimado valor={marcados} />
          </span>
          <span className="text-sm text-muted-foreground">
            de {total}{" "}
            {interno
              ? "permisos del catálogo"
              : "permisos disponibles para su tipo"}
          </span>
        </p>
        <BarraCobertura cantidad={marcados} total={total} color={color} />
      </div>
      <dl className="flex gap-6 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Sensibles ★</dt>
          <dd className="font-semibold cifras">{sensibles}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Cobertura</dt>
          <dd className="font-semibold cifras">
            {Math.min(100, Math.round((marcados / total) * 100))}%
          </dd>
        </div>
      </dl>
    </div>
  )
}

export type RolMatriz = Pick<
  RolListado,
  "id" | "nombre" | "tipo" | "color" | "permisos" | "usuarios"
>

/**
 * Matriz de permisos de un rol: áreas → módulos → interruptores, con
 * búsqueda, filtros, "seleccionar todo el módulo", marca de sensibles y
 * anti-escalada (lo que el actor no tiene queda bloqueado con explicación).
 * Los cambios se acumulan en local; la barra pegajosa ofrece descartar o
 * revisar el diff antes de guardarlo, y una guardia avisa al salir.
 */
export function MatrizPermisos({
  rol,
  actor,
  motivo,
}: {
  rol: RolMatriz
  actor: ActorRoles
  motivo: MotivoSoloLectura | null
}) {
  const router = useRouter()
  const esApple = useEsApple()
  const informarCambios = useInformarCambios()
  const editable = motivo === null

  // Tras guardar, `refresh()` trae los permisos nuevos: se adoptan como base.
  const firma = rol.permisos.join(",")
  const [firmaBase, setFirmaBase] = useState(firma)
  const [seleccion, setSeleccion] = useState<ReadonlySet<ClavePermiso>>(
    () => new Set(rol.permisos)
  )
  if (firma !== firmaBase) {
    setFirmaBase(firma)
    setSeleccion(new Set(rol.permisos))
  }

  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [contraidos, setContraidos] = useState<ReadonlySet<string>>(new Set())
  const [revisando, setRevisando] = useState(false)
  const [destino, setDestino] = useState<string | null>(null)

  const original = useMemo(() => new Set<string>(rol.permisos), [rol.permisos])
  // Lo que el tipo del rol admite, más lo que ya tenga aunque no lo admita
  // (debe verse para poder retirarlo).
  const universo = useMemo(
    () =>
      new Set(
        CLAVES_PERMISO.filter(
          (clave) => esAplicable(rol.tipo, clave) || original.has(clave)
        )
      ),
    [rol.tipo, original]
  )
  const porModulo = useMemo(() => permisosPorModulo(universo), [universo])
  const ajenos = noAplicables(rol.tipo, rol.permisos).length
  const diff = useMemo(
    () => calcularDiff(rol.permisos, seleccion),
    [rol.permisos, seleccion]
  )
  const cambios = totalCambios(diff)

  const puedeTocar = useCallback(
    (clave: ClavePermiso) =>
      editable && universo.has(clave) && puedeOtorgar(actor, clave),
    [editable, universo, actor]
  )
  const esAjeno = useCallback(
    (clave: ClavePermiso) => !esAplicable(rol.tipo, clave),
    [rol.tipo]
  )
  const cambioDe = useCallback(
    (clave: ClavePermiso): CambioPermiso => {
      if (original.has(clave) === seleccion.has(clave)) return null
      return seleccion.has(clave) ? "agregado" : "quitado"
    },
    [original, seleccion]
  )

  useGuardiaSalida(cambios > 0, setDestino)
  useEffect(() => informarCambios(cambios), [cambios, informarCambios])

  // ⌘S / Ctrl+S abre la revisión en lugar de "guardar página" del navegador.
  useEffect(() => {
    if (cambios === 0) return
    function alPulsar(evento: KeyboardEvent) {
      if (
        (evento.metaKey || evento.ctrlKey) &&
        evento.key.toLowerCase() === "s"
      ) {
        evento.preventDefault()
        setRevisando(true)
      }
    }
    window.addEventListener("keydown", alPulsar)
    return () => window.removeEventListener("keydown", alPulsar)
  }, [cambios])

  function visible(clave: ClavePermiso): boolean {
    if (!universo.has(clave) || !coincideBusqueda(clave, busqueda)) return false
    const cambiado = cambioDe(clave) !== null
    switch (filtro) {
      case "otorgados":
        return seleccion.has(clave) || cambiado
      case "sin_otorgar":
        return !seleccion.has(clave) || cambiado
      case "sensibles":
        return PERMISOS[clave].esSensible
      case "todos":
        return true
    }
  }

  const areas = catalogoPorArea(visible)
  const modulosVisibles = areas.flatMap((area) =>
    area.modulos.map((m) => m.modulo)
  )
  const todosContraidos =
    modulosVisibles.length > 0 &&
    modulosVisibles.every((m) => contraidos.has(m))

  function alternar(clave: ClavePermiso) {
    if (!puedeTocar(clave)) return
    setSeleccion((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(clave)) siguiente.delete(clave)
      else siguiente.add(clave)
      return siguiente
    })
  }

  // "Todos" no toca los permisos que el tipo no admite: esos solo se retiran uno a uno.
  function alternarModulo(permisos: readonly ClavePermiso[]) {
    setSeleccion((actual) =>
      alternarGrupo(
        actual,
        permisos,
        (clave) => puedeTocar(clave) && !esAjeno(clave)
      )
    )
  }

  function contraer(modulo: string) {
    setContraidos((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(modulo)) siguiente.delete(modulo)
      else siguiente.add(modulo)
      return siguiente
    })
  }

  function descartar() {
    const anterior = seleccion
    setSeleccion(new Set(rol.permisos))
    toast("Cambios descartados", {
      action: { label: "Deshacer", onClick: () => setSeleccion(anterior) },
    })
  }

  async function guardar() {
    const resultado = await guardarPermisosRol({
      rolId: rol.id,
      agregar: diff.agregar,
      quitar: diff.quitar,
    })
    if (resultado.ok) {
      const { agregados, quitados } = resultado.datos
      toast.success("Permisos actualizados", {
        description: [
          agregados > 0 ? pluralizar(agregados, "otorgado", "otorgados") : null,
          quitados > 0 ? pluralizar(quitados, "retirado", "retirados") : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })
    }
    return resultado
  }

  const opcionesFiltro = [
    { valor: "todos", etiqueta: "Todos" },
    { valor: "otorgados", etiqueta: "Otorgados", cantidad: seleccion.size },
    {
      valor: "sin_otorgar",
      etiqueta: "Sin otorgar",
      cantidad: universo.size - seleccion.size,
    },
    { valor: "sensibles", etiqueta: "Sensibles ★" },
  ] as const
  const aviso = motivo ? AVISOS[motivo] : null

  return (
    <div className="flex flex-col gap-5">
      {aviso ? (
        <Alert>
          <aviso.Icono aria-hidden />
          <AlertTitle>{aviso.titulo}</AlertTitle>
          <AlertDescription>{aviso.texto}</AlertDescription>
        </Alert>
      ) : null}
      {rol.tipo !== "ADMIN" ? (
        <AvisoExterno tipo={rol.tipo} ajenos={ajenos} />
      ) : null}

      <ResumenMatriz
        marcados={seleccion.size}
        total={totalAplicables(rol.tipo)}
        interno={rol.tipo === "ADMIN"}
        sensibles={contarSensibles([...seleccion])}
        color={rol.color}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CampoBusqueda
          etiqueta="Buscar permisos"
          placeholder="Buscar permisos o módulos"
          valor={busqueda}
          onCambio={setBusqueda}
          className="lg:max-w-80"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ControlSegmentado<Filtro>
            etiqueta="Filtrar permisos"
            opciones={opcionesFiltro}
            valor={filtro}
            onCambio={setFiltro}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setContraidos(
                todosContraidos ? new Set() : new Set(modulosVisibles)
              )
            }
            disabled={modulosVisibles.length === 0}
          >
            {todosContraidos ? (
              <ChevronsUpDown data-icon="inline-start" aria-hidden />
            ) : (
              <ChevronsDownUp data-icon="inline-start" aria-hidden />
            )}
            {todosContraidos ? "Expandir todo" : "Contraer todo"}
          </Button>
        </div>
      </div>

      {areas.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo="Ningún permiso coincide"
          descripcion="Prueba con otra palabra o cambia el filtro."
          className="flex-none py-12"
        >
          <Button
            variant="outline"
            onClick={() => {
              setBusqueda("")
              setFiltro("todos")
            }}
          >
            Limpiar filtros
          </Button>
        </EstadoVacio>
      ) : (
        <div className="flex flex-col gap-8">
          {areas.map((area) => {
            const delArea = area.modulos.flatMap(
              (modulo) => porModulo.get(modulo.modulo) ?? []
            )
            const marcadosArea = delArea.filter((clave) =>
              seleccion.has(clave)
            ).length
            return (
              <section
                key={area.id}
                aria-labelledby={`area-${area.id}`}
                className="flex flex-col gap-3"
              >
                <header className="flex items-end justify-between gap-4 border-b pb-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2
                      id={`area-${area.id}`}
                      className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase"
                    >
                      {area.titulo}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {area.descripcion}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs cifras text-muted-foreground">
                    {marcadosArea}/{delArea.length}
                  </span>
                </header>
                <div className="columns-1 gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
                  {area.modulos.map((modulo) => (
                    <ModuloPermisos
                      key={modulo.modulo}
                      modulo={modulo.modulo}
                      titulo={modulo.titulo}
                      permisos={porModulo.get(modulo.modulo) ?? modulo.permisos}
                      visibles={modulo.permisos}
                      seleccion={seleccion}
                      cambioDe={cambioDe}
                      esAjeno={esAjeno}
                      editable={editable}
                      puedeTocar={puedeTocar}
                      color={rol.color}
                      contraido={contraidos.has(modulo.modulo)}
                      onContraer={contraer}
                      onAlternar={alternar}
                      onAlternarModulo={alternarModulo}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {editable ? (
        <BarraCambios
          agregados={diff.agregar.length}
          quitados={diff.quitar.length}
          atajo={esApple ? "⌘S" : "Ctrl S"}
          onDescartar={descartar}
          onRevisar={() => setRevisando(true)}
        />
      ) : null}

      <DialogoRevision
        abierto={revisando && cambios > 0}
        onAbiertoChange={setRevisando}
        nombreRol={rol.nombre}
        usuarios={rol.usuarios}
        totalFinal={seleccion.size}
        diff={diff}
        onGuardar={guardar}
      />

      <DialogoConfirmacion
        abierto={destino !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setDestino(null)
        }}
        titulo="¿Salir sin guardar?"
        descripcion={`Tienes ${pluralizar(cambios, "cambio", "cambios")} en los permisos de «${rol.nombre}». Si sales ahora, se perderán.`}
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => {
          if (destino) router.push(destino as Route)
        }}
      />
    </div>
  )
}
