const { orderModules } = require("./deps_utils");

describe("orderModules", () => {
  it("orders modules based on dependencies", () => {
    const modules = [
      { moduleName: "Code", content: "require('./Aggregation');" },
      { moduleName: "Aggregation", content: "require('./Constants');" },
      { moduleName: "Constants", content: "" },
    ];

    const order = orderModules(modules);
    expect(order).toEqual(["Constants", "Aggregation", "Code"]);
  });
});
