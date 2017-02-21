// @flow

import {
  _setCustomCacheDir as setCustomCacheDir,
} from "../../lib/cacheRepoUtils";

import {
  copyDir,
  mkdirp,
} from "../../lib/fileUtils";

import {
  parseDirString as parseFlowDirString,
} from "../../lib/flowVersion";

import {
  add as gitAdd,
  commit as gitCommit,
  init as gitInit,
} from "../../lib/git";

import {
  fs,
  path,
} from "../../lib/node";

import {
  getNpmLibDefs,
} from "../../lib/npm/npmLibDefs";

import {
  testProject,
} from "../../lib/TEST_UTILS";

import {
  _determineFlowVersion as determineFlowVersion,
  _installNpmLibDefs as installNpmLibDefs,
  _installNpmLibDef as installNpmLibDef,
} from "../newInstall";

const BASE_FIXTURE_ROOT = path.join(__dirname, '__install-fixtures__');

function _mock(mockFn) {
  return ((mockFn: any): JestMockFn);
}

async function touchFile(filePath) {
  await fs.close(await fs.open(filePath, 'w'));
}

async function writePkgJson(filePath, pkgJson) {
  await fs.writeFile(filePath, JSON.stringify(pkgJson));
}

describe("install (command)", () => {
  describe("determineFlowVersion", () => {
    pit("infers version from path if arg not passed", () => {
      return testProject(async (ROOT_DIR) => {
        const ARBITRARY_PATH = path.join(ROOT_DIR, "some", "arbitrary", "path");
        await Promise.all([
          mkdirp(ARBITRARY_PATH),
          touchFile(path.join(ROOT_DIR, ".flowconfig")),
          writePkgJson(path.join(ROOT_DIR, "package.json"), {
            name: "test",
            devDependencies: {
              "flow-bin": "^0.40.0",
            },
          }),
        ]);

        const flowVer = await determineFlowVersion(ARBITRARY_PATH);
        expect(flowVer).toEqual({
          kind: "specific",
          ver: {
            major: 0,
            minor: 40,
            patch: 0,
            prerel: null,
          },
        });
      });
    });

    pit("uses explicitly specified version", async () => {
      const explicitVer = await determineFlowVersion("/", "0.7.0");
      expect(explicitVer).toEqual({
        kind: "specific",
        ver: {
          major: 0,
          minor: 7,
          patch: 0,
          prerel: null,
        }
      });
    });

    pit("uses 'v'-prefixed explicitly specified version", async () => {
      const explicitVer = await determineFlowVersion("/", "v0.7.0");
      expect(explicitVer).toEqual({
        kind: "specific",
        ver: {
          major: 0,
          minor: 7,
          patch: 0,
          prerel: null,
        }
      });
    });
  });

  describe("installNpmLibDefs", () => {
    const origConsoleError = console.error;
    beforeEach(() => {
      (console: any).error = jest.fn();
    });

    afterEach(() => {
      (console: any).error = origConsoleError;
    });

    pit("errors if unable to find a project root (.flowconfig)", () => {
      return testProject(async (ROOT_DIR) => {
        const result = await installNpmLibDefs({
          cwd: ROOT_DIR,
          flowVersion: parseFlowDirString('flow_v0.40.0'),
          explicitLibDefs: [],
          verbose: false,
          overwrite: false,
        });
        expect(result).toBe(1);
        expect(_mock(console.error).mock.calls).toEqual([[
          "Error: Unable to find a flow project in the current dir or any of " +
          "it's parent dirs!\n" +
          "Please run this command from within a Flow project."
        ]]);
      });
    });

    pit("errors if an explicitly specified libdef arg doesn't match npm " +
        "pkgver format", () => {
      return testProject(async (ROOT_DIR) => {
        await touchFile(path.join(ROOT_DIR, ".flowconfig"));
        const result = await installNpmLibDefs({
          cwd: ROOT_DIR,
          flowVersion: parseFlowDirString('flow_v0.40.0'),
          explicitLibDefs: ["INVALID"],
          verbose: false,
          overwrite: false,
        });
        expect(result).toBe(1);
        expect(_mock(console.error).mock.calls).toEqual([[
          "ERROR: Please specify npm package names in the format of `foo@1.2.3`"
        ]]);
      });
    });

    pit("errors if 0 dependencies are found in package.json", () => {
      return testProject(async (ROOT_DIR) => {
        await Promise.all([
          touchFile(path.join(ROOT_DIR, ".flowconfig")),
          writePkgJson(path.join(ROOT_DIR, "package.json"), {
            name: "test",
          }),
        ]);
        const result = await installNpmLibDefs({
          cwd: ROOT_DIR,
          flowVersion: parseFlowDirString('flow_v0.40.0'),
          explicitLibDefs: [],
          verbose: false,
          overwrite: false,
        });
        expect(result).toBe(1);
        expect(_mock(console.error).mock.calls).toEqual([[
          "No dependencies were found in this project\'s package.json!"
        ]]);
      });
    });
  });

  describe("installNpmLibDef", () => {
    const FIXTURE_ROOT = path.join(
      BASE_FIXTURE_ROOT,
      "installNpmLibDef",
    );

    const FIXTURE_FAKE_CACHE_REPO_DIR = path.join(
      FIXTURE_ROOT,
      "fakeCacheRepo",
    );

    const origConsoleLog = console.log;
    beforeEach(() => {
      (console: any).log = jest.fn();
    });

    afterEach(() => {
      (console: any).log = origConsoleLog;
    });

    pit("installs scoped libdefs within a scoped directory", () => {
      return testProject(async (ROOT_DIR) => {
        const FAKE_CACHE_DIR = path.join(ROOT_DIR, "fakeCache");
        const FAKE_CACHE_REPO_DIR = path.join(FAKE_CACHE_DIR, "repo");
        const FLOWPROJ_DIR = path.join(ROOT_DIR, "flowProj");
        const FLOWTYPED_DIR = path.join(FLOWPROJ_DIR, "flow-typed", "npm");

        await Promise.all([
          mkdirp(FAKE_CACHE_REPO_DIR),
          mkdirp(FLOWTYPED_DIR),
        ]);

        await Promise.all([
          copyDir(FIXTURE_FAKE_CACHE_REPO_DIR, FAKE_CACHE_REPO_DIR),
          touchFile(path.join(FLOWPROJ_DIR, ".flowconfig")),
          writePkgJson(path.join(FLOWPROJ_DIR, "package.json"), {
            name: "test",
            devDependencies: {
              "flow-bin": "^0.40.0",
            },
          }),
        ]);
        await gitInit(FAKE_CACHE_REPO_DIR),
        await gitAdd(FAKE_CACHE_REPO_DIR, "definitions");
        await gitCommit(FAKE_CACHE_REPO_DIR, 'FIRST');

        setCustomCacheDir(FAKE_CACHE_DIR);

        const availableLibDefs = await getNpmLibDefs(
          path.join(FAKE_CACHE_REPO_DIR, 'definitions'),
        );

        await installNpmLibDef(
          availableLibDefs[0],
          FLOWTYPED_DIR,
          false,
        );
      });
    });
  });
});
