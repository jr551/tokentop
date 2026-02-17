import * as os from "os";
import * as path from "path";

const HOME = os.homedir();

export const PATHS = {
  config: {
    dir: path.join(HOME, ".config/tokentop"),
    file: path.join(HOME, ".config/tokentop/config.json"),
    fileJsonc: path.join(HOME, ".config/tokentop/config.jsonc"),
    plugins: path.join(HOME, ".config/tokentop/plugins"),
  },
  data: {
    dir: path.join(HOME, ".local/share/tokentop"),
    database: path.join(HOME, ".local/share/tokentop/usage.db"),
    sessions: path.join(HOME, ".local/share/tokentop/sessions"),
    cache: path.join(HOME, ".local/share/tokentop/cache"),
    logs: path.join(HOME, ".local/share/tokentop/logs"),
  },
  cache: {
    dir: path.join(HOME, ".cache/tokentop"),
    nodeModules: path.join(HOME, ".cache/tokentop/node_modules"),
  },
} as const;
