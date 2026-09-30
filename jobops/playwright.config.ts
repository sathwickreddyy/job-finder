import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e",fullyParallel:false,workers:1,timeout:60000,
 reporter:[["list"],["html",{open:"never"}]],
 use:{baseURL:process.env.E2E_BASE_URL??"http://127.0.0.1:3210",trace:"retain-on-failure",screenshot:"only-on-failure"},
 projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}}],
 webServer:{command:"npm run dev",url:"http://127.0.0.1:3210/gallery",reuseExistingServer:true,timeout:60000}
});
