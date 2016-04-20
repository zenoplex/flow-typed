// @flow

import * as semver from "semver";

type VersionRange = ">=" | "<=" | '=';
export type Version = {
  range: VersionRange,
  major: number,
  minor: number | "x",
  patch: number | "x",
  upperBound?: Version,
};

export function copyVersion(ver: Version): Version {
  return {
    range: ver.range,
    major: ver.major,
    minor: ver.minor,
    patch: ver.patch,
  };
}

// TODO: This has some egregious duplication with
//       libDef.getLocalLibDefFlowVersions(). Need to better consolidate logic
const VER = 'v([0-9]+)\.([0-9]+|x)\.([0-9]+|x)';
const VERSION_RE = new RegExp(
  `^([><]=?)?${VER}(_([><]=?)${VER})?$`
);
export function stringToVersion(verStr: string): Version {
  const versionParts = verStr.match(VERSION_RE);
  if (versionParts == null) {
    throw new Error(
      `${verStr} is a malformed version string. Expected a version formatted ` +
      "as `" + VERSION_RE.toString() + "`"
    );
  }
  let [
    _1, range, major, minor, patch,
    _2, upRange, upMajor, upMinor, upPatch,
  ] = versionParts;
  if (range != null && range !== ">=" && range !== "<=") {
    throw new Error(`'${verStr}': Invalid version range: ${range}`);
  }
  if (upRange != null && upRange !== ">=" && upRange !== "<=") {
    throw new Error(
      `'${verStr}': Invalid version upper-bound range: ${upRange}`
    );
  }

  major = _validateVersionNumberPart(verStr, "major", major);
  if (minor !== "x") {
    minor = _validateVersionNumberPart(verStr, "minor", minor);
  }
  if (patch !== "x") {
    patch = _validateVersionNumberPart(verStr, "patch", patch);
  }

  let upperBound;
  if (upMajor) {
    upMajor = _validateVersionNumberPart(verStr, "upper-bound major", upMajor);
    if (upMinor !== "x") {
      upMinor = _validateVersionNumberPart(verStr, "upper-bound minor", upMinor);
    }
    if (upPatch !== "x") {
      upPatch = _validateVersionNumberPart(verStr, "upper-bound patch", upPatch);
    }
    upperBound = {
      range: upRange,
      major: upMajor,
      minor: upMinor,
      patch: upPatch,
    };
  }

  if (range === '<=' && major === minor === patch === 0) {
    throw new Error(
      `It doesn't make sense to have a version range of '<=v0.0.0'!`
    );
  }

  return {range, major, minor, patch, upperBound};
};

export function versionToString(ver: Version): string {
  const rangeStr = ver.range ? ver.range : '';
  const upperBoundStr = ver.upperBound ? `_${versionToString(ver.upperBound)}` : '';
  return `${rangeStr}v${ver.major}.${ver.minor}.${ver.patch}${upperBoundStr}`;
};

function _validateVersionNumberPart(context, partName, part) {
  const num = parseInt(part, 10);
  if (String(num) !== part) {
    throw new Error(
      `${context}: Invalid ${partName} number. Expected a number.`
    );
  }
  return num;
}

/**
 * Just like semver.satisfies(), except it handles simple wildcard + range
 * operators in the "version" operand.
 *
 * Note that this is a quick and basic version that could probably be optimized
 * for common cases -- but will worry about that later.
 */
export function wildcardSatisfies(ver: Version, range: string): boolean {
  if (ver.major === 'x' && ver.minor === 'x' && ver.patch === 'x') {
    return true;
  } else if (ver.major === 'x') {
    const verCopy = copyVersion(ver);
    for (let i = 0; i <= 9; i++) {
      verCopy.major = i;
      if (wildcardSatisfies(verCopy, range)) {
        return true;
      }
    }
    return false;
  } else if (ver.minor === 'x') {
    const verCopy = copyVersion(ver);
    for (let i = 0; i <= 9; i++) {
      verCopy.minor = i;
      if (wildcardSatisfies(verCopy, range)) {
        return true;
      }
    }
    return false;
  } else if (ver.patch === 'x') {
    const verCopy = copyVersion(ver);
    for (let i = 0; i <= 9; i++) {
      verCopy.patch = i;
      if (wildcardSatisfies(verCopy, range)) {
        return true;
      }
    }
    return false;
  } else {
    return semver.satisfies(versionToString(ver), range);
  }
};

export function simplifyBoundedVersion(ver: Version): Version {
  const upperBound = ver.upperBound;
  if (!upperBound) {
    return ver;
  }

  const {
    range: loRange,
    major: loMajor,
    minor: loMinor,
    patch: loPatch,
  } = ver;

  const {
    range: hiRange,
    major: hiMajor,
    minor: hiMinor,
    patch: hiPatch,
  } = upperBound;

  // If lower and upper are the same, we don't need bounds...
  if (loRange === hiRange
      && loMajor === hiMajor
      && loMinor === hiMinor
      && loPatch === hiPatch) {
    return upperBound;
  }

  if (loRange === '<=') {
    switch (hiRange) {
      case '<=':
        // Compare majors
        if (loMajor < hiMajor) {
          return upperBound;
        }
        if (loMajor > hiMajor) {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }

        // Compare minors
        if (loMinor === 'x' && hiMinor !== 'x') {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }
        if (loMinor !== 'x' && hiMinor === 'x') {
          return upperBound;
        }
        if (loMinor !== 'x' && hiMinor !== 'x' && loMinor < hiMinor) {
          return upperBound;
        }
        if (loMinor !== 'x' && hiMinor !== 'x' && loMinor > hiMinor) {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }

        // Compare patches
        if (loPatch === 'x' && hiPatch !== 'x') {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }
        if (loPatch !== 'x' && hiPatch === 'x') {
          return upperBound;
        }
        if (loPatch !== 'x' && hiPatch !== 'x' && loPatch < hiPatch) {
          return upperBound;
        }
        if (loPatch !== 'x' && hiPatch !== 'x' && loPatch > hiPatch) {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }
        return ver;

      case '>=':
        if (loMajor === hiMajor && loMinor === hiMinor && loPatch === hiPatch) {
          return {range: '=', major: loMajor, minor: 'x', patch: 'x'};
        }
        return ver;

      case '=':
        return ver;
    }
  } else if (loRange === '>=') {
    switch (hiRange) {
      case '<=':
        if (loMajor === hiMajor && loMinor === hiMinor && loPatch === hiPatch) {
          return {range: '=', major: loMajor, minor: 'x', patch: 'x'};
        }
        return ver;

      case '>=':
        // Compare majors
        if (loMajor < hiMajor) {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }
        if (loMajor > hiMajor) {
          return upperBound;
        }

        // Compare minors
        if (loMinor === 'x' && hiMinor !== 'x') {
          const verCopy = copyVersion(ver);
          verCopy.upperBound = undefined;
          return verCopy;
        }
        if (loMinor !== 'x' && hiMinor === 'x') {
          return upperBound;
        }

      case '=':
        return ver;
    }
  }

  return ver;
};
