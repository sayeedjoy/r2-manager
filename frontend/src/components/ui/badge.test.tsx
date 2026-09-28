import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge>Ready</Badge>)

    expect(screen.getByText("Ready")).toBeInTheDocument()
  })
})
