import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { PasoVerificacion } from "../verificacion"
import { TarjetaVerificacion } from "./tarjeta-verificacion"

const PASOS: PasoVerificacion[] = [
  {
    id: "datos",
    titulo: "Datos de la empresa",
    detalle: "Andina S.A.S. · NIT 900.123.456-8",
    estado: "completo",
    listo: true,
    faltantes: [],
    href: "/empresa#datos" as PasoVerificacion["href"],
  },
  {
    id: "contacto",
    titulo: "Persona de contacto",
    detalle: "A quién le escribimos sobre la verificación y la facturación.",
    estado: "pendiente",
    listo: false,
    faltantes: ["los datos de la persona de contacto"],
    href: "/empresa#contacto" as PasoVerificacion["href"],
  },
  {
    id: "documentos",
    titulo: "Documentos",
    detalle: "Por corregir: RUT.",
    estado: "atencion",
    listo: false,
    faltantes: ["el RUT"],
    href: "/empresa/documentos" as PasoVerificacion["href"],
  },
]

describe("TarjetaVerificacion", () => {
  it("en alta muestra el avance y cada paso enlaza a donde se completa", () => {
    render(
      <TarjetaVerificacion
        situacion={{ tipo: "alta" }}
        pasos={PASOS}
        progreso={{ completos: 1, total: 3, fraccion: 1 / 3 }}
      />
    )
    const tarjeta = screen.getByRole("region", { name: "Verifica tu empresa" })
    expect(
      within(tarjeta).getByText(/^Te faltan 2 pasos para enviarla/)
    ).toBeVisible()
    expect(within(tarjeta).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "1 de 3 pasos listos"
    )
    const contacto = within(tarjeta).getByRole("link", {
      name: /Persona de contacto/,
    })
    expect(contacto).toHaveAttribute("href", "/empresa#contacto")
    expect(within(contacto).getByText("Pendiente")).toBeVisible()
    const documentos = within(tarjeta).getByRole("link", {
      name: /Documentos/,
    })
    expect(documentos).toHaveAttribute("href", "/empresa/documentos")
    expect(within(documentos).getByText("Por corregir")).toBeVisible()
  })

  it("rechazada muestra el motivo del equipo AMO", () => {
    render(
      <TarjetaVerificacion
        situacion={{ tipo: "rechazado", motivo: "RUT ilegible" }}
        pasos={PASOS}
      />
    )
    expect(
      screen.getByRole("region", { name: "Tu verificación no fue aprobada" })
    ).toBeVisible()
    expect(screen.getByText("Motivo del equipo AMO")).toBeVisible()
    expect(screen.getByText("RUT ilegible")).toBeVisible()
  })

  it("en revisión dice desde cuándo y no repite el avance", () => {
    render(
      <TarjetaVerificacion
        situacion={{ tipo: "en-revision", enviadoAt: "2026-10-20T15:00:00Z" }}
        pasos={PASOS}
        progreso={{ completos: 3, total: 3, fraccion: 1 }}
      />
    )
    expect(
      screen.getByRole("region", { name: "Tu empresa está en revisión" })
    ).toBeVisible()
    expect(
      screen.getByText(/La enviaste el 20 de octubre de 2026/)
    ).toBeVisible()
    expect(screen.queryByRole("progressbar")).toBeNull()
  })

  it("suspendida explica las consecuencias y el motivo, sin pasos", () => {
    render(
      <TarjetaVerificacion
        situacion={{ tipo: "suspendido", motivo: "Cartera vencida" }}
      />
    )
    expect(
      screen.getByRole("region", { name: "Tu empresa está suspendida" })
    ).toBeVisible()
    expect(screen.getByText("Cartera vencida")).toBeVisible()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
