import { test, expect, type Page } from "@playwright/test";
async function signIn(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await page.getByLabel("Patient ID or email").fill(process.env.TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.TEST_PASSWORD!);
  await page
    .locator("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start conversation" }),
  ).toBeEnabled();
}
test("single AI receptionist and responsive layout", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Practice demo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guided booking", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start conversation" }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("account login, profile, persistent booking, isolation and cancellation", async ({
  page,
  playwright,
}) => {
  test.skip(!process.env.TEST_PASSWORD, "Test fixtures required");
  const patientName = "Taylor Demo " + Date.now();
  await signIn(page);
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page.getByLabel("Display name").fill("Clinic Assistant Tester");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile updated");
  await page.getByRole("button", { name: "Voice demo", exact: true }).click();
  const clinic = await (await page.request.get("/api/clinic")).json();
  const prepared = await (
    await page.request.put("/api/appointments", {
      data: { slotId: clinic.slots[0].id, patientName },
    })
  ).json();
  expect(
    (
      await page.request.post("/api/appointments", {
        data: { token: prepared.proposal.token },
      })
    ).status(),
  ).toBe(201);
  const data = await (await page.request.get("/api/appointments")).json();
  const booking = data.appointments.find(
    (b: { status: string }) => b.status === "confirmed",
  );
  expect(booking).toBeTruthy();
  const other = await playwright.request.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  });
  await other.post("/api/auth", {
    data: {
      action: "signin",
      email: process.env.TEST_EMAIL_TWO,
      password: process.env.TEST_PASSWORD,
    },
  });
  const list = await (await other.get("/api/appointments")).json();
  expect(
    list.appointments.some((b: { id: string }) => b.id === booking.id),
  ).toBe(false);
  expect(
    (
      await other.delete("/api/appointments", { data: { id: booking.id } })
    ).status(),
  ).toBe(409);
  await other.dispose();
  await page.reload();
  await page
    .getByRole("button", { name: "My appointments", exact: true })
    .click();
  await expect(
    page.locator(".appointment-row").filter({ hasText: patientName }),
  ).toBeVisible();
  await page
    .locator(".appointment-row")
    .filter({ hasText: patientName })
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(
    page
      .locator(".appointment-row")
      .filter({ hasText: patientName })
      .locator(".status-badge"),
  ).toHaveText("Cancelled");
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("signed out");
  expect((await page.request.get("/api/appointments")).status()).toBe(401);
});
test("live AI checks availability and proposes a booking", async ({ page }) => {
  test.skip(
    process.env.RUN_LIVE_AI_TESTS !== "1" ||
      !process.env.OPENAI_API_KEY ||
      !process.env.TEST_PASSWORD,
    "Live credentials required",
  );
  await signIn(page);
  expect(
    (
      await page.request.post("/api/session", {
        data: { code: process.env.DEMO_ACCESS_CODE },
      })
    ).ok(),
  ).toBe(true);
  const slots = await (await page.request.get("/api/clinic")).json();
  const slot = slots.slots.find(
    (s: { doctor_id: string }) => s.doctor_id === "maya-shah",
  );
  const response = await page.request.post("/api/chat", {
    data: {
      messages: [
        {
          role: "user",
          content:
            "I am making a new Dermatology appointment. Please check Dr. Maya Shah’s earliest availability.",
        },
      ],
    },
    timeout: 60000,
  });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(body.actions).toContain("Checked physician availability");
  expect(body.text.length).toBeGreaterThan(10);
  const proposal = await page.request.post("/api/chat", {
    data: {
      messages: [
        {
          role: "user",
          content: `Please prepare slot ${slot.id} with Dr. Maya Shah for fictional patient Alex Demo. I selected this specific available slot.`,
        },
      ],
    },
    timeout: 60000,
  });
  const result = await proposal.json();
  expect(proposal.ok(), JSON.stringify(result)).toBe(true);
  expect(result.proposal?.slot.id).toBe(slot.id);
  expect(result.proposal?.token).toBeTruthy();
});
