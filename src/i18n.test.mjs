import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import {
  dictionaries,
  english,
  languageOptions,
  supportedLanguages,
  translate,
} from "./translations.mjs";

test("every explicit UI translation has English copy and matching placeholders", () => {
  for (const file of readdirSync(new URL("./", import.meta.url)).filter(
    (file) => /\.tsx?$/.test(file),
  )) {
    const source = ts.createSourceFile(
      file,
      readFileSync(new URL(file, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        assert.ok(
          english[node.arguments[0].text],
          `${file}: missing ${node.arguments[0].text}`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("only English and Russian are selectable; all archived dictionaries remain complete", () => {
  assert.deepEqual(supportedLanguages, ["en", "ru"]);
  assert.deepEqual(
    languageOptions.map((option) => option.value),
    supportedLanguages,
  );
  assert.deepEqual(
    Object.keys(dictionaries).sort(),
    ["en", "de", "es", "fr", "pt", "uk", "he", "zh", "ja", "ko"].sort(),
  );
  const keys = Object.keys(english).sort();
  const placeholders = (text) =>
    [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(
      Object.keys(dictionary).sort(),
      keys,
      `${language}: translation keys`,
    );
    for (const [source, translated] of Object.entries(dictionary)) {
      assert.ok(
        translated.trim(),
        `${language}: empty translation for ${source}`,
      );
      assert.deepEqual(
        placeholders(source),
        placeholders(translated),
        `${language}: ${source}`,
      );
      assert.equal(
        translate(source, language),
        translated,
        `${language}: translation lookup`,
      );
    }
  }
  for (const source of keys) assert.equal(translate(source, "ru"), source);
});

test("translation preserves user content passed as values", () => {
  assert.equal(
    translate("Открыть проект {v0}", "en", { v0: "Мой сайт" }),
    "Open project Мой сайт",
  );
  assert.equal(
    translate("Открыть проект {v0}", "ru", { v0: "My website" }),
    "Открыть проект My website",
  );
  for (const language of supportedLanguages) {
    const text = translate("Открыть проект {v0}", language, {
      v0: "My проект / 2026",
    });
    assert.ok(text.includes("My проект / 2026"), language);
    assert.ok(!text.includes("{v0}"), language);
    assert.equal(
      translate("untranslated-user-content", language),
      "untranslated-user-content",
    );
  }
  assert.equal(
    translate("Новый проект", "unsupported"),
    english["Новый проект"],
  );
});
