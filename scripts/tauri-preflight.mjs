import { execFileSync } from "node:child_process";

const required = [
  "gdk-3.0",
  "pango",
  "atk",
  "cairo",
  "gdk-pixbuf-2.0",
  "libsoup-3.0",
  "javascriptcoregtk-4.1"
];

if (process.platform !== "linux") {
  process.exit(0);
}

const missing = [];

for (const pkg of required) {
  if (!hasPkgConfigPackage(pkg)) {
    missing.push(pkg);
  }
}

if (missing.length === 0) {
  process.exit(0);
}

console.error("Tauri Ubuntu preflight failed.");
console.error(`Missing pkg-config packages: ${missing.join(", ")}`);
console.error("Install the system dependencies and retry:");
console.error("sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config");
process.exit(1);

function hasPkgConfigPackage(name) {
  try {
    execFileSync("pkg-config", ["--exists", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
