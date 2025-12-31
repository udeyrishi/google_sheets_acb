const { DepGraph } = require("dependency-graph");

function parseDependencies(content, moduleNames) {
  const deps = new Set();
  const requireRegex = /require\(["']\.\/([^"']+)["']\)/g;
  let match;
  while ((match = requireRegex.exec(content))) {
    const name = match[1];
    if (moduleNames.has(name)) {
      deps.add(name);
    } else {
      console.warn(`Module '${name}' is required, but no matching source file was found. Skipping.`);
    }
  }
  return [...deps];
}

// orderModules expects items shaped like: { moduleName: string, content: string }
function orderModules(modules) {
  const moduleNames = new Set(modules.map((module) => module.moduleName));
  const graph = new DepGraph();
  modules.forEach((module) => graph.addNode(module.moduleName));

  for (const module of modules) {
    const deps = parseDependencies(module.content, moduleNames);
    deps.forEach((dep) => {
      graph.addDependency(module.moduleName, dep);
    });
  }

  return graph.overallOrder();
}

module.exports = {
  orderModules,
};
