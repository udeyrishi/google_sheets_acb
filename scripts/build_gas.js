const path = require("path");
const fs = require("fs");
const { orderModules } = require("./utils/deps_utils");
const { stripForGas } = require("./utils/strip_utils");

const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "build");
const outFile = path.join(outDir, "Code.gs");
const START_TAG = "// @gas-remove-start";
const END_TAG = "// @gas-remove-end";

function readSourceFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
    .map((name) => ({
      fileName: name,
      moduleName: path.basename(name, ".js"),
      content: fs.readFileSync(path.join(dir, name), "utf8"),
    }));
}

function build() {
  const sources = readSourceFiles(srcDir);
  const order = orderModules(sources);
  const byName = new Map(sources.map((source) => [source.moduleName, source]));

  const sections = order.map((name) => {
    const source = byName.get(name);
    const stripped = stripForGas(source.content, START_TAG, END_TAG);
    return `// === ${source.fileName} ===\n${stripped}`;
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, sections.join("\n\n"), "utf8");
}

build();
