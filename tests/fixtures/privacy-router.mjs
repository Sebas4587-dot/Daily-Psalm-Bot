// Load the real public route in isolation: no database or Auth configuration needed.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const apiRequire = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const { build } = apiRequire("esbuild");
const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../../artifacts/api-server/src/routes/privacy.ts",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  banner: {
    js: `import {createRequire as __testRequire} from 'node:module'; const require = __testRequire(${JSON.stringify(new URL("../../artifacts/api-server/package.json", import.meta.url).href)});`,
  },
});
const module = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
export const privacyConfiguration = module.privacyConfiguration;
export default module.default;
