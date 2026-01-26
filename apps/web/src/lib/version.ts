// Read web app version directly from package.json at build time
import pkg from "../../package.json";

export const webVersion = pkg.version;
