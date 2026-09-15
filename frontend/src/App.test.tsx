import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const validInput = {
  ownerCode: "CSQ",
  category: "U",
  serial: "305438",
  checkDigit: "3",
};

function mockVerifyResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/所有者代码/), validInput.ownerCode);
  await user.type(screen.getByLabelText(/类别/), validInput.category);
  await user.type(screen.getByLabelText(/序列号/), validInput.serial);
  await user.type(screen.getByLabelText(/校验位（/), validInput.checkDigit);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gate verification workflow", () => {
  it("shows only PASS for a matching number", async () => {
    mockVerifyResponse({
      valid: true,
      expected_check_digit: "3",
      actual_check_digit: "3",
      container_number: "CSQU3054383",
    });
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "提交校验" }));

    const verdict = await screen.findByTestId("verdict");
    expect(verdict.textContent).toBe("PASS");
  });

  it("shows FAIL with the actual and the single expected digit", async () => {
    mockVerifyResponse({
      valid: false,
      expected_check_digit: "3",
      actual_check_digit: "8",
      container_number: "CSQU3054388",
    });
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    // Override the check digit field with the wrong one.
    const checkDigitBox = screen.getByLabelText(/校验位（/);
    await user.clear(checkDigitBox);
    await user.type(checkDigitBox, "8");
    await user.click(screen.getByRole("button", { name: "提交校验" }));

    const verdict = await screen.findByTestId("verdict");
    expect(verdict).toHaveTextContent("FAIL");
    expect(screen.getByTestId("actual")).toHaveTextContent("8");
    expect(screen.getByTestId("expected")).toHaveTextContent("3");
  });

  it("clears a PASS as soon as any field becomes invalid", async () => {
    mockVerifyResponse({
      valid: true,
      expected_check_digit: "3",
      actual_check_digit: "3",
      container_number: "CSQU3054383",
    });
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "提交校验" }));
    expect(await screen.findByTestId("verdict")).toHaveTextContent("PASS");

    // The clerk starts re-entering the serial and types a letter: the
    // previous green light must disappear immediately, before submit.
    await user.clear(screen.getByLabelText(/序列号/));
    await user.type(screen.getByLabelText(/序列号/), "30543A");
    expect(screen.queryByTestId("verdict")).toBeNull();
  });

  it("clears a FAIL as soon as any field becomes invalid", async () => {
    mockVerifyResponse({
      valid: false,
      expected_check_digit: "3",
      actual_check_digit: "8",
      container_number: "CSQU3054388",
    });
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    const checkDigitBox = screen.getByLabelText(/校验位（/);
    await user.clear(checkDigitBox);
    await user.type(checkDigitBox, "8");
    await user.click(screen.getByRole("button", { name: "提交校验" }));
    expect(await screen.findByTestId("verdict")).toHaveTextContent("FAIL");

    // Delete one character of the owner code: the field becomes invalid
    // and the previous FAIL must disappear immediately, before resubmit.
    const ownerBox = screen.getByLabelText(/所有者代码/);
    await user.type(ownerBox, "{Backspace}");
    expect(ownerBox).toHaveValue("CS");
    expect(screen.queryByTestId("verdict")).toBeNull();
  });

  it("shows no verdict and a field error while a field is invalid", async () => {
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    // Corrupt the previously-valid category field.
    const categoryBox = screen.getByLabelText(/类别（/);
    await user.clear(categoryBox);
    await user.type(categoryBox, "X");
    expect(screen.queryByTestId("verdict")).toBeNull();
    expect(screen.getByTestId("category-error")).toHaveTextContent(/U、J、Z/);
  });

  it("shows a network error instead of a verdict when the API is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );
    const user = userEvent.setup();
    render(<App />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "提交校验" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/无法连接/),
    );
    expect(screen.queryByTestId("verdict")).toBeNull();
  });
});
