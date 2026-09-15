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

function mockFetchQueue(responses: Array<{ body: unknown; status?: number }>) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      const next = queue.shift() ?? {
        body: null,
        status: 503,
      };
      const status = next.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => next.body,
      };
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

describe("suspected-miscopied diagnosis", () => {
  const failResponse = {
    valid: false,
    expected_check_digit: "3",
    actual_check_digit: "8",
    container_number: "CSQU3054388",
  };

  async function failThen(user: ReturnType<typeof userEvent.setup>) {
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "提交校验" }));
    expect(await screen.findByTestId("verdict")).toHaveTextContent("FAIL");
  }

  it("never shows the diagnosis entry on PASS", async () => {
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
    expect(screen.queryByTestId("diagnose")).toBeNull();
  });

  it("requests /api/corrections and renders the returned candidates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => failResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          minimum_cost: 2,
          candidates: ["CSOU5711176", "SCQU5171716"],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/corrections");
    expect(await screen.findByTestId("candidates")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-CSOU5711176")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-SCQU5171716")).toBeInTheDocument();
    expect(screen.getByTestId("candidates")).toHaveTextContent("2");
  });

  it("shows the loading state and then an empty-result message", async () => {
    let resolveDiagnosis: (value: unknown) => void = () => {};
    const pendingDiagnosis = new Promise((resolve) => {
      resolveDiagnosis = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => failResponse,
        })
        .mockReturnValueOnce(
          pendingDiagnosis.then((body) => ({
            ok: true,
            status: 200,
            json: async () => body,
          })),
        ),
    );
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    expect(await screen.findByTestId("diagnosis-loading")).toBeInTheDocument();

    resolveDiagnosis({ minimum_cost: null, candidates: [] });
    expect(await screen.findByTestId("no-candidates")).toBeInTheDocument();
    expect(screen.queryByTestId("candidates")).toBeNull();
  });

  it("replaces old candidates when a later diagnosis finds nothing", async () => {
    mockFetchQueue([
      { body: failResponse },
      {
        body: { minimum_cost: 1, candidates: ["KEMZ0506318"] },
      },
      { body: failResponse },
      { body: { minimum_cost: null, candidates: [] } },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    expect(
      await screen.findByTestId("candidate-KEMZ0506318"),
    ).toBeInTheDocument();

    // Re-diagnosing from a fresh FAIL replaces the previous candidates.
    await user.click(screen.getByRole("button", { name: "提交校验" }));
    await screen.findByTestId("diagnose");
    await user.click(screen.getByTestId("diagnose"));
    expect(await screen.findByTestId("no-candidates")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-KEMZ0506318")).toBeNull();
  });

  it("shows a service failure message instead of stale candidates", async () => {
    mockFetchQueue([
      { body: failResponse },
      { body: { minimum_cost: 1, candidates: ["KEMZ0506318"] } },
      { body: failResponse },
      { body: null, status: 503 },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    expect(
      await screen.findByTestId("candidate-KEMZ0506318"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提交校验" }));
    await screen.findByTestId("diagnose");
    await user.click(screen.getByTestId("diagnose"));
    const failure = await screen.findByTestId("diagnosis-error");
    expect(failure).toHaveTextContent(/诊断服务/);
    expect(screen.queryByTestId("candidate-KEMZ0506318")).toBeNull();
  });

  it("clears the diagnosis as soon as any field is edited", async () => {
    mockFetchQueue([
      { body: failResponse },
      { body: { minimum_cost: 1, candidates: ["KEMZ0506318"] } },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    expect(
      await screen.findByTestId("candidate-KEMZ0506318"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/所有者代码/), "{Backspace}");
    expect(screen.queryByTestId("diagnosis")).toBeNull();
    expect(screen.queryByTestId("verdict")).toBeNull();
  });

  it("refills all four segments on pick and resubmission shows PASS", async () => {
    mockFetchQueue([
      { body: failResponse },
      { body: { minimum_cost: 1, candidates: ["KEMZ0506318"] } },
      {
        body: {
          valid: true,
          expected_check_digit: "8",
          actual_check_digit: "8",
          container_number: "KEMZ0506318",
        },
      },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    await user.click(await screen.findByTestId("candidate-KEMZ0506318"));

    // The four segments are refilled and old conclusions are gone.
    expect(screen.getByLabelText(/所有者代码/)).toHaveValue("KEM");
    expect(screen.getByLabelText(/类别（/)).toHaveValue("Z");
    expect(screen.getByLabelText(/序列号/)).toHaveValue("050631");
    expect(screen.getByLabelText(/校验位（/)).toHaveValue("8");
    expect(screen.queryByTestId("diagnosis")).toBeNull();
    expect(screen.queryByTestId("verdict")).toBeNull();

    // Resubmission follows the ordinary PASS/FAIL rules.
    await user.click(screen.getByRole("button", { name: "提交校验" }));
    expect(await screen.findByTestId("verdict")).toHaveTextContent("PASS");
  });

  it("explains a 409 from the diagnosis endpoint without candidates", async () => {
    mockFetchQueue([{ body: failResponse }, { body: null, status: 409 }]);
    const user = userEvent.setup();
    render(<App />);
    await failThen(user);

    await user.click(screen.getByTestId("diagnose"));
    const failure = await screen.findByTestId("diagnosis-error");
    expect(failure).toHaveTextContent(/已通过校验/);
  });
});
