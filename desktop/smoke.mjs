// Runs a real isolated Electron window; test data never shares the user's profile.
import { app, dialog } from "electron";
import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchDesktop } from "./application.mjs";

async function run() {
  try {
    const [profileDirectory, importDirectory, reportFile] =
      process.argv.slice(2);
    const errors = [];
    app.on("web-contents-created", (_event, contents) => {
      contents.on("render-process-gone", (_event, details) =>
        errors.push(details.reason),
      );
      contents.on("console-message", (details) => {
        if (details.level === "error") errors.push(details.message);
      });
    });
    const runtime = await launchDesktop({
      profileDirectory,
      importDirectory,
      visible: false,
    });
    assert.ok(runtime, "Desktop instance should start");
    const { window, origin, token } = runtime;
    window.webContents.setBackgroundThrottling(false);
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const waitFor = async (code) => {
      const deadline = Date.now() + 5000;
      while (!(await evaluate(code))) {
        if (Date.now() > deadline) throw new Error(`UI condition timed out: ${code}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    const capture = async (name, rectangle) => {
      await new Promise(resolve => setTimeout(resolve, 400));
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const image = await window.webContents.capturePage(rectangle, { stayHidden: true, stayAwake: true });
      await writeFile(path.join(path.dirname(reportFile), name), image.toPNG());
    };
    const selectedStorage = path.join(path.dirname(profileDirectory), "selected-storage");
    assert.equal((await fetch(origin + "/api/projects")).status, 403);
    const headers = { cookie: `sidequest_session=${token}` };
    const before = await (
      await fetch(origin + "/api/projects", { headers })
    ).json();
    assert.equal(before.projects.length, 4);
    assert.equal(before.language, "en");
    assert.equal(before.projectsPanelWidth, 350);
    assert.equal(before.referencePanelWidth, 315);
    assert.equal(runtime.service.getLanguage(), "en");
    if (process.argv.includes("--storage-relaunch")) {
      assert.equal(before.storagePath, await realpath(selectedStorage));
      assert.equal(before.projects[0].status, "paused");
      assert.ok(before.references.some(reference => reference.title === "Reference"));
      await waitFor("!!document.querySelector('.browse-button:not(:disabled)')");
      await evaluate("document.querySelector('.browse-button').click()");
      await waitFor("!!document.querySelector('.project-heading .project-status')");
      await evaluate(`document.querySelector('[aria-label="How it works"]').click()`);
      await waitFor("!!document.querySelector('.storage-choose')");
      assert.equal(await evaluate("document.querySelector('.storage-path').textContent"), before.storagePath);
      assert.equal(await evaluate("!!document.querySelector('.storage-pending')"), false);
      await capture("desktop-storage-relaunch.png");
      assert.deepEqual(errors, []);
      await writeFile(reportFile, JSON.stringify({ storagePath: before.storagePath, projects: before.projects.length, errors }, null, 2));
      window.close();
      return;
    }
    const invalid = await fetch(origin + "/api/projects", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assert.equal(
      (await invalid.json()).error,
      "Please check the “Name” field.",
    );
    assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
    assert.equal(
      window.webContents.getLastWebPreferences().nodeIntegration,
      false,
    );
    const updated = await fetch(
      origin + `/api/projects/${before.projects[0].id}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          pinned: true,
          status: "paused",
          description: "Desktop проверка",
          descriptionHtml: "<p><strong>Desktop</strong> проверка</p>",
        }),
      },
    );
    assert.equal(updated.status, 200);
    const readyDeadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      ready = await window.webContents.executeJavaScript(
        "!!document.querySelector('.app-shell .brand') && !!document.querySelector('.picker-heading')",
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "The built application UI should become ready");
    await waitFor("[...document.querySelectorAll('.brand-lockup img')].length === 4 && [...document.querySelectorAll('.brand-lockup img')].every(image => image.complete && image.naturalWidth > 0)");
    const logo = await evaluate(`(() => {
      const icon = document.querySelector('.brand .brand-mark').getBoundingClientRect();
      const wordmark = document.querySelector('.brand .brand-wordmark').getBoundingClientRect();
      return { iconRatio: icon.width / icon.height, wordmarkRatio: wordmark.width / wordmark.height };
    })()`);
    assert.ok(Math.abs(logo.iconRatio - 1) < 0.01);
    assert.ok(Math.abs(logo.wordmarkRatio - 5) < 0.01);
    const framePolicy = await window.webContents.executeJavaScript(
      "fetch('/').then(response => response.headers.get('content-security-policy'))",
    );
    assert.match(framePolicy, /frame-ancestors 'none'/);
    const reference = await fetch(origin + `/api/projects/${before.projects[0].id}/links`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "Reference", url: "https://example.com/reference" }),
    });
    assert.equal(reference.status, 201);
    assert.equal((await fetch(origin + "/api/browser", { headers })).status, 404);
    assert.equal(runtime.service.browserBridge, undefined);
    await window.reload();
    await waitFor("!!document.querySelector('.browse-button:not(:disabled)')");
    await evaluate("document.querySelector('.browse-button').click()");
    await waitFor("!!document.querySelector('.project-heading .project-status')");
    assert.equal(await evaluate("!!document.querySelector('.browser-integration')"), false);
    let badgeLayout;
    for (const [status, label] of [["planned", "Planned"], ["in_progress", "In progress"], ["completed", "Completed"], ["paused", "On hold"]]) {
      await evaluate(`document.querySelector('.project-status').open = true; document.querySelector('.status-option[data-status="${status}"]').click()`);
      await waitFor(`document.querySelector('.project-heading .project-status')?.dataset.status === '${status}' && !document.querySelector('.project-status').open`);
      assert.equal(await evaluate("document.querySelector('.project-state').textContent.trim()"), label);
      assert.equal(await evaluate("!!document.querySelector('.project-state .status-icon')"), true);
      const layout = await evaluate(`(() => {
        const badge = document.querySelector('.project-state').getBoundingClientRect();
        const title = document.querySelector('.project-heading h1').getBoundingClientRect();
        const rounded = value => Math.round(value * 100) / 100;
        return { width: rounded(badge.width), height: rounded(badge.height), left: rounded(badge.left), top: rounded(badge.top), titleLeft: rounded(title.left), rightAligned: Math.abs(document.querySelector('.project-heading-actions').getBoundingClientRect().right - document.querySelector('.project-heading').getBoundingClientRect().right) < 1 && badge.left >= title.right };
      })()`);
      assert.equal(layout.width, 148);
      assert.equal(layout.height, 30);
      assert.equal(layout.rightAligned, true);
      if (badgeLayout) assert.deepEqual(layout, badgeLayout, 'Changing status must not shift the badge or title');
      badgeLayout = layout;
      if (status === "completed") {
        await capture("desktop-status-completed.png");
        const headerRectangle = await evaluate(`(() => {
          const rect = document.querySelector('.project-heading').getBoundingClientRect();
          return { x: Math.floor(rect.left), y: Math.floor(rect.top - 8), width: Math.ceil(rect.width), height: Math.ceil(rect.height + 16) };
        })()`);
        await capture("desktop-status-header-right.png", headerRectangle);
        await evaluate("document.documentElement.dataset.appearance = 'light'");
        await waitFor("getComputedStyle(document.querySelector('.project-state')).backgroundColor === 'rgb(247, 249, 252)'");
        await capture("desktop-status-completed-light.png");
        await evaluate("document.documentElement.dataset.appearance = 'dark'");
      }
    }
    window.setSize(900, 620);
    const longName = before.projects[0].name + " / Very long project name ".repeat(5);
    await evaluate(`document.querySelector('.project-heading h1').textContent = ${JSON.stringify(longName)}`);
    assert.equal(await evaluate(`(() => {
      const row = document.querySelector('.project-heading');
      const badge = document.querySelector('.project-status');
      const pill = document.querySelector('.project-state').getBoundingClientRect();
      const title = document.querySelector('.project-heading h1').getBoundingClientRect();
      return row.scrollWidth <= row.clientWidth + 1 && Math.abs(pill.width - 148) < 0.01 && Math.abs(pill.height - 30) < 0.01 && (title.right <= badge.getBoundingClientRect().left || title.bottom <= pill.top + 1);
    })()`), true);
    await evaluate("document.querySelector('.project-status').open = true");
    assert.equal(await evaluate(`(() => {
      const menu = document.querySelector('.project-status-menu').getBoundingClientRect();
      const heading = document.querySelector('.project-heading').getBoundingClientRect();
      return menu.right <= heading.right + 1 && menu.left >= heading.left - 1;
    })()`), true, 'The status menu opens inward from the right');
    await capture("desktop-status-menu-right.png");
    await evaluate("document.querySelector('.project-status').open = false");
    await capture("desktop-status-long-name.png");
    await evaluate(`document.querySelector('.project-heading h1').textContent = ${JSON.stringify(before.projects[0].name)}`);
    window.setSize(1280, 800);
    await mkdir(selectedStorage);
    let folderSelections = 0;
    // Exercise the real UI/API/main-process callback, substituting only the native picker response.
    dialog.showOpenDialog = async (parent, options) => {
      assert.equal(parent, window);
      assert.ok(options.properties.includes("openDirectory"));
      folderSelections++;
      return { canceled: false, filePaths: [selectedStorage] };
    };
    await evaluate(`document.querySelector('[aria-label="How it works"]').click()`);
    await waitFor("!!document.querySelector('.storage-choose')");
    await evaluate("document.querySelector('.storage-choose').click()");
    await waitFor("!!document.querySelector('.storage-pending') && !document.querySelector('.storage-cancel').disabled");
    await evaluate("document.querySelector('.storage-cancel').click()");
    await waitFor("!document.querySelector('.storage-pending')");
    await evaluate("document.querySelector('.storage-choose').click()");
    await waitFor("!!document.querySelector('.storage-pending') && !document.querySelector('.storage-cancel').disabled");
    assert.equal(folderSelections, 2);
    assert.equal(await evaluate("document.querySelector('.storage-pending code').textContent"), await realpath(selectedStorage));
    await capture("desktop-storage-pending.png");
    await evaluate("document.querySelector('.help-content > .button').click()");
    assert.equal(app.getName(), "ProjiSpace");
    assert.match(window.getTitle(), /^ProjiSpace/);
    assert.equal(window.webContents.isCrashed(), false);
    assert.deepEqual(errors, []);
    await mkdir(path.dirname(reportFile), { recursive: true });
    let screenshot;
    const captureDeadline = Date.now() + 3000;
    while (!screenshot) {
      try {
        screenshot = await window.webContents.capturePage(undefined, { stayHidden: true });
      } catch (error) {
        // A ready hidden renderer can precede Chromium's first capturable frame.
        if (error.message !== "UnknownVizError" || Date.now() >= captureDeadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await writeFile(reportFile.replace(/\.json$/, ".png"), screenshot.toPNG());
    await writeFile(
      reportFile,
      JSON.stringify(
        {
          electron: process.versions.electron,
          node: process.versions.node,
          chromium: process.versions.chrome,
          startupMs: runtime.startupMs,
          migration: runtime.migration,
          statusBadges: true,
          storageFolderSelection: true,
          pendingStorage: await realpath(selectedStorage),
          gpu: app.getGPUFeatureStatus(),
          rendererCrashed: false,
          windowBounds: window.getBounds(),
          projects: before.projects.length,
          language: before.language,
          errors,
        },
        null,
        2,
      ),
    );
    window.close();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
run();
