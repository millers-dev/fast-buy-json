/**
 * JSON Schema request validation (Draft 07) for FastBuyJSON demo server.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sendProblem } from "./errors.js";

const SCHEMAS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");

const ASSERTED_FORMATS = new Set(["uuid", "email", "date-time"]);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true,
  useDefaults: true,
});

addFormats(ajv, ASSERTED_FORMATS);

/** @type {Map<string, import('ajv').ValidateFunction>} */
const validators = new Map();

function loadSchemas() {
  for (const file of readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith(".json"))) {
    const schemaName = file.replace(/\.json$/, "");
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf8"));
    const validate = ajv.compile(schema);
    validators.set(schemaName, validate);
  }
}

loadSchemas();

/**
 * @param {import('ajv').ErrorObject[]} errors
 * @returns {Array<{ field: string; message: string }>}
 */
export function formatValidationErrors(errors) {
  return errors.map((err) => {
    let field = err.instancePath.replace(/^\//, "").replace(/\//g, ".");
    if (err.keyword === "required") {
      field = err.params.missingProperty;
    }
    if (!field) {
      field = "(root)";
    }
    const message =
      err.keyword === "required"
        ? "is required"
        : err.message?.replace(/^must /, "") || "is invalid";
    return { field, message };
  });
}

/**
 * @param {string} schemaName Basename of schemas/*.json without extension
 * @param {unknown} body
 */
export function validatePayload(schemaName, body) {
  const validate = validators.get(schemaName);
  if (!validate) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  if (!validate(body)) {
    return {
      ok: false,
      errors: formatValidationErrors(validate.errors ?? []),
    };
  }
  return { ok: true };
}

/**
 * Express middleware validating req.body against a JSON Schema.
 * @param {string} schemaName
 */
export function validateBody(schemaName) {
  return (req, res, next) => {
    const result = validatePayload(schemaName, req.body);
    if (!result.ok) {
      return sendProblem(res, {
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Validation failed",
        detail: "Request validation failed",
        instance: req.path,
        errors: result.errors,
      });
    }
    return next();
  };
}
