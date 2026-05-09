import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(projectRoot, "src-tauri", "generated", "resources");
const nodePtySource = path.join(projectRoot, "node_modules", "node-pty");
const nodePtyTarget = path.join(outputRoot, "node_modules", "node-pty");

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

copy(path.join(projectRoot, "backend"), path.join(outputRoot, "backend"));
copy(path.join(nodePtySource, "package.json"), path.join(nodePtyTarget, "package.json"));
copy(path.join(nodePtySource, "lib"), path.join(nodePtyTarget, "lib"));

const nativeDir = resolveNativeDir();
const nativeSource = path.join(nodePtySource, "prebuilds", nativeDir);
if (existsSync(nativeSource)) {
  copy(nativeSource, path.join(nodePtyTarget, "prebuilds", nativeDir));
} else if (process.platform !== "linux") {
  throw new Error(`Required node-pty prebuild not found: ${nativeSource}`);
}

const buildRelease = path.join(nodePtySource, "build", "Release");
if (existsSync(buildRelease)) {
  copy(buildRelease, path.join(nodePtyTarget, "build", "Release"));
}

if (process.platform === "darwin" && existsSync(path.join(nodePtyTarget, "prebuilds", nativeDir))) {
  signDarwinNodePtyBinaries(path.join(nodePtyTarget, "prebuilds", nativeDir));
}

console.log(`Prepared Tauri resources for node-pty ${nativeDir}.`);

function resolveNativeDir() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }

  if (platform === "win32") {
    return arch === "arm64" ? "win32-arm64" : "win32-x64";
  }

  return `${platform}-${arch}`;
}

function copy(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Required resource not found: ${source}`);
  }

  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function signDarwinNodePtyBinaries(prebuildDir) {
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  if (!identity) {
    console.log("APPLE_SIGNING_IDENTITY is not set; skipping node-pty codesign.");
    return;
  }

  const binaries = listFiles(prebuildDir).filter((file) => {
    const name = path.basename(file);
    return name === "spawn-helper" || name.endsWith(".node");
  });

  for (const binary of binaries) {
    const result = spawnSync(
      "codesign",
      ["--force", "--sign", identity, "--timestamp", "--options", "runtime", binary],
      { encoding: "utf8", stdio: "pipe" },
    );

    if (result.status !== 0) {
      throw new Error(`codesign failed for ${binary}: ${result.stderr || result.stdout}`);
    }
  }

  console.log(`Signed ${binaries.length} node-pty macOS binaries.`);
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}
