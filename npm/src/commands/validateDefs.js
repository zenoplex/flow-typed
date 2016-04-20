// @flow

import {fs, path} from "../lib/node.js";

import {versionToString} from "../lib/version.js";
import {getLocalLibDefs, getLocalLibDefFlowVersions} from "../lib/libDef.js";

function _verifyNoOverlappingFlowVersions(libDefFlowVers, errs) {
  const groupedByLibDef = new Map();
  libDefFlowVers.forEach(libDefFlowVer => {
    const libDef = libDefFlowVer.libDef;
    const libDefID = `${libDef.pkgName}@${libDef.pkgVersionStr}`;
    const group = groupedByLibDef.get(libDefID) || [];
    group.push(libDefFlowVer);
    groupedByLibDef.set(libDefID, group);
  });

  groupedByLibDef.forEach(([libDef, libDefName]) => {

  });
}

export const name = "validate-defs";
export const description =
  "Validates the structure of the definitions in the local repo.";
export async function run(args: {}): Promise<number> {
  const validationErrors = new Map();
  const localLibDefs = await getLocalLibDefs(validationErrors);
  const localLibDefFlowVersions = await getLocalLibDefFlowVersions(
    localLibDefs,
    validationErrors
  );

  _verifyNoOverlappingFlowVersions(localLibDefFlowVersions, validationErrors);

  console.log(" ");

  validationErrors.forEach((errors, pkgNameVersion) => {
    console.log("Found some problems with %s:", pkgNameVersion);
    errors.forEach((err) => console.log("  * " + err));
    console.log("");
  });

  if (validationErrors.size === 0) {
    console.log(
      `All flow-versioned library definitions are named and structured ` +
      `correctedly. (Found ${localLibDefFlowVersions.length})`
    );
    return 0;
  }

  return 1;
};
