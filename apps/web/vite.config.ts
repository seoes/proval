import { brandIconPlugin } from "../../packages/brand/plugin";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [brandIconPlugin(), tailwindcss(), sveltekit()],
    server: { port: 7903 },
});
