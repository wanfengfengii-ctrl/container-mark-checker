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
