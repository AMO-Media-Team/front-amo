import { render, screen } from "@testing-library/react"
import { Wallet } from "lucide-react"
import { describe, expect, it } from "vitest"

import { definicionKpi } from "./definiciones-kpi"
import { EsqueletoRejillaKpi, RejillaKpi } from "./rejilla-kpi"
import { TarjetaKpi } from "./tarjeta-kpi"

const plano = (texto: string | null) =>
  (texto ?? "").replace(/[\u00a0\u202f]/g, " ")

describe("TarjetaKpi", () => {
  it("muestra la cifra completa para lectores y la variación descrita", () => {
    render(
      <TarjetaKpi
        titulo="GMV verificado"
        valor={184_320_000}
        valorAnterior={150_000_000}
        variacion={0.2288}
        unidad="COP"
        serie={[1, 3, 2, 5]}
        icono={Wallet}
      />
    )
    const tarjeta = screen.getByRole("article")
    expect(
      screen.getByRole("heading", { name: "GMV verificado" })
    ).toBeInTheDocument()
    expect(plano(tarjeta.textContent)).toContain("($ 184.320.000)")
    expect(plano(tarjeta.textContent)).toContain(
      "Subió 22,9% frente al periodo anterior (antes $ 150.000.000)."
    )
    expect(screen.getByText("vs. periodo anterior")).toBeInTheDocument()
    // Sparkline decorativa: oculta a la tecnología de asistencia.
    expect(tarjeta.querySelector("svg[aria-hidden='true'] path")).not.toBeNull()
  })

  it("sin valor por muestra insuficiente lo explica con n", () => {
    render(
      <TarjetaKpi
        titulo="Tasa de cumplimiento"
        valor={null}
        unidad="%"
        n={7}
        nMinimo={20}
      />
    )
    expect(screen.getByText("Muestra insuficiente")).toBeInTheDocument()
    expect(screen.getByText("n = 7 · se necesitan 20")).toBeInTheDocument()
  })

  it("con valor pero n pequeño avisa sin ocultar la cifra", () => {
    render(
      <TarjetaKpi
        titulo="Tasa de llenado"
        valor={0.72}
        valorAnterior={0.7}
        unidad="%"
        n={7}
        nMinimo={20}
      />
    )
    expect(screen.getByText("n = 7 · muestra pequeña")).toBeInTheDocument()
    // La variación se informa en tono neutro: con n chico no es una mejora.
    expect(screen.getByText("+2,0 pp").parentElement).toHaveClass("bg-muted")
  })

  it("sin datos en el periodo muestra una raya", () => {
    render(<TarjetaKpi titulo="Medios nuevos" valor={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("Sin datos en el periodo")).toBeInTheDocument()
  })

  it("un indicador a fecha de corte dice qué falta, no «en el periodo»", () => {
    render(
      <TarjetaKpi
        titulo="Saldo vencido"
        valor={null}
        unidad="COP"
        textoSinDatos="Sin saldo a la fecha de corte"
      />
    )
    expect(
      screen.getByText("Sin saldo a la fecha de corte")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Sin datos en el periodo")
    ).not.toBeInTheDocument()
  })

  it("sin comparativo muestra por qué no se compara, sin variación ni «Nuevo»", () => {
    render(
      <TarjetaKpi
        titulo="Cuentas sin verificación en dos pasos"
        valor={12}
        valorAnterior={null}
        sinComparativo="Foto de hoy"
      />
    )
    const tarjeta = screen.getByRole("article")
    expect(screen.getByText("Foto de hoy")).toBeInTheDocument()
    expect(screen.queryByText("Nuevo")).not.toBeInTheDocument()
    expect(screen.queryByText("vs. periodo anterior")).not.toBeInTheDocument()
    expect(plano(tarjeta.textContent)).not.toMatch(/frente al periodo anterior/)
  })

  it("sin comparativo y con muestra pequeña anota el n junto al rótulo", () => {
    render(
      <TarjetaKpi
        titulo="Tasa de ingreso"
        valor={0.5}
        unidad="%"
        n={4}
        nMinimo={20}
        sinComparativo="Foto de hoy"
      />
    )
    expect(screen.getByText("Foto de hoy · n = 4")).toBeInTheDocument()
  })

  it("el ícono de ayuda abre la definición del KPI", () => {
    const definicion = definicionKpi("gmv_verificado")
    render(
      <TarjetaKpi
        titulo="GMV verificado"
        valor={10}
        unidad="COP"
        definicion={definicion}
      />
    )
    expect(
      screen.getByRole("button", { name: "Qué es GMV verificado" })
    ).toBeInTheDocument()
  })

  it("con enlace toda la tarjeta navega al detalle y dibuja el foco del teclado", () => {
    render(<TarjetaKpi titulo="Medios activos" valor={12} href="/inicio" />)
    expect(
      screen.getByRole("link", { name: "Medios activos" })
    ).toHaveAttribute("href", "/inicio")
    // El enlace no pinta su contorno: lo hace la tarjeta con el anillo de marca.
    expect(screen.getByRole("article")).toHaveClass(
      "has-[a:focus-visible]:anillo-foco"
    )
  })
})

describe("RejillaKpi", () => {
  it("agrupa las tarjetas con un nombre accesible", () => {
    render(
      <RejillaKpi etiqueta="Indicadores del periodo">
        <TarjetaKpi titulo="Uno" valor={1} />
        <TarjetaKpi titulo="Dos" valor={2} />
      </RejillaKpi>
    )
    expect(
      screen.getByRole("region", { name: "Indicadores del periodo" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(2)
  })

  it("el esqueleto anuncia la carga de cada tarjeta", () => {
    render(<EsqueletoRejillaKpi cantidad={3} />)
    expect(screen.getAllByRole("status")).toHaveLength(3)
  })
})
