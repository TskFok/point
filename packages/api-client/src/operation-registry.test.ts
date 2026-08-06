import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { operationRegistry } from "./client.js";

type OpenApiOperation = {
  operationId: string;
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

describe("operationRegistry", () => {
  it("与 openapi.json 的全部 53 个 operationId、path 和 method 完全一致", async () => {
    const document = JSON.parse(
      await readFile(
        new URL("../../../openapi/openapi.json", import.meta.url),
        "utf8",
      ),
    ) as OpenApiDocument;
    const fromDocument: Array<[string, { path: string; method: string }]> =
      Object.entries(document.paths)
        .flatMap(([path, pathItem]) =>
          Object.entries(pathItem)
            .filter(([method]) =>
              ["get", "post", "put", "patch", "delete"].includes(method),
            )
            .map(
              ([method, operation]): [
                string,
                { path: string; method: string },
              ] => [
                operation.operationId,
                { path, method: method.toUpperCase() },
              ],
            ),
        )
        .sort((left, right) => left[0].localeCompare(right[0]));
    const fromClient = Object.entries(operationRegistry).sort(
      ([left], [right]) => left.localeCompare(right),
    );

    expect(fromClient).toHaveLength(53);
    expect(fromClient).toEqual(fromDocument);
  });
});
