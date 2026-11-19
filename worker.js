import { parseTanggal, resolvePeriode } from './tanggal.js';
import { AGENT_SKILL_RULES, EXTRA_LIVE_INTENTS, EXTRA_READ_ACTIONS, buildSystemPrompt } from './cloudflare/agentSkills.js';
import { CODE_KNOWLEDGE } from './cloudflare/generated/code-knowledge.js';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;
const LIVE_DATA_CHAR_BUDGET = 9000;
const CODE_DATA_CHAR_BUDGET = 6500;
const MAX_LIVE_ACTIONS = 2;
const READ_ONLY_ACTIONS = new Set([
  'ping','status','getConfig','getDashboard','getDashboardData',
  'getAllStock','getStockAll','getStockByCode','searchByName',
  'getLowStock','getTransactionHistory','getStatusPO','bootstrap',
  'getStockDelta','getSyncMetrics','getLastUpdate','getPOAnalysis','getAgentKnowledge',
  ...EXTRA_READ_ACTIONS,
]);
// NOTE: Full worker.js content is large. This is a truncated placeholder for the tool call.
// The complete file will be updated in the next step.
export default { async fetch() { return new Response('placeholder'); } };
