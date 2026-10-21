/**
 * Usuarios y accesos (`reporte_usuarios_accesos` + `actividad_heatmap` de
 * accesos): uso de la plataforma por persona, fallos, accesos sospechosos y
 * verificación en dos pasos. Módulo puro.
 */
import { parseAsArrayOf } from "nuqs/server"

import { DIAS_SEMANA } from "@/components/charts/datos"
import {
  definirEstadoTabla,
  filtroDeOpciones,
  parseAsBusqueda,
} from "@/components/data-table/estado-url"
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import { ESTADOS_CUENTA } from "@/features/usuarios/presentacion"
import type { HojaExcel } from "@/lib/export/excel"
import { Constants } from "@/types/database.types"

import type { ColumnaReporte } from "../columnas"
import { type EspecGrafico, sinValores } from "../graficos"
import {
  ETIQUETA_CUENTAS_DE_HOY,
  ETIQUETA_FOTO,
  indicador,
  sumar,
} from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosUsuariosAccesos,
  EstadoPerfil,
  FilaUsuarioAcceso,
  NotaDefinicion,
  TotalesAccesos,
  VistaReporte,
} from "../tipos"
import {
  definicionPropia,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  tablaExportable,
} from "./comun"

const ESTADOS = Constants.public.Enums.perfil_estado
const OPCIONES_MFA = ["si", "no"] as const
const OPCIONES_ACTIVIDAD = ["con-ingreso", "sin-ingreso"] as const

export function nombreUsuario(fila: FilaUsuarioAcceso): string {
  return fila.nombre?.trim() || fila.email.split("@")[0] || fila.email
}

export function etiquetaEstado(estado: EstadoPerfil): string {
  return ESTADOS_CUENTA[estado]?.etiqueta ?? estado
}

export function totalesAccesos(
  filas: readonly FilaUsuarioAcceso[]
): TotalesAccesos {
  const activos = filas.filter((f) => f.estado === "ACTIVO")
  return {
    usuariosConIngreso: filas.filter((f) => f.exitosos > 0).length,
    exitosos: sumar(filas, (f) => f.exitosos),
    fallidos: sumar(filas, (f) => f.fallidos),
    sospechosos: sumar(filas, (f) => f.sospechosos),
    activosSinMfa: activos.filter((f) => !f.mfaActivo).length,
    activosSinIngreso: activos.filter((f) => f.exitosos === 0).length,
    activos: activos.length,
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export const columnasUsuariosAccesos: readonly ColumnaReporte<FilaUsuarioAcceso>[] =
  [
    {
      id: "usuario",
      detalle: (f) => f.email,
      titulo: "Usuario",
      tipo: "texto",
      valor: nombreUsuario,
      ordenable: true,
      buscable: true,
      tarjeta: "titulo",
    },
    {
      id: "email",
      titulo: "Correo",
      tipo: "texto",
      valor: (f) => f.email,
      buscable: true,
      ocultaPorDefecto: true,
    },
    {
      id: "rol",
      titulo: "Rol",
      tipo: "texto",
      valor: (f) => f.rol,
      ordenable: true,
      buscable: true,
    },
    {
      id: "estado",
      titulo: "Estado",
      tipo: "texto",
      valor: (f) => etiquetaEstado(f.estado),
      ordenable: true,
      ocultarBajo: "lg",
    },
    {
      id: "ultimoAcceso",
      titulo: "Último acceso",
      tipo: "fechaHora",
      valor: (f) => f.ultimoAccesoAt,
      ordenable: true,
      ocultarBajo: "xl",
    },
    {
      id: "exitosos",
      titulo: "Ingresos",
      tipo: "entero",
      valor: (f) => f.exitosos,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "fallidos",
      titulo: "Fallidos",
      tipo: "entero",
      valor: (f) => f.fallidos,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "paises",
      titulo: "Países",
      tipo: "entero",
      valor: (f) => f.paises,
      ordenable: true,
      ocultarBajo: "lg",
    },
    {
      id: "sospechosos",
      titulo: "Sospechosos",
      tipo: "entero",
      valor: (f) => f.sospechosos,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "mfa",
      titulo: "Dos pasos",
      tipo: "booleano",
      valor: (f) => f.mfaActivo,
      ordenable: true,
    },
  ]

export const facetasUsuariosAccesos: readonly FacetaReporte<FilaUsuarioAcceso>[] =
  [
    {
      clave: "estado",
      titulo: "Estado",
      valor: (f) => f.estado,
      etiqueta: (valor) => etiquetaEstado(valor as EstadoPerfil),
      orden: ESTADOS,
    },
    {
      clave: "rol",
      titulo: "Rol",
      valor: (f) => f.rol,
    },
    {
      clave: "mfa",
      titulo: "Dos pasos",
      valor: (f) => (f.mfaActivo ? "si" : "no"),
      etiqueta: (valor) => (valor === "si" ? "Activa" : "Sin activar"),
      orden: OPCIONES_MFA,
    },
    {
      clave: "actividad",
      titulo: "Actividad",
      valor: (f) => (f.exitosos > 0 ? "con-ingreso" : "sin-ingreso"),
      etiqueta: (valor) =>
        valor === "con-ingreso" ? "Ingresó en el periodo" : "Sin ingresos",
      orden: OPCIONES_ACTIVIDAD,
    },
  ]

export const estadoTablaUsuariosAccesos = definirEstadoTabla({
  camposOrden: [
    "usuario",
    "rol",
    "estado",
    "ultimoAcceso",
    "exitosos",
    "fallidos",
    "paises",
    "sospechosos",
    "mfa",
  ] as const,
  ordenPorDefecto: { campo: "exitosos", descendente: true },
  filtros: {
    estado: filtroDeOpciones(ESTADOS),
    rol: parseAsArrayOf(parseAsBusqueda, ",").withDefault([]),
    mfa: filtroDeOpciones(OPCIONES_MFA),
    actividad: filtroDeOpciones(OPCIONES_ACTIVIDAD),
  },
})

// ── Vista ────────────────────────────────────────────────────────────────────

const DEFINICION_SIN_MFA = definicionPropia(
  "Cuentas sin verificación en dos pasos",
  "conteo",
  "menor",
  {
    definicion:
      "Cuentas activas que no tienen un autenticador (TOTP) verificado.",
    calculo: "Conteo de perfiles activos sin factor TOTP verificado.",
    ancla: "Hoy (foto)",
    nota: "Para los roles internos debería ser cero: la verificación en dos pasos es obligatoria.",
  }
)

const DEFINICION_SIN_INGRESO = definicionPropia(
  "Cuentas activas sin ingresos",
  "conteo",
  "menor",
  {
    definicion:
      "Cuentas activas que no iniciaron sesión ni una vez en el periodo.",
    calculo: "Perfiles activos hoy sin ingresos exitosos en el periodo.",
    ancla: "Fecha del intento de ingreso",
    nota: "Candidatas a revisión: una cuenta que no se usa es un riesgo sin beneficio. No se compara con el periodo anterior porque se cuenta sobre las cuentas de hoy, incluidas las creadas después.",
  }
)

function indicadoresAccesos(datos: DatosUsuariosAccesos) {
  const { totales, anterior } = datos
  return [
    indicador({
      clave: "usuarios_unicos",
      titulo: "Personas que ingresaron",
      actual: totales.usuariosConIngreso,
      anterior: anterior.usuariosConIngreso,
      unidad: "conteo",
      sentido: "mayor",
      definicion: definicionKpi("usuarios_unicos"),
      icono: "usuarios",
    }),
    indicador({
      clave: "accesos_exitosos",
      titulo: "Ingresos exitosos",
      actual: totales.exitosos,
      anterior: anterior.exitosos,
      unidad: "conteo",
      sentido: "neutro",
      definicion: definicionKpi("accesos_exitosos"),
      icono: "ingresos",
    }),
    indicador({
      clave: "accesos_fallidos",
      titulo: "Intentos fallidos",
      actual: totales.fallidos,
      anterior: anterior.fallidos,
      unidad: "conteo",
      sentido: "menor",
      definicion: definicionKpi("accesos_fallidos"),
      icono: "fallos",
    }),
    indicador({
      clave: "accesos_sospechosos",
      titulo: "Accesos sospechosos",
      actual: totales.sospechosos,
      anterior: anterior.sospechosos,
      unidad: "conteo",
      sentido: "menor",
      definicion: definicionKpi("accesos_sospechosos"),
      icono: "alerta",
    }),
    indicador({
      clave: "activos_sin_mfa",
      titulo: "Sin verificación en dos pasos",
      actual: totales.activosSinMfa,
      // El factor es el de hoy: no cambia con el periodo consultado.
      sinComparativo: ETIQUETA_FOTO,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_SIN_MFA,
      icono: "escudo",
    }),
    indicador({
      clave: "activos_sin_ingreso",
      titulo: "Cuentas activas sin ingresos",
      actual: totales.activosSinIngreso,
      // Las cuentas son las de hoy: en el periodo anterior contarían también
      // las que aún no existían, y la baja sería una mejora que no ocurrió.
      sinComparativo: ETIQUETA_CUENTAS_DE_HOY,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_SIN_INGRESO,
      icono: "reloj",
    }),
  ]
}

function graficoActividad(datos: DatosUsuariosAccesos): EspecGrafico {
  return {
    id: "actividad-accesos",
    tipo: "calor",
    titulo: "¿Cuándo ingresan?",
    descripcion:
      "Ingresos exitosos por día de la semana y hora de Colombia. Ayuda a detectar accesos a deshoras.",
    ancho: "completo",
    celdas: datos.actividad,
    unidad: { singular: "ingreso", plural: "ingresos" },
    vacio: sinValores(datos.actividad.map((c) => c.cantidad))
      ? { titulo: "Sin ingresos en el periodo" }
      : false,
  }
}

function graficoMasActivos(datos: DatosUsuariosAccesos): EspecGrafico {
  const elementos = datos.filas
    .filter((f) => f.exitosos > 0)
    .map((f) => ({ id: f.id, nombre: nombreUsuario(f), valor: f.exitosos }))
  return {
    id: "usuarios-activos",
    tipo: "ranking",
    titulo: "Personas con más ingresos",
    ancho: "mitad",
    elementos,
    formato: "numero",
    nombreValor: "Ingresos",
    nombreCategoria: "Usuario",
    limite: 10,
    vacio:
      elementos.length === 0
        ? { titulo: "Nadie ingresó en el periodo" }
        : false,
  }
}

const comparador = new Intl.Collator("es", { sensitivity: "base" })

function graficoPorRol(datos: DatosUsuariosAccesos): EspecGrafico {
  const porRol = new Map<string, number>()
  for (const fila of datos.filas) {
    const rol = fila.rol ?? "Sin rol"
    porRol.set(rol, (porRol.get(rol) ?? 0) + fila.exitosos)
  }
  // Orden por nombre: el color sigue al rol aunque cambie su volumen.
  const segmentos = [...porRol.entries()]
    .sort(([a], [b]) => comparador.compare(a, b))
    .map(([rol, valor]) => ({ id: rol, nombre: rol, valor }))
  return {
    id: "ingresos-rol",
    tipo: "dona",
    titulo: "Ingresos por rol",
    ancho: "mitad",
    segmentos,
    formato: "numero",
    etiquetaTotal: "Ingresos",
    nombreCategoria: "Rol",
    vacio: sinValores(segmentos.map((s) => s.valor))
      ? { titulo: "Sin ingresos en el periodo" }
      : false,
  }
}

export function vistaUsuariosAccesos(
  datos: DatosUsuariosAccesos
): VistaReporte {
  return {
    indicadores: indicadoresAccesos(datos),
    graficos: [
      graficoActividad(datos),
      graficoMasActivos(datos),
      graficoPorRol(datos),
    ],
    hallazgos: [],
    avisos: [],
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasUsuariosAccesos(datos: DatosUsuariosAccesos): HojaExcel[] {
  return [
    {
      nombre: "Actividad por hora",
      titulo: "Ingresos exitosos por día y hora (hora de Colombia)",
      columnas: [
        { titulo: "Día" },
        { titulo: "Hora", formato: "numero" },
        { titulo: "Ingresos", formato: "numero", totalizar: true },
      ],
      filas: datos.actividad.map((celda) => [
        DIAS_SEMANA[celda.diaSemana - 1] ?? String(celda.diaSemana),
        celda.hora,
        celda.cantidad,
      ]),
    },
  ]
}

export const NOTAS_USUARIOS_ACCESOS: readonly NotaDefinicion[] = [
  {
    termino: "Ingresos e intentos fallidos",
    explicacion:
      "Un ingreso es un inicio de sesión correcto. Los intentos fallidos incluyen los hechos con el correo de la persona aunque la contraseña fuera incorrecta y la cuenta no se identificara.",
  },
  {
    termino: "Accesos sospechosos",
    explicacion:
      "Ingresos marcados por las reglas de seguridad: desde un país distinto a los habituales de la plataforma o después de varios intentos fallidos seguidos.",
  },
  {
    termino: "Verificación en dos pasos",
    explicacion:
      "La cuenta tiene un autenticador (código de seis dígitos) verificado. Es obligatoria para los roles internos.",
  },
  {
    termino: "Indicadores sin comparativo",
    explicacion:
      "«Sin verificación en dos pasos» es una foto de hoy: no cambia con el periodo elegido. «Cuentas activas sin ingresos» se cuenta sobre las cuentas activas hoy, así que no se compara con el periodo anterior: incluiría cuentas que entonces no existían.",
  },
  {
    termino: "Último acceso",
    explicacion:
      "El ingreso más reciente de la persona, aunque sea anterior al periodo del reporte.",
  },
  {
    termino: "Correos",
    explicacion:
      "Los correos se muestran enmascarados salvo para quien tiene permiso de ver datos personales.",
  },
  notaComparacion(),
  NOTA_ZONA_HORARIA,
]

export function contenidoUsuariosAccesos(
  datos: DatosUsuariosAccesos
): ContenidoReporte {
  return {
    vista: vistaUsuariosAccesos(datos),
    tabla: tablaExportable(
      "Usuarios y accesos",
      columnasUsuariosAccesos,
      datos.filas
    ),
    hojas: hojasUsuariosAccesos(datos),
    notas: NOTAS_USUARIOS_ACCESOS,
  }
}
