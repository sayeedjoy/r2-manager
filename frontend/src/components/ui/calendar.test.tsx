import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Calendar } from "./calendar"

describe("Calendar", () => {
  it("navigates with the Select month and year dropdowns", async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    render(
      <Calendar
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 8, 1)}
        startMonth={new Date(2020, 0, 1)}
        endMonth={new Date(2026, 11, 1)}
        onMonthChange={onMonthChange}
      />
    )

    // No native <select> is left behind for the browser to draw.
    expect(document.querySelector("select")).toBeNull()

    await user.click(screen.getByRole("combobox", { name: /month/i }))
    await user.click(await screen.findByRole("option", { name: "Mar" }))
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 2, 1))

    await user.click(screen.getByRole("combobox", { name: /year/i }))
    await user.click(await screen.findByRole("option", { name: "2023" }))
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2023, 2, 1))
  })
})
