import type { TestGenerationResult } from "@/types/test-case";

const OLLAMA_URL = "http://localhost:11434";

export interface ParseResult {
  data: TestGenerationResult;
  truncated: boolean;
}

/**
 * When JSON.parse fails on the full output, try to extract individual
 * test case objects and any top-level fields (mte_summary, mte_labels).
 */
function salvageTestCases(
  jsonStr: string
): TestGenerationResult | null {
  // Extract top-level fields before test_cases array
  let mteSummary = "";
  let mteLabels: string[] = [];
  const summaryMatch = jsonStr.match(/"mte_summary"\s*:\s*"([^"]*)"/);
  if (summaryMatch) mteSummary = summaryMatch[1];
  const labelsMatch = jsonStr.match(/"mte_labels"\s*:\s*(\[[^\]]*\])/);
  if (labelsMatch) {
    try {
      mteLabels = JSON.parse(labelsMatch[1]);
    } catch {
      /* ignore */
    }
  }

  // Find each test case object by looking for {"summary": patterns
  const testCases: Record<string, unknown>[] = [];
  const tcPattern = /\{"summary"/g;
  let match: RegExpExecArray | null;

  while ((match = tcPattern.exec(jsonStr)) !== null) {
    const tcStart = match.index;
    // Track brace depth to find matching close
    let depth = 0;
    let inStr = false;
    let esc = false;
    let tcEnd = -1;

    for (let i = tcStart; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          tcEnd = i;
          break;
        }
      }
    }

    if (tcEnd === -1) continue; // incomplete test case, skip

    let tcStr = jsonStr.slice(tcStart, tcEnd + 1);
    let tc: Record<string, unknown> | null = null;

    // Try parsing as-is first
    try {
      tc = JSON.parse(tcStr);
    } catch {
      // The extraction may have grabbed trailing ]} from parent structures.
      // Try stripping trailing ] and } characters until it parses.
      let trimmed = tcStr;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (trimmed.endsWith("]}")) {
          trimmed = trimmed.slice(0, -2);
        } else if (trimmed.endsWith("]") || trimmed.endsWith("}")) {
          trimmed = trimmed.slice(0, -1);
        } else {
          break;
        }
        // Re-close any unmatched braces after trimming
        let ob = 0,
          oq = 0,
          s = false,
          e = false;
        for (const c of trimmed) {
          if (e) { e = false; continue; }
          if (c === "\\") { e = true; continue; }
          if (c === '"') { s = !s; continue; }
          if (s) continue;
          if (c === "{") ob++;
          else if (c === "}") ob--;
          else if (c === "[") oq++;
          else if (c === "]") oq--;
        }
        let repaired = trimmed;
        for (let r = 0; r < oq; r++) repaired += "]";
        for (let r = 0; r < ob; r++) repaired += "}";
        try {
          tc = JSON.parse(repaired);
          break;
        } catch {
          // continue stripping
        }
      }
    }

    if (tc && tc.summary && tc.test_type) {
      // Handle case where steps ended up inside description
      if (
        !tc.steps &&
        tc.description?.steps &&
        Array.isArray((tc.description as Record<string, unknown>).steps)
      ) {
        const desc = tc.description as Record<string, unknown>;
        tc.steps = desc.steps;
        tc.preconditions = desc.preconditions ?? tc.preconditions;
        delete desc.steps;
        delete desc.preconditions;
      }
      if (tc.steps && Array.isArray(tc.steps)) {
        testCases.push(tc);
      }
    }
  }

  if (testCases.length === 0) return null;

  return {
    mte_summary: mteSummary,
    mte_labels: mteLabels,
    test_cases: testCases,
  } as unknown as TestGenerationResult;
}

export function parseJsonFromContent(
  content: string,
  wasTruncated = false
): ParseResult {
  let text = content.trim();

  // Strip <think>...</think> blocks — model may include braces inside thinking
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Strip "Thinking..." preamble (plain text thinking without tags)
  text = text.replace(/^[\s\S]*?\.\.\.done\s*thinking\.?\s*/i, "");

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const startIdx = text.indexOf("{");
  if (startIdx === -1) {
    throw new Error("No JSON found in model response");
  }

  // Find the matching closing brace by tracking depth
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  // If JSON is incomplete, try to repair it by closing open brackets/braces
  let jsonStr: string;

  if (endIdx === -1) {
    jsonStr = text.slice(startIdx);

    // Remove any trailing incomplete string value (e.g. cut off mid-sentence)
    // Find last complete key-value or array element
    jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
    // Remove trailing comma
    jsonStr = jsonStr.replace(/,\s*$/, "");

    // Count open brackets/braces and close them
    let openBraces = 0;
    let openBrackets = 0;
    let inStr = false;
    let esc = false;
    for (const ch of jsonStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }

    // Close in reverse order — brackets first, then braces
    for (let i = 0; i < openBrackets; i++) jsonStr += "]";
    for (let i = 0; i < openBraces; i++) jsonStr += "}";
  } else {
    jsonStr = text.slice(startIdx, endIdx + 1);
  }

  // Always salvage from the FULL text — the brace tracker may have
  // cut the string short due to extra } in malformed model output.
  const fullText = text.slice(startIdx);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // JSON.parse failed on brace-matched substring — expected when
    // model produces extra } that fools the depth tracker
  }

  // If parse succeeded but has suspiciously few test cases compared to
  // what the full text contains, prefer the salvage approach
  const fullMentions = (fullText.match(/"summary"/g) || []).length;
  const parsedCount = parsed?.test_cases && Array.isArray(parsed.test_cases)
    ? (parsed.test_cases as unknown[]).length
    : 0;

  if (!parsed || parsedCount < fullMentions) {
    const salvaged = salvageTestCases(fullText);
    if (salvaged && (salvaged.test_cases?.length ?? 0) > parsedCount) {
      return { data: salvaged, truncated: wasTruncated };
    }
  }

  if (!parsed) {
    throw new Error(
      `Failed to parse model output. The model produced malformed JSON.\n\nOutput length: ${content.length} chars`
    );
  }

  // Ensure test_cases exists
  if (!parsed.test_cases || !Array.isArray(parsed.test_cases)) {
    const salvaged = salvageTestCases(fullText);
    if (salvaged) {
      return { data: salvaged, truncated: wasTruncated };
    }
    throw new Error(
      `Model response is missing test_cases.\n\nParsed keys: ${Object.keys(parsed).join(", ")}\nOutput length: ${content.length} chars`
    );
  }

  // Fix test cases where model nested steps inside description
  for (const tc of parsed.test_cases as Record<string, unknown>[]) {
    const desc = tc.description as Record<string, unknown> | undefined;
    if (!tc.steps && desc?.steps && Array.isArray(desc.steps)) {
      tc.steps = desc.steps;
      tc.preconditions = desc.preconditions ?? tc.preconditions;
      delete desc.steps;
      delete desc.preconditions;
    }
  }

  // Filter out any incomplete test cases (missing required fields)
  const validCases = (parsed.test_cases as Record<string, unknown>[]).filter(
    (tc) => tc.summary && tc.test_type && tc.steps && Array.isArray(tc.steps)
  );
  parsed.test_cases = validCases;

  return {
    data: parsed as unknown as TestGenerationResult,
    truncated: wasTruncated,
  };
}

export async function generateTestCasesStream(
  systemPrompt: string,
  ecrText: string,
  onToken: (accumulated: string) => void,
  signal?: AbortSignal
): Promise<ParseResult> {
  const fullPrompt = systemPrompt + "\n" + ecrText;

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "bae-test-gen",
      messages: [{ role: "user", content: fullPrompt }],
      stream: true,
      options: {
        num_ctx: 32768,
        num_predict: 30000,
        temperature: 0,
        presence_penalty: 0.2,
      },
      think: false,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let accumulated = "";
  let doneReason = "";
  let lineBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    lineBuffer += chunk;

    // Process complete lines only — keep partial lines in buffer
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? ""; // last element may be incomplete

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const token = parsed.message?.content ?? "";
        if (token) {
          accumulated += token;
          onToken(accumulated);
        }
        // Ollama's final message includes done_reason: "stop" or "length"
        if (parsed.done && parsed.done_reason) {
          doneReason = parsed.done_reason;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  // Process any remaining buffered line
  if (lineBuffer.trim()) {
    try {
      const parsed = JSON.parse(lineBuffer.trim());
      const token = parsed.message?.content ?? "";
      if (token) {
        accumulated += token;
        onToken(accumulated);
      }
      if (parsed.done && parsed.done_reason) {
        doneReason = parsed.done_reason;
      }
    } catch {
      // ignore
    }
  }

  if (!accumulated.trim()) {
    throw new Error("Model returned empty response. Is Ollama running and is the model loaded?");
  }

  // "length" means the model hit the token limit and was cut off
  const wasTruncated = doneReason === "length";

  console.log("[bae-gen] Stream complete:", {
    chars: accumulated.length,
    doneReason,
    testCaseMentions: (accumulated.match(/"summary"/g) || []).length,
    first200: accumulated.slice(0, 200),
  });

  try {
    const result = parseJsonFromContent(accumulated, wasTruncated);
    console.log("[bae-gen] Parse result:", {
      testCases: result.data?.test_cases?.length,
      truncated: result.truncated,
    });
    return result;
  } catch (err) {
    console.error("Stream output length:", accumulated.length);
    console.error("First 500 chars:", accumulated.slice(0, 500));
    console.error("Last 500 chars:", accumulated.slice(-500));
    throw err;
  }
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
