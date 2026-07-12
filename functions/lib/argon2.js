import { argon2Verify, argon2id, setWASMModules } from "argon2-wasm-edge";
import argon2WASM from "argon2-wasm-edge/wasm/argon2.wasm";
import blake2bWASM from "argon2-wasm-edge/wasm/blake2b.wasm";

setWASMModules({ argon2WASM, blake2bWASM });

export const ARGON2_DEFAULTS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 8192,
  hashLength: 32,
  outputType: "encoded",
};

export function argon2Params(env) {
  const memorySize = Number(env.ARGON2_MEMORY_KIB || ARGON2_DEFAULTS.memorySize);
  const iterations = Number(env.ARGON2_ITERATIONS || ARGON2_DEFAULTS.iterations);
  const parallelism = Number(env.ARGON2_PARALLELISM || ARGON2_DEFAULTS.parallelism);

  return {
    parallelism: Number.isFinite(parallelism) && parallelism > 0 ? parallelism : 1,
    iterations: Number.isFinite(iterations) && iterations > 0 ? iterations : 2,
    memorySize: Number.isFinite(memorySize) && memorySize >= 8192 ? memorySize : 8192,
    hashLength: 32,
    outputType: "encoded",
  };
}

export function isArgon2Hash(stored) {
  return typeof stored === "string" && stored.startsWith("$argon2id$");
}

export async function hashPasswordArgon2(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({
    ...argon2Params(env),
    password,
    salt,
  });
}

export async function verifyPasswordArgon2(password, stored) {
  if (!isArgon2Hash(stored)) {
    return false;
  }

  try {
    return await argon2Verify({
      password,
      hash: stored,
    });
  } catch {
    return false;
  }
}
