import { brandIconPlugin } from "../../packages/brand/plugin";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const isDemoBuild = process.env.PUBLIC_DEMO === "true";

const version =
    process.env.PROVAL_VERSION ||
    (process.env.NODE_ENV === "production"
        ? isDemoBuild
            ? "demo"
            : "unknown"
        : process.env.NODE_ENV || "unknown");

export default defineConfig({
    define: {
        __PROVAL_DEMO_BUILD__: JSON.stringify(isDemoBuild),
        __PROVAL_VERSION__: JSON.stringify(version),
    },
    plugins: [brandIconPlugin(), tailwindcss(), sveltekit()],
    server: { port: 7902, proxy: { "/api": "http://localhost:7900" } },
});
