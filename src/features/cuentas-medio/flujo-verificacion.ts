/**
 * Pasos de la hoja «Verificar cuenta» (módulo puro): por dónde empieza según
 * lo que ya hay en curso y qué datos trae precargados. El código de la
 * historia solo se ve mientras la página lo conserva en memoria desde que se
 * generó: el servidor no lo vuelve a entregar.
 */
import type { EstadoCuenta } from "./estado-cuenta"
import type { CodigoGenerado, VerificacionCuentaMedio } from "./tipos"

export type PasoVerificacion =
  /** Elegir entre el código en una historia y la captura de estadísticas. */
  | "metodo"
  /** Seguidores de hoy y «Generar código». */
  | "codigo-pedir"
  /** Código (si se conserva), instrucciones y carga de la captura de la historia. */
  | "codigo-captura"
  /** Seguidores y captura del panel de estadísticas. */
  | "manual"

export interface InicioVerificacion {
  paso: PasoVerificacion
  /** El código en pantalla, si es el de la verificación pendiente. */
  codigo: CodigoGenerado | null
  /** Seguidores con que se precarga el formulario (los del último intento). */
  seguidores: number | null
}

/**
 * El código conservado sirve solo para la verificación que lo generó y
 * mientras no venza. Sin verificación en curso es que la página aún no
 * refleja la que se acaba de crear: el código recién recibido vale.
 */
export function codigoVigenteEnPantalla(
  estado: Pick<EstadoCuenta, "enCurso">,
  codigo: CodigoGenerado | null
): CodigoGenerado | null {
  if (!codigo) return null
  const enCurso = estado.enCurso
  if (!enCurso) return codigo
  if (enCurso.tipo === "codigo_vencido") return null
  return enCurso.verificacion.id === codigo.verificacionId ? codigo : null
}

/** Seguidores del intento más reciente (para no volver a escribirlos). */
export function seguidoresPrevios(
  verificaciones: readonly Pick<
    VerificacionCuentaMedio,
    "seguidoresReportados"
  >[]
): number | null {
  return verificaciones[0]?.seguidoresReportados ?? null
}

/**
 * Por dónde se abre la hoja:
 * - sin nada en curso, o con un código que venció → elegir el método;
 * - un código que espera la captura (o una captura de código aún
 *   reemplazable) → cargar la captura de la historia;
 * - una captura de estadísticas en revisión → corregirla.
 */
export function inicioVerificacion(
  estado: Pick<EstadoCuenta, "enCurso">,
  verificaciones: readonly Pick<
    VerificacionCuentaMedio,
    "seguidoresReportados"
  >[],
  codigo: CodigoGenerado | null
): InicioVerificacion {
  const seguidores = seguidoresPrevios(verificaciones)
  const enPantalla = codigoVigenteEnPantalla(estado, codigo)
  const enCurso = estado.enCurso
  if (!enCurso || enCurso.tipo === "codigo_vencido") {
    return { paso: "metodo", codigo: enPantalla, seguidores }
  }
  const { verificacion } = enCurso
  if (verificacion.metodo === "MANUAL") {
    return {
      paso: "manual",
      codigo: null,
      seguidores: verificacion.seguidoresReportados,
    }
  }
  return {
    paso: "codigo-captura",
    codigo: enPantalla,
    seguidores: verificacion.seguidoresReportados,
  }
}

/**
 * ¿El paso admite «Atrás» (al paso desde el que se llegó)? Elegir el método
 * es el principio, y desde la captura del código volver atrás pediría otro
 * código: ahí se ofrece explícitamente («Pedir un código nuevo»).
 */
export function pasoConVuelta(paso: PasoVerificacion): boolean {
  return paso === "codigo-pedir" || paso === "manual"
}

/** Título de la hoja según el paso. */
export function tituloPaso(
  paso: PasoVerificacion,
  reverificar: boolean
): string {
  switch (paso) {
    case "metodo":
      return reverificar ? "Reverificar la cuenta" : "Verificar la cuenta"
    case "codigo-pedir":
      return "Código para tu historia"
    case "codigo-captura":
      return "Publica el código y envía la captura"
    case "manual":
      return "Captura de tus estadísticas"
  }
}
