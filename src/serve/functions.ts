import { FunctionsEmulator, FunctionsEmulatorArgs } from "../emulator/functionsEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";

// TODO(samstern): It would be better to convert this to an EmulatorServer
// but we don't have the "options" object until start() is called.
module.exports = {
  emulatorServer: undefined,

  async start(options: any, args?: FunctionsEmulatorArgs): Promise<void> {
    args = args || {};

    if (!args.disabledRuntimeFeatures) {
      // When running the functions emulator through 'firebase serve' we disable some
      // of the more adventurous features that could be breaking/unexpected behavior
      // for those used to the legacy emulator.
      args.disabledRuntimeFeatures = {
        functions_config_helper: true,
        network_filtering: true,
        timeout: true,
        memory_limiting: true,
        protect_env: true,
        admin_stubs: true,
      };
    }

    if (options.host) {
      args.host = options.host;
    }

    // If hosting emulator is not being served but Functions is,
    // we can use the port argument. Otherwise it goes to hosting and
    // we use port + 1.
    if (options.port) {
      if (options.targets && options.targets.indexOf("hosting") < 0) {
        args.port = options.port;
      } else {
        args.port = options.port + 1;
      }
    }

    this.emulatorServer = new EmulatorServer(new FunctionsEmulator(options, args));
    await this.emulatorServer.start();
  },

  async connect(): Promise<void> {
    await this.emulatorServer.connect();
  },

  async stop(): Promise<void> {
    await this.emulatorServer.stop();
  },

  get(): FunctionsEmulator {
    return this.emulatorServer.get() as FunctionsEmulator;
  },
};
