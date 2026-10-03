import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import base from "../playwright.config";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL("../tests/e2e", import.meta.url)),
  use: { ...base.use, baseURL: "http://127.0.0.1:3231" },
  webServer: {
    command: "npm exec -- next dev --hostname 127.0.0.1 --port 3231",
    cwd: appRoot,
    url: "http://127.0.0.1:3231/gallery",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
