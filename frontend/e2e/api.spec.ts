import { expect, test } from "@playwright/test";

// Direct API checks executed against the live compose service.
const apiPort = process.env.API_PORT ?? "8000";
const API_BASE =
  process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${apiPort}`;

test("API health endpoint responds", async ({ request }) => {
  const response = await request.get(`${API_BASE}/api/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("API accepts a valid number", async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/verify`, {
    data: {
      owner_code: "CSQ",
      category: "U",
      serial: "305438",
      check_digit: "3",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    valid: true,
    expected_check_digit: "3",
    actual_check_digit: "3",
    container_number: "CSQU3054383",
  });
});

test("API returns 422 with deterministic field locations", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/verify`, {
    data: {
      owner_code: "1SQ",
      category: "X",
      serial: "30A438",
      check_digit: "Z",
    },
  });
  expect(response.status()).toBe(422);
  const body = await response.json();
  const fields = body.detail.map(
    (error: { loc: string[] }) => error.loc[error.loc.length - 1],
  );
  expect(fields.sort()).toEqual(
    ["category", "check_digit", "owner_code", "serial"].sort(),
  );
});
