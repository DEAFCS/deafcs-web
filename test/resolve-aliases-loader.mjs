import { pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = pathToFileURL(`${path.resolve(import.meta.dirname, "..")}/`).href;

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith("~/")) {
    spec = new URL(spec.slice(2), projectRoot).href;
  }
  try {
    return await nextResolve(spec, context);
  } catch (err) {
    if (err?.code === "ERR_UNSUPPORTED_DIR_IMPORT" && spec.endsWith("/generated/zeus")) {
      return await nextResolve(`${spec}/index.ts`, context);
    }
    if (err?.code === "ERR_MODULE_NOT_FOUND" && !/\.[a-zA-Z]+$/.test(spec)) {
      return await nextResolve(`${spec}.ts`, context);
    }
    throw err;
  }
}
