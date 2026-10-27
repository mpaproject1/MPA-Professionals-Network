import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";

// Load the repository-root .env for direct Node/cPanel starts. Environment
// variables supplied by the host take precedence over values in this file.
const envFile=fileURLToPath(new URL("../../.env",import.meta.url));
if(existsSync(envFile)) process.loadEnvFile(envFile);
