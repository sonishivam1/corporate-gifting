// Bundles a Node service or script for production: our @gifting/* workspace
// packages (TypeScript source) are bundled in; every other dependency stays
// external and is loaded from node_modules at run time. So every third-party
// package the bundle imports, including those only our workspace packages
// use, must be in the service's own package.json "dependencies"; the build
// fails and names any that are missing.
//
//   node ../../scripts/build-service.mjs src/server.ts dist/server.js
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

import { build } from "esbuild";

const [entry, outfile] = process.argv.slice(2);
if (!entry || !outfile) {
  process.stderr.write("usage: build-service.mjs <entry.ts> <outfile.js>\n");
  process.exit(1);
}

const declared = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {}));
const builtins = new Set(builtinModules);
const missing = new Set();

const packageName = (path) => (path.startsWith("@") ? path.split("/").slice(0, 2).join("/") : path.split("/")[0]);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  logLevel: "warning",
  plugins: [
    {
      name: "external-third-party",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@gifting/")) return undefined;
          const name = packageName(args.path);
          if (!args.path.startsWith("node:") && !builtins.has(name) && !declared.has(name)) missing.add(name);
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

if (missing.size > 0) {
  process.stderr.write(
    `build-service: the bundle imports packages missing from package.json dependencies: ${[...missing].sort().join(", ")}\n`,
  );
  process.exit(1);
}
