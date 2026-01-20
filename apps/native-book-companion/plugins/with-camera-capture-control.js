const { withXcodeProject, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_FILES = ["CameraCaptureControl.h", "CameraCaptureControl.m"];

function ensureNativeFiles({ projectRoot, platformProjectRoot, projectName }) {
  const sourceDir = path.join(projectRoot, "plugins", "camera-capture-control", "ios");
  const targetDir = path.join(platformProjectRoot, projectName);

  if (!fs.existsSync(sourceDir) || !fs.existsSync(targetDir)) {
    return false;
  }

  MODULE_FILES.forEach((fileName) => {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    if (!fs.existsSync(sourcePath)) return;
    fs.copyFileSync(sourcePath, targetPath);
  });

  return true;
}

function addFilesToXcodeProject({ project, projectName, targetUuid }) {
  MODULE_FILES.forEach((fileName) => {
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${fileName}`,
      groupName: projectName,
      project,
      targetUuid,
    });
  });
}

module.exports = function withCameraCaptureControl(config) {
  return withXcodeProject(config, (config) => {
    const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
    const project = config.modResults;

    const didCopy = ensureNativeFiles({ projectRoot, platformProjectRoot, projectName });
    if (!didCopy) {
      return config;
    }

    const targets = IOSConfig.Target.findSignableTargets(project);
    const targetUuid = targets[0]?.uuid;
    if (!targetUuid) {
      return config;
    }

    addFilesToXcodeProject({ project, projectName, targetUuid });

    const projectPath = path.join(
      platformProjectRoot,
      `${projectName}.xcodeproj`,
      "project.pbxproj",
    );
    fs.writeFileSync(projectPath, project.writeSync());

    return config;
  });
};
