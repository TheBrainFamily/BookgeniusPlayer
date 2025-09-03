import fs from "fs";
import path from "path";

const versionsDir = "build/s3-data";
const prodVersionsFile = path.join(versionsDir, "versions-prod.json");
const currentVersionsFile = path.join(versionsDir, "versions.json");

try {
  if (!fs.existsSync(prodVersionsFile)) {
    console.log(`'${prodVersionsFile}' not found, skipping version merge.`);
    process.exit(0);
  }

  if (!fs.existsSync(currentVersionsFile)) {
    console.log(`'${currentVersionsFile}' not found, skipping version merge.`);
    process.exit(0);
  }

  const currentVersionsContent = fs.readFileSync(currentVersionsFile, "utf-8");
  let currentVersions = {};
  if (currentVersionsContent.trim()) {
    currentVersions = JSON.parse(currentVersionsContent);
  }

  const prodVersionsContent = fs.readFileSync(prodVersionsFile, "utf-8");
  let prodVersions = {};
  if (prodVersionsContent.trim()) {
    prodVersions = JSON.parse(prodVersionsContent);
  }

  Object.entries(currentVersions).forEach(([key, value]) => {
    console.log(`Updating version: ${key} -> ${value}`);
    prodVersions[key] = value;
  });

  fs.writeFileSync(currentVersionsFile, JSON.stringify(prodVersions, null, 1));
  console.log(`Successfully merged versions into '${currentVersionsFile}'.`);

} catch (error) {
  console.error(`Error updating production versions: ${error instanceof Error ? error.message : String(error)}`);
}