import { test, expect } from "@playwright/test";

test("PWA manifest, offline fallback and private-data cache isolation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".start-call")).toBeEnabled();
  const manifestResponse = await context.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: "Clinic Assistant",
    display: "standalone",
    start_url: "/",
  });
  for (const icon of manifest.icons) {
    const response = await context.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cached).toContain("/offline.html");
  expect(
    cached.every(
      (path) => path === "/offline.html" || path.startsWith("/icons/"),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "You're offline" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Let's reconnect." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      fetch("/api/auth")
        .then(() => true)
        .catch(() => false),
    ),
  ).toBe(false);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.locator(".start-call")).toBeEnabled();
});
