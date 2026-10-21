/**
 * Representación mínima de trazados SVG en coordenadas absolutas.
 * Permite transformar (escala uniforme + traslación) antes de serializar,
 * de modo que los SVG finales salen ya posicionados y sin atributos `transform`.
 */

export type Punto = readonly [x: number, y: number]

export type Comando =
  | { readonly tipo: "M" | "L"; readonly p: Punto }
  | { readonly tipo: "Q"; readonly c: Punto; readonly p: Punto }
  | {
      readonly tipo: "C"
      readonly c1: Punto
      readonly c2: Punto
      readonly p: Punto
    }
  | {
      readonly tipo: "A"
      readonly radio: number
      readonly arcoGrande: boolean
      readonly horario: boolean
      readonly p: Punto
    }
  | { readonly tipo: "Z" }

export type Trazado = readonly Comando[]

export interface Transformacion {
  readonly escala: number
  readonly dx: number
  readonly dy: number
}

export interface Caja {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

const DECIMALES = 2

export function redondear(valor: number, decimales = DECIMALES): number {
  const factor = 10 ** decimales
  const r = Math.round(valor * factor) / factor
  return Object.is(r, -0) ? 0 : r
}

/** Formato compacto: sin ceros sobrantes ni cero inicial (".5", "-.5"). */
export function formatearNumero(valor: number): string {
  const texto = String(redondear(valor))
  return texto.replace(/^(-?)0\./, "$1.")
}

function transformarPunto([x, y]: Punto, t: Transformacion): Punto {
  return [x * t.escala + t.dx, y * t.escala + t.dy]
}

export function transformar(trazado: Trazado, t: Transformacion): Trazado {
  return trazado.map((cmd): Comando => {
    switch (cmd.tipo) {
      case "Z":
        return cmd
      case "M":
      case "L":
        return { tipo: cmd.tipo, p: transformarPunto(cmd.p, t) }
      case "Q":
        return {
          tipo: "Q",
          c: transformarPunto(cmd.c, t),
          p: transformarPunto(cmd.p, t),
        }
      case "C":
        return {
          tipo: "C",
          c1: transformarPunto(cmd.c1, t),
          c2: transformarPunto(cmd.c2, t),
          p: transformarPunto(cmd.p, t),
        }
      case "A":
        return {
          ...cmd,
          radio: cmd.radio * t.escala,
          p: transformarPunto(cmd.p, t),
        }
    }
  })
}

/** Une varios números en la sintaxis más corta que SVG acepta (el signo "-" separa). */
function unirNumeros(valores: readonly number[]): string {
  return valores.reduce<string>((texto, valor, i) => {
    const n = formatearNumero(valor)
    const necesitaEspacio =
      i > 0 &&
      !n.startsWith("-") &&
      !(n.startsWith(".") && /\.\d*$/.test(texto))
    return texto + (necesitaEspacio ? " " : "") + n
  }, "")
}

/**
 * Serializa con comandos relativos. Cada delta se calcula contra la posición
 * ya redondeada para que el error no se acumule a lo largo del trazado.
 */
export function serializar(trazado: Trazado): string {
  let actual: Punto = [0, 0]
  let inicioSubtrazado: Punto = [0, 0]
  let salida = ""
  const rel = (p: Punto): number[] => [
    redondear(p[0]) - actual[0],
    redondear(p[1]) - actual[1],
  ]
  const avanzar = (p: Punto) => {
    actual = [redondear(p[0]), redondear(p[1])]
  }

  trazado.forEach((cmd, indice) => {
    switch (cmd.tipo) {
      case "M": {
        const valores = indice === 0 ? [cmd.p[0], cmd.p[1]] : rel(cmd.p)
        salida += (indice === 0 ? "M" : "m") + unirNumeros(valores)
        avanzar(cmd.p)
        inicioSubtrazado = actual
        break
      }
      case "L":
        salida += "l" + unirNumeros(rel(cmd.p))
        avanzar(cmd.p)
        break
      case "Q":
        salida += "q" + unirNumeros([...rel(cmd.c), ...rel(cmd.p)])
        avanzar(cmd.p)
        break
      case "C":
        salida +=
          "c" + unirNumeros([...rel(cmd.c1), ...rel(cmd.c2), ...rel(cmd.p)])
        avanzar(cmd.p)
        break
      case "A":
        salida +=
          "a" +
          unirNumeros([cmd.radio, cmd.radio, 0]) +
          ` ${cmd.arcoGrande ? 1 : 0} ${cmd.horario ? 1 : 0} ` +
          unirNumeros(rel(cmd.p))
        avanzar(cmd.p)
        break
      case "Z":
        salida += "z"
        actual = inicioSubtrazado
        break
    }
  })
  return salida
}

/** Polígonos que aproximan cada subtrazado (arcos y curvas muestreados). */
export function poligonos(trazado: Trazado): Punto[][] {
  const resultado: Punto[][] = []
  let actual: Punto = [0, 0]
  for (const cmd of trazado) {
    if (cmd.tipo === "Z") continue
    if (cmd.tipo === "M") {
      resultado.push([])
    } else if (cmd.tipo === "A") {
      resultado[resultado.length - 1].push(
        ...muestrearArco(actual, cmd.p, cmd.radio, cmd.arcoGrande, cmd.horario)
      )
    } else if (cmd.tipo === "Q") {
      resultado[resultado.length - 1].push(
        ...muestrearBezier([actual, cmd.c, cmd.p])
      )
    } else if (cmd.tipo === "C") {
      resultado[resultado.length - 1].push(
        ...muestrearBezier([actual, cmd.c1, cmd.c2, cmd.p])
      )
    }
    resultado[resultado.length - 1].push(cmd.p)
    actual = cmd.p
  }
  return resultado
}

const muestrear = (trazado: Trazado): Punto[] => poligonos(trazado).flat()

/**
 * Centroide de área (fórmula del polígono). Los subtrazados con orientación
 * contraria (contraformas) restan área, como en la regla de relleno nonzero.
 */
export function centroide(...trazados: Trazado[]): Punto {
  let area = 0
  let cx = 0
  let cy = 0
  for (const poligono of trazados.flatMap(poligonos)) {
    poligono.forEach(([x0, y0], i) => {
      const [x1, y1] = poligono[(i + 1) % poligono.length]
      const cruz = x0 * y1 - x1 * y0
      area += cruz
      cx += (x0 + x1) * cruz
      cy += (y0 + y1) * cruz
    })
  }
  return [cx / (3 * area), cy / (3 * area)]
}

function muestrearBezier(control: readonly Punto[]): Punto[] {
  const puntos: Punto[] = []
  for (let i = 1; i < 32; i++) {
    let nivel = [...control]
    const t = i / 32
    while (nivel.length > 1) {
      nivel = nivel
        .slice(1)
        .map((p, j) => [
          nivel[j][0] + (p[0] - nivel[j][0]) * t,
          nivel[j][1] + (p[1] - nivel[j][1]) * t,
        ])
    }
    puntos.push(nivel[0])
  }
  return puntos
}

/** Centro de un arco SVG circular (conversión endpoint → center, SVG 1.1 F.6.5). */
export function centroArco(
  desde: Punto,
  hasta: Punto,
  radio: number,
  arcoGrande: boolean,
  horario: boolean
): Punto {
  const mx = (desde[0] + hasta[0]) / 2
  const my = (desde[1] + hasta[1]) / 2
  const dx = (hasta[0] - desde[0]) / 2
  const dy = (hasta[1] - desde[1]) / 2
  const mitadCuerda = Math.hypot(dx, dy)
  const r = Math.max(radio, mitadCuerda)
  const h = Math.sqrt(Math.max(r * r - mitadCuerda * mitadCuerda, 0))
  const signo = arcoGrande === horario ? -1 : 1
  // Perpendicular unitaria a la cuerda, orientada según las banderas.
  const px = (-dy / (mitadCuerda || 1)) * h * signo
  const py = (dx / (mitadCuerda || 1)) * h * signo
  return [mx + px, my + py]
}

function muestrearArco(
  desde: Punto,
  hasta: Punto,
  radio: number,
  arcoGrande: boolean,
  horario: boolean
): Punto[] {
  const c = centroArco(desde, hasta, radio, arcoGrande, horario)
  const a0 = Math.atan2(desde[1] - c[1], desde[0] - c[0])
  let barrido = Math.atan2(hasta[1] - c[1], hasta[0] - c[0]) - a0
  if (horario && barrido < 0) barrido += 2 * Math.PI
  if (!horario && barrido > 0) barrido -= 2 * Math.PI
  const pasos = 180
  return Array.from({ length: pasos }, (_, i) => {
    const a = a0 + (barrido * (i + 1)) / (pasos + 1)
    return [c[0] + radio * Math.cos(a), c[1] + radio * Math.sin(a)] as Punto
  })
}

export function cajaDe(...trazados: Trazado[]): Caja {
  const puntos = trazados.flatMap(muestrear)
  const xs = puntos.map((p) => p[0])
  const ys = puntos.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y }
}
