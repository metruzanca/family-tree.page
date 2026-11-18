import { readFileSync } from "node:fs";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

type Json = Record<string, unknown>;

const specPath = new URL("../openapi/roots-v1.json", import.meta.url);
const spec = JSON.parse(readFileSync(specPath, "utf8")) as Json;
const errors: string[] = [];
const rootId = "https://roots.test/openapi.json";

function fail(message: string) {
  errors.push(message);
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveRef(ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = spec;
  for (const part of ref.slice(2).split("/")) {
    if (!isObject(current)) return undefined;
    current = current[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return current;
}

function walk(value: unknown, path: string, visit: (node: Json, path: string) => void) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}/${index}`, visit));
    return;
  }
  if (!isObject(value)) return;
  visit(value, path);
  for (const [key, child] of Object.entries(value)) {
    walk(child, `${path}/${key}`, visit);
  }
}

// Structure
if (typeof spec.openapi !== "string" || !spec.openapi.startsWith("3.1.")) {
  fail("openapi must be a 3.1.x version string.");
}
if (!isObject(spec.info) || !spec.info.title || !spec.info.version) {
  fail("info.title and info.version are required.");
}
if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
  fail("At least one server is required.");
}
if (!isObject(spec.paths)) fail("paths is required.");

const methods = new Set(["get", "put", "post", "patch", "delete", "head", "options"]);
const operationIds = new Set<string>();

if (isObject(spec.paths)) {
  for (const [path, entry] of Object.entries(spec.paths)) {
    if (!isObject(entry)) {
      fail(`${path} is not an object.`);
      continue;
    }
    for (const [method, operation] of Object.entries(entry)) {
      if (!methods.has(method) || !isObject(operation)) continue;
      const label = `${method.toUpperCase()} ${path}`;
      if (typeof operation.operationId !== "string") {
        fail(`${label} needs an operationId.`);
      } else if (operationIds.has(operation.operationId)) {
        fail(`${label} reuses operationId ${operation.operationId}.`);
      } else {
        operationIds.add(operation.operationId);
      }
      if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
        fail(`${label} needs at least one tag.`);
      }
      if (typeof operation.summary !== "string" || !operation.summary) {
        fail(`${label} needs a summary.`);
      }
      if (!isObject(operation.responses)) {
        fail(`${label} needs responses.`);
      } else {
        for (const status of ["401", "429"]) {
          if (!operation.responses[status]) {
            fail(`${label} must document the ${status} response.`);
          }
        }
      }
    }
  }
}

// Every ref resolves
walk(spec, "", (node, path) => {
  if (typeof node.$ref === "string" && resolveRef(node.$ref) === undefined) {
    fail(`${path} has an unresolved $ref ${node.$ref}.`);
  }
});

// Examples validate against their sibling schema
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateFormats: true,
});
addFormats(ajv);
ajv.addSchema({ $id: rootId, components: spec.components });

const validators = new Map<string, ValidateFunction>();
function validatorFor(schema: unknown, label: string): ValidateFunction | null {
  if (!isObject(schema)) return null;
  if (typeof schema.$ref === "string") {
    const ref = schema.$ref;
    const cached = validators.get(ref);
    if (cached) return cached;
    const validate = ajv.getSchema(`${rootId}${ref}`);
    if (!validate) {
      fail(`${label}: schema ${ref} could not be compiled.`);
      return null;
    }
    validators.set(ref, validate);
    return validate;
  }
  if (Object.keys(schema).length === 0) return null;
  try {
    return ajv.compile(schema);
  } catch (error) {
    fail(`${label}: schema could not be compiled (${String(error)}).`);
    return null;
  }
}

function checkExample(schema: unknown, example: unknown, label: string) {
  if (example === undefined) return;
  const validate = validatorFor(schema, label);
  if (!validate) return;
  if (!validate(example)) {
    const detail = (validate.errors ?? [])
      .slice(0, 4)
      .map(error => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    fail(`${label}: example does not match its schema (${detail}).`);
  }
}

if (isObject(spec.paths)) {
  for (const [path, entry] of Object.entries(spec.paths)) {
    if (!isObject(entry)) continue;
    for (const [method, operation] of Object.entries(entry)) {
      if (!methods.has(method) || !isObject(operation)) continue;
      if (!isObject(operation.responses)) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!isObject(response) || !isObject(response.content)) continue;
        for (const [mediaType, media] of Object.entries(response.content)) {
          if (!isObject(media)) continue;
          const label = `${method.toUpperCase()} ${path} ${status} ${mediaType}`;
          if (!mediaType.includes("json")) continue;
          checkExample(media.schema, media.example, label);
          if (Array.isArray(media.examples)) {
            media.examples.forEach((example, index) =>
              checkExample(media.schema, example, `${label} examples[${index}]`),
            );
          } else if (isObject(media.examples)) {
            for (const [name, example] of Object.entries(media.examples)) {
              const value = isObject(example) ? example.value : example;
              checkExample(media.schema, value, `${label} examples.${name}`);
            }
          }
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`OpenAPI check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `OpenAPI check passed: ${operationIds.size} operations, ${Object.keys(
    (isObject(spec.components) && isObject(spec.components.schemas)
      ? spec.components.schemas
      : {}) as Json,
  ).length} schemas.`,
);
