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

test("corrections: single confusable miscopy yields one cost-1 candidate", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/corrections`, {
    data: {
      owner_code: "KEM",
      category: "Z",
      serial: "058631",
      check_digit: "8",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    minimum_cost: 1,
    candidates: ["KEMZ0506318"],
  });
});

test("corrections: two cost-2 fixes tie and come back sorted", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/corrections`, {
    data: {
      owner_code: "CSQ",
      category: "U",
      serial: "571171",
      check_digit: "6",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    minimum_cost: 2,
    candidates: ["CSOU5711176", "SCQU5171716"],
  });
});

test("corrections: no fix within budget returns 200 with an empty list", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/corrections`, {
    data: {
      owner_code: "CSQ",
      category: "U",
      serial: "512311",
      check_digit: "6",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ minimum_cost: null, candidates: [] });
});

test("corrections: an already passing number is rejected with 409", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/corrections`, {
    data: {
      owner_code: "CSQ",
      category: "U",
      serial: "305438",
      check_digit: "3",
    },
  });
  expect(response.status()).toBe(409);
});

test("corrections: invalid fields still produce field-level 422s", async ({
  request,
}) => {
  const response = await request.post(`${API_BASE}/api/corrections`, {
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

test("corrections candidates really verify against /api/verify", async ({
  request,
}) => {
  // Every returned candidate must pass the ordinary verification path.
  const correctionResponse = await request.post(`${API_BASE}/api/corrections`, {
    data: {
      owner_code: "CSQ",
      category: "U",
      serial: "571171",
      check_digit: "6",
    },
  });
  const { candidates } = await correctionResponse.json();
  expect(candidates.length).toBeGreaterThan(0);
  for (const number of candidates as string[]) {
    const verifyResponse = await request.post(`${API_BASE}/api/verify`, {
      data: {
        owner_code: number.slice(0, 3),
        category: number.slice(3, 4),
        serial: number.slice(4, 10),
        check_digit: number.slice(10, 11),
      },
    });
    expect(verifyResponse.status()).toBe(200);
    expect((await verifyResponse.json()).valid).toBe(true);
  }
});
