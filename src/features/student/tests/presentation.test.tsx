/// <reference lib="es2024.promise" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { StudentProvider } from "../hooks/StudentContext";
import {
  TranslationProvider,
  translate,
  useTranslation,
} from "../i18n/TranslationProvider";
import { JobsPage } from "../pages/JobsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { HomePage } from "../pages/HomePage";
import { EcoPrintPage } from "../pages/EcoPrintPage";
import { PortalShell } from "../components/PortalShell";
import {
  createLocalDemo,
  type LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import { hi, kn } from "../i18n/presentation";

const adapters: LocalDemoAdapter[] = [];
const databases: string[] = [];
let now = "2026-11-13T10:00:00.000Z";

beforeEach(() => {
  localStorage.removeItem("printq.student.locale");
  localStorage.removeItem("printq.student.theme");
  now = "2026-11-13T10:00:00.000Z";
});
afterEach(async () => {
  cleanup();
  for (const service of adapters.splice(0)) await service.dispose();
  for (const database of databases.splice(0)) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const request = indexedDB.deleteDatabase(database);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Owned test database remained open"));
    await promise;
  }
  localStorage.removeItem("printq.student.locale");
  localStorage.removeItem("printq.student.theme");
});

function ThemeAndLocation() {
  const { resolvedTheme, locale } = useTranslation();
  const location = useLocation();
  return (
    <>
      <output data-testid="preferences">
        {locale}:{resolvedTheme}
      </output>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <Link to="/student/settings">Preferences route</Link>
      <Link to="/student/jobs">History route</Link>
    </>
  );
}

function mount(
  service: LocalDemoAdapter,
  path = "/student/jobs",
  shell = false,
) {
  const content = (
    <>
      <ThemeAndLocation />
      <Routes>
        <Route path="/student/jobs" element={<JobsPage />} />
        <Route path="/student/settings" element={<SettingsPage />} />
        <Route path="/student/ecoprint" element={<EcoPrintPage />} />
        <Route path="/student" element={<HomePage />} />
      </Routes>
    </>
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TranslationProvider>
        <StudentProvider service={service} basePath="/student">
          {shell ? <PortalShell>{content}</PortalShell> : content}
        </StudentProvider>
      </TranslationProvider>
    </MemoryRouter>,
  );
}

async function dataset() {
  const databaseName = `presentation-${crypto.randomUUID()}`;
  const local = createLocalDemo({ databaseName, clock: () => new Date(now) });
  databases.push(databaseName);
  adapters.push(local.service);
  const input = {
    pageCount: 3,
    copies: 2,
    pageCountSource: "manual" as const,
    colorMode: "bw" as const,
    duplex: true,
    paperSize: "A4" as const,
    instructions: "",
  };
  const alpha = await local.service.createJob({
    ...input,
    clientRequestId: crypto.randomUUID(),
    documentName: "Alpha notes",
  });
  now = "2026-11-13T10:01:00.000Z";
  const beta = await local.service.createJob({
    ...input,
    clientRequestId: crypto.randomUUID(),
    documentName: "<script>Beta</script>",
  });
  await local.demoController.advanceJob(alpha.id);
  await local.demoController.advanceJob(alpha.id);
  await local.demoController.advanceJob(alpha.id);
  return { ...local, alpha, beta };
}

describe("presentation consumer journeys", () => {
  it("filters real durable history, preserves URL preferences, sorts and reopens token/receipt", async () => {
    const user = userEvent.setup();
    const { service, alpha, beta } = await dataset();
    const view = mount(
      service,
      "/student/jobs?category=active&sort=oldest&keep=host",
    );
    await screen.findByText("<script>Beta</script>");
    expect(screen.queryByText("Alpha notes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.getByText("Alpha notes")).toBeVisible();
    expect(screen.queryByText("<script>Beta</script>")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All jobs" }));
    await user.selectOptions(screen.getByLabelText("Status"), "queued");
    await user.type(
      screen.getByLabelText("Search document or token"),
      beta.token.toLowerCase(),
    );
    expect(screen.getByText("<script>Beta</script>")).toBeVisible();
    expect(screen.getByTestId("location").textContent).toContain("keep=host");
    expect(
      screen.getByRole("link", { name: "Pickup token / QR" }),
    ).toHaveAttribute("href", `/student/jobs/${beta.id}/pickup`);
    expect(
      screen.getByRole("link", { name: "Order acknowledgment" }),
    ).toHaveAttribute("href", `/student/jobs/${beta.id}/receipt`);
    const path = screen.getByTestId("location").textContent!;
    view.unmount();
    mount(service, path);
    expect(
      await screen.findByDisplayValue(beta.token.toLowerCase()),
    ).toBeVisible();
    expect(screen.getByLabelText("Sort by")).toHaveValue("oldest");
    expect(screen.getByLabelText("Status")).toHaveValue("queued");
    expect((await service.getJobById(alpha.id))?.status).toBe("collected");
  });

  it("handles malformed query values safely and keeps old queued jobs queued", async () => {
    const { service, beta } = await dataset();
    now = "2030-01-01T00:00:00.000Z";
    mount(
      service,
      "/student/jobs?category=invalid&status=%3Cscript%3E&sort=unknown",
    );
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("<script>Beta</script>");
    expect(screen.getByLabelText("Status")).toHaveValue("");
    expect(screen.getByLabelText("Sort by")).toHaveValue("newest");
    expect((await service.getJobById(beta.id))?.status).toBe("queued");
  });

  it("switches complete preferences without reload and persists locale and theme", async () => {
    const user = userEvent.setup();
    const { service } = await dataset();
    const view = mount(service, "/student/settings");
    await user.selectOptions(screen.getByLabelText("Language"), "hi");
    expect(
      screen.getByRole("heading", { name: hi["presentation.settingsTitle"] }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText(hi["presentation.theme"]),
      "dark",
    );
    expect(screen.getByTestId("preferences")).toHaveTextContent("hi:dark");
    await user.selectOptions(
      screen.getByLabelText(hi["presentation.language"]),
      "kn",
    );
    expect(
      screen.getByRole("heading", { name: kn["presentation.settingsTitle"] }),
    ).toBeVisible();
    view.unmount();
    mount(service, "/student/settings");
    expect(screen.getByTestId("preferences")).toHaveTextContent("kn:dark");
    expect(localStorage.getItem("printq.student.locale")).toBe("kn");
    expect(localStorage.getItem("printq.student.theme")).toBe("dark");
  });

  it("preserves raw comparison inputs when switching Hindi and Kannada in the header", async () => {
    const user = userEvent.setup();
    const { service } = await dataset();
    const before = await service.getJobs();
    mount(service, "/student/ecoprint", true);
    const pages = await screen.findByLabelText("Pages per copy");
    await user.clear(pages);
    await user.type(pages, "7");
    const copies = screen.getByLabelText("Copies");
    await user.clear(copies);
    await user.type(copies, "3");
    await user.selectOptions(screen.getByLabelText("Language"), "hi");
    expect(screen.getByLabelText(hi["presentation.pages"])).toHaveValue("7");
    expect(screen.getByLabelText(hi["presentation.copies"])).toHaveValue("3");
    expect(
      screen.getByRole("heading", { name: hi["presentation.ecoPageTitle"] }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText(hi["presentation.language"]),
      "kn",
    );
    expect(screen.getByLabelText(kn["presentation.pages"])).toHaveValue("7");
    expect(screen.getByLabelText(kn["presentation.copies"])).toHaveValue("3");
    expect(
      screen.getByRole("heading", { name: kn["presentation.ecoPageTitle"] }),
    ).toBeVisible();
    expect(await service.getJobs()).toEqual(before);
  });

  it("exposes six scoped destinations and closes keyboard mobile navigation on Escape", async () => {
    const user = userEvent.setup();
    const { service } = await dataset();
    mount(service, "/student/jobs", true);
    const nav = screen.getByRole("navigation", { name: "Student navigation" });
    for (const path of ["", "new", "jobs", "queue", "ecoprint", "help"]) {
      expect(
        within(nav)
          .getAllByRole("link")
          .some((link) => link.getAttribute("href") === `/student/${path}`),
      ).toBe(true);
    }
    const opener = screen.getByRole("button", { name: "Open navigation" });
    await user.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(opener).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("formats semantic error parameters and safely translates missing runtime keys", () => {
    expect(translate("hi", "errors.nameTooLong", { max: 120 })).toBe(
      "दस्तावेज़ के नाम में अधिकतम 120 अक्षर रखें।",
    );
    expect(translate("kn", "errors.copiesRange", { max: 100 })).toBe(
      "ದಶಮಾಂಶ ಪದ್ಧತಿಯ ಅಂಕೆಗಳನ್ನು ಮಾತ್ರ ಬಳಸಿ, 1 ರಿಂದ 100 ರವರೆಗೆ ಪೂರ್ಣಸಂಖ್ಯೆಯ ಪ್ರತಿಗಳನ್ನು ನಮೂದಿಸಿ.",
    );
    expect(translate("kn", "presentation.minutes", { value: 5 })).toBe("5 ನಿಮಿಷ");
    expect(translate("hi", "missing.unexpected")).toBe("Unavailable");
    expect(translate("kn", "missing.unexpected")).toBe("Unavailable");
  });
});
