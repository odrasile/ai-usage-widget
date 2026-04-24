import { runClaudeUsagePty } from "./backend/claudePty.js";

const result = await runClaudeUsagePty({ timeoutMs: 15000, cwd: "C:/Projects/MonitorAI" });
process.stdout.write(JSON.stringify(result, null, 2), () => process.exit(0));
