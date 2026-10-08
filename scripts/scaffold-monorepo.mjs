/**
 * Convierte el Nest single-app en monorepo gateway + microservicios + libs.
 * Ejecutar una vez: node scripts/scaffold-monorepo.mjs
 */
import fs from "fs";
import path from "path";

const root = process.cwd();

function write(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log("write", rel);
}

function rmrf(rel) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

// Limpiar src/test del scaffold inicial (se mueven a apps/gateway)
const oldSrc = path.join(root, "src");
if (fs.existsSync(oldSrc)) {
  fs.mkdirSync(path.join(root, "apps/gateway"), { recursive: true });
  // no mover; reescribimos gateway limpio
}

write(
  "nest-cli.json",
  JSON.stringify(
    {
      $schema: "https://json.schemastore.org/nest-cli",
      collection: "@nestjs/schematics",
      sourceRoot: "apps/gateway/src",
      monorepo: true,
      root: "apps/gateway",
      compilerOptions: {
        webpack: false,
        tsConfigPath: "apps/gateway/tsconfig.app.json",
      },
      projects: {
        gateway: {
          type: "application",
          root: "apps/gateway",
          entryFile: "main",
          sourceRoot: "apps/gateway/src",
          compilerOptions: { tsConfigPath: "apps/gateway/tsconfig.app.json" },
        },
        auth: {
          type: "application",
          root: "apps/auth",
          entryFile: "main",
          sourceRoot: "apps/auth/src",
          compilerOptions: { tsConfigPath: "apps/auth/tsconfig.app.json" },
        },
        people: {
          type: "application",
          root: "apps/people",
          entryFile: "main",
          sourceRoot: "apps/people/src",
          compilerOptions: { tsConfigPath: "apps/people/tsconfig.app.json" },
        },
        ops: {
          type: "application",
          root: "apps/ops",
          entryFile: "main",
          sourceRoot: "apps/ops/src",
          compilerOptions: { tsConfigPath: "apps/ops/tsconfig.app.json" },
        },
        ai: {
          type: "application",
          root: "apps/ai",
          entryFile: "main",
          sourceRoot: "apps/ai/src",
          compilerOptions: { tsConfigPath: "apps/ai/tsconfig.app.json" },
        },
        common: {
          type: "library",
          root: "libs/common",
          entryFile: "index",
          sourceRoot: "libs/common/src",
          compilerOptions: { tsConfigPath: "libs/common/tsconfig.lib.json" },
        },
        database: {
          type: "library",
          root: "libs/database",
          entryFile: "index",
          sourceRoot: "libs/database/src",
          compilerOptions: { tsConfigPath: "libs/database/tsconfig.lib.json" },
        },
        "auth-core": {
          type: "library",
          root: "libs/auth-core",
          entryFile: "index",
          sourceRoot: "libs/auth-core/src",
          compilerOptions: { tsConfigPath: "libs/auth-core/tsconfig.lib.json" },
        },
      },
    },
    null,
    2,
  ),
);

write(
  "tsconfig.json",
  JSON.stringify(
    {
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        declaration: true,
        removeComments: true,
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        allowSyntheticDefaultImports: true,
        target: "ES2023",
        sourceMap: true,
        outDir: "./dist",
        baseUrl: "./",
        incremental: true,
        skipLibCheck: true,
        strictNullChecks: true,
        forceConsistentCasingInFileNames: true,
        noImplicitAny: true,
        strictBindCallApply: true,
        noFallthroughCasesInSwitch: true,
        paths: {
          "@nara/common": ["libs/common/src"],
          "@nara/common/*": ["libs/common/src/*"],
          "@nara/database": ["libs/database/src"],
          "@nara/database/*": ["libs/database/src/*"],
          "@nara/auth-core": ["libs/auth-core/src"],
          "@nara/auth-core/*": ["libs/auth-core/src/*"],
        },
      },
    },
    null,
    2,
  ),
);

const appTsconfig = (name) =>
  JSON.stringify(
    {
      extends: "../../tsconfig.json",
      compilerOptions: {
        outDir: `../../dist/apps/${name}`,
        rootDir: "./src",
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist", "test", "**/*spec.ts"],
    },
    null,
    2,
  );

const libTsconfig = (name) =>
  JSON.stringify(
    {
      extends: "../../tsconfig.json",
      compilerOptions: {
        outDir: `../../dist/libs/${name}`,
        rootDir: "./src",
        declaration: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist", "**/*spec.ts"],
    },
    null,
    2,
  );

for (const app of ["gateway", "auth", "people", "ops", "ai"]) {
  write(`apps/${app}/tsconfig.app.json`, appTsconfig(app));
}
for (const lib of ["common", "database", "auth-core"]) {
  write(`libs/${lib}/tsconfig.lib.json`, libTsconfig(lib));
}

console.log("scaffold metadata ok");
