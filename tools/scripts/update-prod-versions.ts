import fs from "fs";
import path from "path";

const versionsDir = "build/s3-data";
const prodVersionsFile = path.join(versionsDir, "versions-prod.json");
const prodVersionsContent = fs.readFileSync(prodVersionsFile);
const currentVersionsContent = fs.readFileSync(path.join(versionsDir, "versions.json"));

const prodVersions = JSON.parse(prodVersionsContent);
const currentVersions = JSON.parse(currentVersionsContent);

Object.entries(currentVersions).forEach(([key, value]) => {
  console.log(`Updating version: ${key} -> ${value}`);
  prodVersions[key] = value;
});

fs.writeFileSync(prodVersionsFile, JSON.stringify(prodVersions, null, 1));
