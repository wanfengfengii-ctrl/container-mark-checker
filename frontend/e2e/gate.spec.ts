import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function fillFields(
  page: import("@playwright/test").Page,
  fields: { owner: string; category: string; serial: string; check: string },
) {
  await page.getByLabel(/所有者代码/).fill(fields.owner);
  await page.getByLabel(/类别（/).fill(fields.category);
  await page.getByLabel(/序列号/).fill(fields.serial);
  await page.getByLabel(/校验位（/).fill(fields.check);
}

test("real integration: valid number CSQU3054383 shows PASS only", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "305438",
    check: "3",
  });
  await page.getByRole("button", { name: "提交校验" }).click();

  const verdict = page.getByTestId("verdict");
  await expect(verdict).toBeVisible();
  await expect(verdict).toHaveText("PASS");
});

test("real integration: wrong check digit shows FAIL, actual and expected", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "305438",
    check: "8",
  });
  await page.getByRole("button", { name: "提交校验" }).click();

  const verdict = page.getByTestId("verdict");
  await expect(verdict).toContainText("FAIL");
  await expect(page.getByTestId("actual")).toHaveText("8");
  await expect(page.getByTestId("expected")).toHaveText("3");
});

test("real integration: remainder-10 vector CSQU000007 passes with digit 0", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "000007",
    check: "0",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("PASS");
});

test("stale green light: editing a field invalid clears the PASS verdict", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "305438",
    check: "3",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("PASS");

  // Corrupt the serial with a letter; the green verdict must vanish
  // without any new submission.
  await page.getByLabel(/序列号/).fill("30543A");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("invalid input cannot be submitted and never leaves an old verdict", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "305438",
    check: "3",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("PASS");

  await page.getByLabel(/类别（/).fill("X");
  // Button is still clickable but the client refuses before calling API;
  // regardless, no verdict may remain on screen.
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("U、J、Z");
});

test("diagnosis: single confusable replacement, pick, refill, re-PASS", async ({
  page,
}) => {
  // KEMZ058631 with check digit 8 FAILs (expected 3). The unique
  // cheapest fix is the confusable 0 -> 8 miscopy: KEMZ0506318.
  await fillFields(page, {
    owner: "KEM",
    category: "Z",
    serial: "058631",
    check: "8",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toContainText("FAIL");

  await page.getByTestId("diagnose").click();
  const candidate = page.getByTestId("candidate-KEMZ0506318");
  await expect(candidate).toBeVisible();
  // Unique minimum-cost candidate.
  await expect(page.getByTestId("candidates").locator("button")).toHaveCount(1);

  await candidate.click();
  // All four segments refill and the old FAIL/candidates disappear.
  await expect(page.getByLabel(/所有者代码/)).toHaveValue("KEM");
  await expect(page.getByLabel(/类别（/)).toHaveValue("Z");
  await expect(page.getByLabel(/序列号/)).toHaveValue("050631");
  await expect(page.getByLabel(/校验位（/)).toHaveValue("8");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("diagnosis")).toHaveCount(0);

  // Resubmission follows the ordinary PASS/FAIL rules.
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("PASS");
});

test("diagnosis: two cost-2 candidates are tied and sorted", async ({
  page,
}) => {
  // CSQU571171 / 6 FAILs (expected 7); no cost-1 edit fixes it and two
  // cost-2 paths tie.
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "571171",
    check: "6",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toContainText("FAIL");

  await page.getByTestId("diagnose").click();
  const buttons = page.getByTestId("candidates").locator("button");
  await expect(buttons).toHaveCount(2);
  await expect(page.getByTestId("candidate-CSOU5711176")).toBeVisible();
  await expect(page.getByTestId("candidate-SCQU5171716")).toBeVisible();
  await expect(page.getByTestId("candidates")).toContainText("2");

  // Picking the second candidate refills all four segments and verifies.
  await page.getByTestId("candidate-SCQU5171716").click();
  await expect(page.getByLabel(/所有者代码/)).toHaveValue("SCQ");
  await expect(page.getByLabel(/类别（/)).toHaveValue("U");
  await expect(page.getByLabel(/序列号/)).toHaveValue("517171");
  await expect(page.getByLabel(/校验位（/)).toHaveValue("6");
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("PASS");
});

test("diagnosis: editing any field dismisses the diagnosis entry", async ({
  page,
}) => {
  await fillFields(page, {
    owner: "KEM",
    category: "Z",
    serial: "058631",
    check: "8",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toContainText("FAIL");

  // The entry only exists on FAIL; editing a field clears the FAIL too.
  await page.getByLabel(/所有者代码/).fill("KE");
  await expect(page.getByTestId("diagnose")).toHaveCount(0);
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("diagnosis: no candidate within budget shows the empty message", async ({
  page,
}) => {
  // CSQU512311 / 6 FAILs and nothing within the cost budget fixes it.
  await fillFields(page, {
    owner: "CSQ",
    category: "U",
    serial: "512311",
    check: "6",
  });
  await page.getByRole("button", { name: "提交校验" }).click();
  await expect(page.getByTestId("verdict")).toContainText("FAIL");

  await page.getByTestId("diagnose").click();
  await expect(page.getByTestId("no-candidates")).toBeVisible();
  await expect(page.getByTestId("candidates")).toHaveCount(0);
});
