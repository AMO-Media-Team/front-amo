/**
 * El catálogo de permisos (`src/lib/auth/permisos.ts`) organizado para la
 * matriz de un rol: áreas → módulos → permisos, búsqueda sin tildes, selección
 * por módulo y el diff entre los permisos guardados y los editados. Módulo puro.
 */
import {
  CLAVES_PERMISO,
  type ClavePermiso,
  esPermisoValido,
  PERMISOS,
} from "@/lib/auth/permisos"
import { MODULOS_PERMISO } from "@/features/usuarios/presentacion"

const ORDEN = new Map<string, number>(
  CLAVES_PERMISO.map((clave, indice) => [clave, indice])
)

function porOrdenDelCatalogo(a: string, b: string): number {
  return (ORDEN.get(a) ?? Infinity) - (ORDEN.get(b) ?? Infinity)
}

/** Solo claves del catálogo, sin repetir y en su orden de presentación. */
export function permisosValidos(claves: Iterable<string>): ClavePermiso[] {
  return [...new Set(claves)].filter(esPermisoValido).sort(porOrdenDelCatalogo)
}

export function contarSensibles(claves: readonly ClavePermiso[]): number {
  return claves.filter((clave) => PERMISOS[clave].esSensible).length
}

export function tituloModulo(modulo: string): string {
  return MODULOS_PERMISO[modulo] ?? modulo
}

// ── Áreas y módulos ──────────────────────────────────────────────────────────

interface DefinicionArea {
  id: string
  titulo: string
  descripcion: string
  modulos: readonly string[]
}

/** Agrupa los módulos como los piensa el negocio (orden de lectura de la matriz). */
const AREAS: readonly DefinicionArea[] = [
  {
    id: "plataforma",
    titulo: "Plataforma",
    descripcion: "Paneles, analítica, reportes y la cuenta propia.",
    modulos: ["inicio", "analitica", "reportes", "notificaciones", "cuenta"],
  },
  {
    id: "administracion",
    titulo: "Administración y seguridad",
    descripcion:
      "Usuarios, roles, auditoría, configuración y datos personales de terceros.",
    modulos: [
      "usuarios",
      "roles",
      "auditoria",
      "accesos",
      "configuracion",
      "datos_sensibles",
    ],
  },
  {
    id: "operacion",
    titulo: "Operación",
    descripcion:
      "Medios, anunciantes, campañas, ofertas y la ejecución de la pauta.",
    modulos: [
      "medios",
      "anunciantes",
      "campanas",
      "ofertas",
      "asignaciones",
      "evidencias",
      "metricas",
      "disputas",
    ],
  },
  {
    id: "finanzas",
    titulo: "Finanzas",
    descripcion: "Liquidaciones a medios, facturación y pagos.",
    modulos: ["liquidaciones", "facturas", "pagos"],
  },
]

const AREA_OTROS: DefinicionArea = {
  id: "otros",
  titulo: "Otros",
  descripcion: "Permisos de módulos nuevos aún sin clasificar.",
  modulos: [],
}

export type ModuloCatalogo = {
  modulo: string
  titulo: string
  permisos: ClavePermiso[]
}

export type AreaCatalogo = {
  id: string
  titulo: string
  descripcion: string
  modulos: ModuloCatalogo[]
}

function modulosDelCatalogo(
  incluir: (clave: ClavePermiso) => boolean
): Map<string, ClavePermiso[]> {
  const modulos = new Map<string, ClavePermiso[]>()
  for (const clave of CLAVES_PERMISO) {
    if (!incluir(clave)) continue
    const { modulo } = PERMISOS[clave]
    modulos.set(modulo, [...(modulos.get(modulo) ?? []), clave])
  }
  return modulos
}

/**
 * Catálogo por áreas y módulos, sin grupos vacíos. `incluir` filtra permisos
 * (búsqueda, "solo otorgados"…). Un módulo que ninguna área declara cae en
 * "Otros", así un permiso nuevo nunca desaparece de la matriz.
 */
export function catalogoPorArea(
  incluir: (clave: ClavePermiso) => boolean = () => true
): AreaCatalogo[] {
  const modulos = modulosDelCatalogo(incluir)
  const declarados = new Set(AREAS.flatMap((area) => area.modulos))
  const otros = [...modulos.keys()].filter((modulo) => !declarados.has(modulo))
  const areas = [...AREAS, { ...AREA_OTROS, modulos: otros }]

  return areas
    .map((area) => ({
      id: area.id,
      titulo: area.titulo,
      descripcion: area.descripcion,
      modulos: area.modulos
        .filter((modulo) => modulos.has(modulo))
        .map((modulo) => ({
          modulo,
          titulo: tituloModulo(modulo),
          permisos: modulos.get(modulo) ?? [],
        })),
    }))
    .filter((area) => area.modulos.length > 0)
}

// ── Búsqueda ─────────────────────────────────────────────────────────────────

/** Minúsculas y sin tildes: "Liquidación" y "liquidacion" coinciden. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .trim()
}

/** Todas las palabras de la búsqueda aparecen en la descripción, la clave o el módulo. */
export function coincideBusqueda(
  clave: ClavePermiso,
  busqueda: string
): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const { descripcion, modulo } = PERMISOS[clave]
  const texto = normalizarBusqueda(
    `${descripcion} ${clave} ${tituloModulo(modulo)}`
  )
  return palabras.every((palabra) => texto.includes(palabra))
}

// ── Selección y diff ─────────────────────────────────────────────────────────

export type EstadoSeleccion = "todos" | "algunos" | "ninguno"

export function estadoSeleccion(
  claves: readonly ClavePermiso[],
  seleccion: ReadonlySet<string>
): EstadoSeleccion {
  const marcados = claves.filter((clave) => seleccion.has(clave)).length
  if (marcados === 0) return "ninguno"
  return marcados === claves.length ? "todos" : "algunos"
}

/**
 * "Seleccionar todo el módulo": si todos los permisos EDITABLES del grupo ya
 * están marcados, los desmarca; si no, los marca. Los que el actor no puede
 * tocar (anti-escalada) conservan su estado.
 */
export function alternarGrupo(
  seleccion: ReadonlySet<ClavePermiso>,
  claves: readonly ClavePermiso[],
  editable: (clave: ClavePermiso) => boolean
): Set<ClavePermiso> {
  const editables = claves.filter(editable)
  const siguiente = new Set(seleccion)
  const todosMarcados = editables.every((clave) => seleccion.has(clave))
  for (const clave of editables) {
    if (todosMarcados) siguiente.delete(clave)
    else siguiente.add(clave)
  }
  return siguiente
}

export type DiffPermisos = {
  agregar: ClavePermiso[]
  quitar: ClavePermiso[]
}

/** Qué cambia entre los permisos guardados y los editados (orden del catálogo). */
export function calcularDiff(
  original: Iterable<string>,
  actual: Iterable<string>
): DiffPermisos {
  const antes = new Set(permisosValidos(original))
  const despues = new Set(permisosValidos(actual))
  return {
    agregar: [...despues].filter((clave) => !antes.has(clave)),
    quitar: [...antes].filter((clave) => !despues.has(clave)),
  }
}

export function totalCambios(diff: DiffPermisos): number {
  return diff.agregar.length + diff.quitar.length
}

/** Diff agrupado por módulo para el diálogo de confirmación. */
export function diffPorModulo(diff: DiffPermisos): {
  modulo: string
  titulo: string
  agregar: ClavePermiso[]
  quitar: ClavePermiso[]
}[] {
  const cambiados = new Set<string>([...diff.agregar, ...diff.quitar])
  return catalogoPorArea((clave) => cambiados.has(clave))
    .flatMap((area) => area.modulos)
    .map(({ modulo, titulo, permisos }) => ({
      modulo,
      titulo,
      agregar: permisos.filter((clave) => diff.agregar.includes(clave)),
      quitar: permisos.filter((clave) => diff.quitar.includes(clave)),
    }))
}
