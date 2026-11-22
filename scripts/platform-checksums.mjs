import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(process.argv[2] || "release");
const files = (await readdir(directory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(exe|dmg|zip)$/.test(entry.name))
  .map(entry => entry.name).sort();
if (!files.length) throw new Error("No installer artifacts found.");
const lines = [];
for (const name of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${name}`);
}
await writeFile(path.join(directory, "SHA256SUMS.txt"), lines.join("\n") + "\n");
console.log(`Wrote checksums for ${files.length} installer artifact(s).`);
