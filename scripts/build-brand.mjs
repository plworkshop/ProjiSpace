// Generate OS icon sizes from the supplied PNG, preserving its artwork and transparency.
import { app, BrowserWindow } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
async function build() {
  const profile = path.join(root, "qa", "brand-profile");
  await mkdir(profile, { recursive: true });
  app.setPath("userData", profile);
  await app.whenReady();
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: "brand-assets" } });
  try {
    await window.loadURL("data:text/html,<html><body></body></html>");
    const png = await readFile(path.join(root, "public", "brand", "app-icon.png"));
    const data = `data:image/png;base64,${png.toString("base64")}`;
    const render = async (size) => Buffer.from(await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify(data)};
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ${size};
      const scale = Math.min(${size} / image.naturalWidth, ${size} / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, (${size} - width) / 2, (${size} - height) / 2, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    })()`), "base64");
    const directory = path.join(root, "desktop", "assets");
    await writeFile(path.join(directory, "icon.png"), await render(1024));
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const frames = [];
    for (const size of sizes) frames.push(await render(size));
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    for (let index = 0; index < sizes.length; index++) {
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(frames[index].length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += frames[index].length;
    }
    await writeFile(path.join(directory, "icon.ico"), Buffer.concat([header, ...frames]));
    console.log("Brand assets generated:1024px PNG and seven ICO sizes.");
  } finally {
    window.destroy();
    app.quit();
  }
}
build().catch(error => { console.error(error); app.exit(1); });
