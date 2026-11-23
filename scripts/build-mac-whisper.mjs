import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Arch } from "electron-builder";

const source = "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v1.9.2";
const sourceHash = "a6abd064fcca8b85e794d205abf328c522e9451db43a3eadc178b883b7d0e9cd";

export default function buildMacWhisper({ electronPlatformName, arch }) {
  if (electronPlatformName !== "darwin") return;
  const architecture = Arch[arch] === "x64" ? "x86_64" : "arm64";
  const output = fileURLToPath(new URL(`../artifacts/whisper-mac/${Arch[arch]}/`, import.meta.url));
  const work = mkdtempSync(path.join(tmpdir(), "projispace-whisper-build-"));
  const archive = path.join(work, "source.tar.gz");
  const build = path.join(work, "build");
  const run = (program, args) => execFileSync(program, args, { stdio: "inherit" });
  try {
    run("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "2", "--max-time", "180", "--output", archive, source]);
    if (createHash("sha256").update(readFileSync(archive)).digest("hex") !== sourceHash)
      throw new Error("Unexpected whisper.cpp source archive checksum");
    run("tar", ["-xzf", archive, "--strip-components=1", "-C", work]);
    run("cmake", [
      "-S", work, "-B", build,
      "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_SYSTEM_NAME=Darwin",
      `-DCMAKE_SYSTEM_PROCESSOR=${architecture}`, `-DCMAKE_OSX_ARCHITECTURES=${architecture}`,
      "-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0", "-DBUILD_SHARED_LIBS=OFF",
      "-DGGML_NATIVE=OFF", "-DGGML_METAL=OFF", "-DGGML_BLAS=OFF", "-DGGML_OPENMP=OFF",
      "-DGGML_AVX=OFF", "-DGGML_AVX2=OFF", "-DGGML_F16C=OFF", "-DGGML_FMA=OFF",
      "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_SERVER=OFF",
    ]);
    run("cmake", ["--build", build, "--target", "whisper-cli", "--parallel", "4"]);
    mkdirSync(output, { recursive: true });
    copyFileSync(path.join(build, "bin", "whisper-cli"), path.join(output, "whisper-cli"));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
