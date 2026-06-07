import fs from "fs";
import path from "path";

function findAndPatch() {
  const dirs = [
    path.join(process.cwd(), "node_modules/@opencode-ai/plugin/dist/index.js"),
    path.join(process.cwd(), "../node_modules/@opencode-ai/plugin/dist/index.js"),
    path.join(process.cwd(), "../../node_modules/@opencode-ai/plugin/dist/index.js"),
  ];

  for (const targetPath of dirs) {
    if (fs.existsSync(targetPath)) {
      console.log(`Patching @opencode-ai/plugin at: ${targetPath}`);
      let content = fs.readFileSync(targetPath, "utf8");
      const original = 'export * from "./tool"';
      const replacement = 'export * from "./tool.js"';
      if (content.includes(original)) {
        content = content.replace(original, replacement);
        fs.writeFileSync(targetPath, content, "utf8");
        console.log("Successfully patched @opencode-ai/plugin.");
        return;
      }
    }
  }
  console.log("@opencode-ai/plugin/dist/index.js not found or already patched.");
}

findAndPatch();
