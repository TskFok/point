import openapiTS, { astToString } from "openapi-typescript";
import { writeFile } from "node:fs/promises";

const source = new URL("../../../openapi/openapi.json", import.meta.url);
const output = new URL("../src/schema.ts", import.meta.url);
const ast = await openapiTS(source);
const header =
  "/** 此文件由 openapi-typescript 自动生成，请勿手工修改。 */\n\n";

await writeFile(output, `${header}${astToString(ast)}`, "utf8");
