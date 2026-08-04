/**
 * Guards on the single source of truth: the Aeneid values must be exactly what
 * goal.md §5.2 specifies, and no other file may contain an address literal.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHAIN,
  CHAIN_ID,
  EXPLORER_URL,
  LICENSE_READ_CONDITION,
  LICENSE_TOKEN,
  OWNER_WRITE_CONDITION,
  RPC_URL,
} from "../../../config/chain";

describe("Aeneid chain config", () => {
  it("targets Aeneid only", () => {
    expect(CHAIN_ID).toBe(1315);
    expect(CHAIN.id).toBe(1315);
    expect(CHAIN.testnet).toBe(true);
    expect(RPC_URL).toBe("https://testnet.rpc.story.foundation");
    expect(EXPLORER_URL).toBe("https://testnet.explorer.story.foundation");
  });

  it("pins the three CDR condition addresses verbatim", () => {
    expect(OWNER_WRITE_CONDITION).toBe("0x4C9bFC96d7092b590D497A191826C3dA2277c34B");
    expect(LICENSE_READ_CONDITION).toBe("0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3");
    expect(LICENSE_TOKEN).toBe("0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC");
  });
});

const ADDRESS_LITERAL = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;
const ALLOWED = new Set([
  path.join("config", "chain.ts"),
  // Test doubles necessarily name addresses.
  path.join("src", "lib", "pipeline", "testing", "fixtures.ts"),
]);

/** Tests assert against literal addresses; production code must not contain them. */
const isTest = (relative: string) => /(__tests__|\.test\.ts$)/.test(relative);

async function* sourceFiles(dir: string, root: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full, root);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield path.relative(root, full);
    }
  }
}

describe("no address literals outside config/chain.ts", () => {
  it("holds across the whole codebase", async () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const dir of ["config", "src", "scripts"]) {
      for await (const relative of sourceFiles(path.join(root, dir), root)) {
        if (ALLOWED.has(relative) || isTest(relative)) continue;
        const contents = await readFile(path.join(root, relative), "utf8");
        if (ADDRESS_LITERAL.test(contents)) offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});
