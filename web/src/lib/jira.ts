import type { TestCase, TestGenerationResult } from "@/types/test-case";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export interface JiraConfig {
  baseUrl: string;
  pat: string;
  projectId: string;
  testIssueTypeId: string;
  manualTestTypeId: string;
  fixVersionId: string;
  componentIds: string[];
  pemPath: string;
}

const STORAGE_KEY = "jira-config";

const DEFAULTS: JiraConfig = {
  baseUrl: "https://air-jira.intranet.baesystems.com",
  pat: "",
  projectId: "13102",
  testIssueTypeId: "10100",
  manualTestTypeId: "10100",
  fixVersionId: "106502",
  componentIds: ["115101"],
  pemPath: "BAE-Systems-Root-CA-UK-2015.pem",
};

export function loadJiraConfig(): JiraConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveJiraConfig(config: JiraConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isJiraConfigured(config: JiraConfig): boolean {
  return !!(config.baseUrl && config.pat && config.projectId);
}

// ---------------------------------------------------------------------------
// Payload transformation
// ---------------------------------------------------------------------------

// Jira REST API v2 issue create payload
export interface JiraIssuePayload {
  fields: {
    project: { id: string };
    issuetype: { id: string };
    summary: string;
    description: string;
    customfield_10200: { id: string }; // TEST_TYPE_FIELD (Manual)
    customfield_10204: {
      // TEST_STEPS_FIELD
      steps: Array<{
        fields: {
          action: string;
          "expected result": string;
        };
      }>;
    };
    fixVersions: Array<{ id: string }>;
    components: Array<{ id: string }>;
    labels: string[];
  };
}

export function transformTestCaseToJiraPayload(
  testCase: TestCase,
  labels: string[],
  config: JiraConfig
): JiraIssuePayload {
  // Build description from scenario + expected result + preconditions
  let description = testCase.description?.scenario ?? "";
  if (testCase.description?.expected_result) {
    description += `\n*Expected Result:*\n${testCase.description.expected_result}`;
  }
  if (testCase.preconditions) {
    description += `\n*Pre-conditions:*\n${testCase.preconditions}`;
  }

  return {
    fields: {
      project: { id: config.projectId },
      issuetype: { id: config.testIssueTypeId },
      summary: testCase.summary,
      description,
      customfield_10200: { id: config.manualTestTypeId },
      customfield_10204: {
        steps: (testCase.steps ?? []).map((step) => ({
          fields: {
            action: step.action,
            "expected result": step.expected_result,
          },
        })),
      },
      fixVersions: config.fixVersionId
        ? [{ id: config.fixVersionId }]
        : [],
      components: config.componentIds.map((id) => ({ id })),
      labels,
    },
  };
}

// ---------------------------------------------------------------------------
// API calls (go through Vite dev server proxy)
// ---------------------------------------------------------------------------

export interface JiraCreateResult {
  key: string;
  id: string;
  self: string;
}

export async function testJiraConnection(
  config: JiraConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/jira/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        pat: config.pat,
        pemPath: config.pemPath,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export async function sendTestCaseToJira(
  payload: JiraIssuePayload,
  config: JiraConfig
): Promise<JiraCreateResult> {
  const res = await fetch("/api/jira/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      pat: config.pat,
      pemPath: config.pemPath,
      issue: payload,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Jira returned HTTP ${res.status}`);
  }
  return data as JiraCreateResult;
}

export interface SendResult {
  index: number;
  summary: string;
  key?: string;
  error?: string;
}

export async function sendAllTestCases(
  result: TestGenerationResult,
  selectedIndices: number[],
  config: JiraConfig,
  onProgress: (completed: number, total: number, latest: SendResult) => void
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const total = selectedIndices.length;

  for (let i = 0; i < selectedIndices.length; i++) {
    const idx = selectedIndices[i];
    const tc = result.test_cases[idx];
    const payload = transformTestCaseToJiraPayload(
      tc,
      result.mte_labels ?? [],
      config
    );

    let sendResult: SendResult;
    try {
      const jiraResult = await sendTestCaseToJira(payload, config);
      sendResult = { index: idx, summary: tc.summary, key: jiraResult.key };
    } catch (err) {
      sendResult = {
        index: idx,
        summary: tc.summary,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }

    results.push(sendResult);
    onProgress(i + 1, total, sendResult);
  }

  return results;
}

// ---------------------------------------------------------------------------
// ECR Search
// ---------------------------------------------------------------------------

export interface EcrSearchResult {
  key: string;
  summary: string;
}

export interface EcrIssueDetail {
  key: string;
  summary: string;
  description: string;
  labels: string[];
  components: string[];
}

/**
 * Search Jira for ECR issues matching a query string.
 * Uses JQL text search which handles partial/fuzzy matching.
 */
export async function searchEcrs(
  query: string,
  config: JiraConfig
): Promise<EcrSearchResult[]> {
  // Build JQL: search by key directly if it looks like an issue key, otherwise text search
  const trimmed = query.trim();
  let jql: string;

  if (/^[A-Z]+-\d+$/i.test(trimmed)) {
    // Exact key lookup
    jql = `key = "${trimmed.toUpperCase()}"`;
  } else if (/^[A-Z]+-/i.test(trimmed)) {
    // Partial key like "ECR-71" — search by key prefix
    jql = `key >= "${trimmed.toUpperCase()}0" AND key <= "${trimmed.toUpperCase()}z" ORDER BY key ASC`;
  } else {
    // Free text search across ECR and MDR projects
    jql = `project in (ECR, MDR) AND text ~ "${trimmed}*" ORDER BY updated DESC`;
  }

  const res = await fetch("/api/jira/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      pat: config.pat,
      pemPath: config.pemPath,
      jql,
      maxResults: 10,
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.issues ?? []).map((issue: { key: string; fields: { summary: string } }) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? "",
  }));
}

/**
 * Fetch full ECR issue details and format as ECR text for the prompt.
 */
export async function fetchEcrDetail(
  issueKey: string,
  config: JiraConfig
): Promise<EcrIssueDetail> {
  const res = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`, {
    headers: {
      "x-jira-pat": config.pat,
      "x-jira-url": config.baseUrl,
      "x-jira-pem": config.pemPath,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to fetch ${issueKey}`);
  }

  const data = await res.json();
  const fields = data.fields ?? {};

  return {
    key: data.key,
    summary: fields.summary ?? "",
    description: fields.description ?? "",
    labels: fields.labels ?? [],
    components: (fields.components ?? []).map((c: { name: string }) => c.name),
  };
}

/**
 * Strip Jira wiki markup to clean plaintext that matches the format
 * the system prompt expects (matching the manual ECR .txt files).
 */
function stripJiraMarkup(wiki: string): string {
  let text = wiki;

  // Remove {noformat}...{noformat} wrappers but keep content
  text = text.replace(/\{noformat\}/g, "");
  // Remove {code}...{code} wrappers but keep content
  text = text.replace(/\{code(?::[^}]*)?\}/g, "");
  // Remove {panel}...{panel} wrappers
  text = text.replace(/\{panel(?::[^}]*)?\}/g, "");
  // Remove {color}...{color} wrappers
  text = text.replace(/\{color(?::[^}]*)?\}/g, "");
  // Remove {quote}...{quote} wrappers
  text = text.replace(/\{quote\}/g, "");

  // Convert headings: h1. h2. h3. etc -> plain text with colon
  text = text.replace(/^h[1-6]\.\s*/gm, "");

  // Remove bold: *text* -> text
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  // Remove italic: _text_ -> text
  text = text.replace(/_([^_\n]+)_/g, "$1");
  // Remove strikethrough: -text- -> text
  text = text.replace(/-([^-\n]+)-/g, "$1");
  // Remove underline: +text+ -> text
  text = text.replace(/\+([^+\n]+)\+/g, "$1");
  // Remove superscript: ^text^ -> text
  text = text.replace(/\^([^^]+)\^/g, "$1");
  // Remove subscript: ~text~ -> text
  text = text.replace(/~([^~]+)~/g, "$1");
  // Remove monospace: {{text}} -> text
  text = text.replace(/\{\{([^}]+)\}\}/g, "$1");

  // Convert links: [text|url] -> text, [url] -> url
  text = text.replace(/\[([^|[\]]+)\|[^\]]+\]/g, "$1");
  text = text.replace(/\[([^\]]+)\]/g, "$1");

  // Convert wiki tables: ||header|| -> header, |cell| -> cell
  text = text.replace(/\|\|/g, " | ");
  text = text.replace(/\|/g, " | ");

  // Convert bullet lists: * item or ** item or - item -> - item
  text = text.replace(/^\*+\s+/gm, "- ");
  text = text.replace(/^#+\s+/gm, "- ");

  // Remove image macros: !image.png! or !image.png|params!
  text = text.replace(/!([^!\n]+)!/g, "");

  // Remove {anchor:...}
  text = text.replace(/\{anchor:[^}]*\}/g, "");

  // Clean up excess whitespace
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Format an ECR issue into the text format expected by the system prompt.
 * Matches the structure of the manual ECR .txt files:
 *   Title: ...
 *   Labels: ...
 *   Components: ...
 *
 *   Description:
 *   Requirement/Issue: ...
 *   Exact Change Required: ...
 *   Benefit: ...
 */
export function formatEcrAsText(ecr: EcrIssueDetail): string {
  const lines: string[] = [];
  lines.push(`Title: ${ecr.summary}`);
  if (ecr.labels.length > 0) lines.push(`Labels: ${ecr.labels.join(", ")}`);
  if (ecr.components.length > 0) lines.push(`Components: ${ecr.components.join(", ")}`);
  lines.push("");
  lines.push(`Description:`);
  lines.push(stripJiraMarkup(ecr.description));
  return lines.join("\n");
}
