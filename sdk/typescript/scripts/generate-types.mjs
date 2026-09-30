#!/usr/bin/env node
import { compile } from "json-schema-to-typescript";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = join(ROOT, "..", "..", "schemas");
const OUT = join(ROOT, "src", "generated", "schema-types.ts");

const banner =
  "/* eslint-disable */\n/** Generated from ../../schemas — run: npm run generate:types */\n";

async function render() {
  const chunks = [banner];
  for (const file of readdirSync(SCHEMAS).filter((name) => name.endsWith(".json")).sort()) {
    const schema = JSON.parse(readFileSync(join(SCHEMAS, file), "utf8"));
    const typeName = file
      .replace(/\.json$/, "")
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    const ts = await compile(schema, typeName, {
      bannerComment: "",
      additionalProperties: false,
      unknownAny: true,
      cwd: SCHEMAS,
    });
    chunks.push(ts);
  }
  return `${chunks.join("\n")}\n`;
}

async function main() {
  const check = process.argv.includes("--check");
  const content = await render();
  if (check) {
    if (!existsSync(OUT)) {
      console.error("Generated types missing; run npm run generate:types");
      process.exit(1);
    }
    const existing = readFileSync(OUT, "utf8");
    if (existing !== content) {
      console.error("SDK type drift; run: npm run generate:types");
      process.exit(1);
    }
    console.log("SDK types are up to date.");
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, content, "utf8");
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
