import * as _ from "lodash";
import * as logger from "../logger";
import * as FirebaseFunctionsTest from "firebase-functions-test";
import * as parseTriggers from "../parseTriggers";
import * as utils from "../utils";
import { WrappedFunction } from "firebase-functions-test/lib/main";
import { CloudFunction } from "firebase-functions";
import * as os from "os";
import * as path from "path";
import * as express from "express";
import * as fs from "fs";

export interface EmulatedTriggerDefinition {
  entryPoint: string;
  name: string;
  timeout?: string | number; // Can be "3s" for some reason lol
  regions?: string[];
  availableMemoryMb?: "128MB" | "256MB" | "512MB" | "1GB" | "2GB";
  httpsTrigger?: any;
  eventTrigger?: any;
}

export interface EmulatedTriggerMap {
  [name: string]: EmulatedTrigger;
}

// This bundle gets passed from hub -> runtime as a CLI arg
export interface FunctionsRuntimeBundle {
  projectId: string;
  proto?: any;
  triggerId?: string;
  ports: {
    firestore?: number;
  };
  disabled_features?: FunctionsRuntimeFeatures;
  cwd: string;
}

export interface FunctionsRuntimeFeatures {
  functions_config_helper?: boolean;
  network_filtering?: boolean;
  timeout?: boolean;
  memory_limiting?: boolean;
  protect_env?: boolean;
  admin_stubs?: boolean;
}

const memoryLookup = {
  "128MB": 128,
  "256MB": 256,
  "512MB": 512,
  "1GB": 1024,
  "2GB": 2048,
};

export class EmulatedTrigger {
  /*
  Here we create a trigger from a single definition (data about what resources does this trigger on, etc) and
  the actual module which contains multiple functions / definitions. We locate the one we need below using
  definition.entryPoint
   */
  constructor(public definition: EmulatedTriggerDefinition, private module: any) {}

  get memoryLimitBytes(): number {
    return memoryLookup[this.definition.availableMemoryMb || "128MB"] * 1024 * 1024;
  }

  get timeoutMs(): number {
    if (typeof this.definition.timeout === "number") {
      return this.definition.timeout * 1000;
    } else {
      return parseInt((this.definition.timeout || "60s").split("s")[0], 10) * 1000;
    }
  }

  getModule() {
    return this.module;
  }

  getRawFunction(): CloudFunction<any> {
    if (!this.module) {
      throw new Error("EmulatedTrigger has not been provided a module.");
    }

    const func = _.get(this.module, this.definition.entryPoint);
    return func.__emulator_func || func;
  }

  getWrappedFunction(fft: typeof FirebaseFunctionsTest): WrappedFunction {
    return fft().wrap(this.getRawFunction());
  }
}

export async function getTriggersFromDirectory(
  projectId: string,
  functionsDir: string,
  firebaseConfig: any
): Promise<EmulatedTriggerMap> {
  let triggerDefinitions;

  try {
    triggerDefinitions = await parseTriggers(
      projectId,
      functionsDir,
      {},
      JSON.stringify(firebaseConfig)
    );
  } catch (e) {
    utils.logWarning(`Failed to load functions source code.`);
    logger.info(e.message);
    return {};
  }

  return getEmulatedTriggersFromDefinitions(triggerDefinitions, functionsDir);
}

export function getEmulatedTriggersFromDefinitions(
  definitions: EmulatedTriggerDefinition[],
  module: any
): EmulatedTriggerMap {
  return definitions.reduce((obj: { [triggerName: string]: any }, definition: any) => {
    obj[definition.name] = new EmulatedTrigger(definition, module);
    return obj;
  }, {});
}

export function getTemporarySocketPath(pid: number): string {
  return path.join(os.tmpdir(), `firebase_emulator_invocation_${pid}.sock`);
}

export function getFunctionRegion(def: EmulatedTriggerDefinition): string {
  if (def.regions && def.regions.length > 0) {
    return def.regions[0];
  }

  return "us-central1";
}

export function waitForBody(req: express.Request): Promise<string> {
  let data = "";
  return new Promise((resolve) => {
    req.on("data", (chunk: any) => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });
  });
}

export function findModuleRoot(moduleName: string, filepath: string): string {
  const hierarchy = filepath.split(path.sep);

  for (let i = 0; i < hierarchy.length; i++) {
    try {
      let chunks = [];
      if (i) {
        chunks = hierarchy.slice(0, -i);
      } else {
        chunks = hierarchy;
      }
      const packagePath = path.join(chunks.join(path.sep), "package.json");
      const serializedPackage = fs.readFileSync(packagePath).toString();
      if (JSON.parse(serializedPackage).name === moduleName) {
        return chunks.join("/");
      }
      break;
    } catch (err) {
      /**/
    }
  }

  return "";
}
