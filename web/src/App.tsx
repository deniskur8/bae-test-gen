import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  FileText,
  Play,
  Square,
  Copy,
  AlertCircle,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
  FileCode,
  Zap,
  Shield,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useGenerate } from "@/hooks/use-generate";
import { loadPromptList, loadEcrList } from "@/lib/ecr-loader";
import type { PromptFile, EcrFile } from "@/lib/ecr-loader";
import type { TestCase, TestGenerationResult } from "@/types/test-case";

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  // Prompt state
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptMode, setPromptMode] = useState<"file" | "custom">("file");
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // ECR state
  const [ecrs, setEcrs] = useState<EcrFile[]>([]);
  const [selectedEcr, setSelectedEcr] = useState("");
  const [ecrText, setEcrText] = useState("");

  // Model info
  const [modelInfo, setModelInfo] = useState<{ family: string; parameter_size: string } | null>(null);

  // Results state
  const [activeTab, setActiveTab] = useState<"cases" | "json">("cases");

  const { result, isLoading, error, elapsed, streamText, rawOutput, truncated, generate, cancel, reset } =
    useGenerate();

  // Load prompts + ECRs on mount
  useEffect(() => {
    loadPromptList()
      .then((list) => {
        setPrompts(list);
        // Default to latest version (last in sorted list)
        if (list.length > 0) {
          const latest = list[list.length - 1];
          setSelectedPrompt(latest.name);
          setSystemPrompt(latest.content);
        }
      })
      .catch(() => toast.error("Failed to load prompt files"));

    loadEcrList()
      .then(setEcrs)
      .catch(() => toast.error("Failed to load ECR list"));

    fetch("/api/model-info")
      .then((r) => r.json())
      .then(setModelInfo)
      .catch(() => {});
  }, []);

  const handlePromptSelect = useCallback(
    (value: string) => {
      setSelectedPrompt(value);
      const prompt = prompts.find((p) => p.name === value);
      if (prompt) setSystemPrompt(prompt.content);
    },
    [prompts]
  );

  const handleEcrSelect = useCallback(
    (value: string) => {
      setSelectedEcr(value);
      const ecr = ecrs.find((e) => e.name === value);
      if (ecr) setEcrText(ecr.content);
    },
    [ecrs]
  );

  const handleGenerate = useCallback(() => {
    if (!ecrText.trim()) {
      toast.error("Please enter an ECR before generating");
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error("No system prompt loaded");
      return;
    }
    reset();
    setActiveTab("cases");
    generate(systemPrompt, ecrText);
  }, [systemPrompt, ecrText, generate, reset]);

  const handleCopyJson = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast.success("JSON copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.mte_summary.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON file downloaded");
  }, [result]);

  const funcCount = result?.test_cases?.filter((t) => t.test_type === "Functional").length ?? 0;
  const regCount = result?.test_cases?.filter((t) => t.test_type === "Regression").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="h-1 bg-primary" />
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <img
              src="/bae-logo.svg"
              alt="BAE Systems"
              className="h-8"
            />
            <Separator orientation="vertical" className="h-6" />
            <div>
              <p className="text-sm font-semibold tracking-tight">
                ERP Test Case Generator
              </p>
              <p className="text-xs text-muted-foreground">
                {modelInfo
                  ? `${modelInfo.family} ${modelInfo.parameter_size}`
                  : "Connecting..."
                }
                {" "}&middot; Running locally via Ollama
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <>
                <Button variant="outline" size="sm" onClick={handleCopyJson}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
          {/* ============================================================= */}
          {/* Left Panel — Configuration */}
          {/* ============================================================= */}
          <div className="space-y-4">
            {/* System Prompt Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                      System Prompt
                    </CardTitle>
                  </div>
                  <div className="flex rounded-md border bg-muted p-0.5">
                    <button
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        promptMode === "file"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setPromptMode("file")}
                    >
                      From File
                    </button>
                    <button
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        promptMode === "custom"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setPromptMode("custom")}
                    >
                      Custom
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {promptMode === "file" ? (
                  <>
                    <Select value={selectedPrompt} onValueChange={handlePromptSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a prompt version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {prompts.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            <span className="font-mono text-xs">{p.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({(p.content.length / 1024).toFixed(1)}KB)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Collapsible preview */}
                    <button
                      className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPromptPreview(!showPromptPreview)}
                    >
                      {showPromptPreview ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {showPromptPreview ? "Hide preview" : "Preview prompt"}
                      {selectedPrompt && (
                        <span className="ml-auto text-muted-foreground/60">
                          {systemPrompt.split("\n").length} lines
                        </span>
                      )}
                    </button>

                    {showPromptPreview && (
                      <div className="rounded-md border bg-muted/30">
                        <ScrollArea className="h-[250px]">
                          <pre className="p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {systemPrompt}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Write or paste your own system prompt
                      </span>
                    </div>
                    <Textarea
                      placeholder="Enter your system prompt here..."
                      value={systemPrompt}
                      onChange={(e) => {
                        setSystemPrompt(e.target.value);
                        setSelectedPrompt("");
                      }}
                      className="min-h-[200px] font-mono text-[11px] leading-relaxed"
                    />
                  </>
                )}

                {systemPrompt && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{(systemPrompt.length / 1024).toFixed(1)} KB</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>~{Math.ceil(systemPrompt.length / 4).toLocaleString()} tokens</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ECR Input Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                    Change Request (ECR)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Select a saved ECR or paste one manually
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ecrs.length > 0 && (
                  <Select value={selectedEcr} onValueChange={handleEcrSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a saved ECR..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ecrs.map((ecr) => (
                        <SelectItem key={ecr.name} value={ecr.name}>
                          <span className="font-mono text-xs">{ecr.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Textarea
                  placeholder="Paste ECR content here...&#10;&#10;Title: ...&#10;Labels: ...&#10;Components: ...&#10;&#10;Description:&#10;Requirement/Issue: ...&#10;Exact Change Required: ..."
                  value={ecrText}
                  onChange={(e) => setEcrText(e.target.value)}
                  className="min-h-[220px] font-mono text-[11px] leading-relaxed"
                />
              </CardContent>
            </Card>

            {/* Generate Button */}
            {isLoading ? (
              <Button
                variant="destructive"
                className="w-full h-12 text-sm"
                onClick={cancel}
              >
                <Square className="mr-2 h-4 w-4" />
                Cancel Generation &middot; {elapsed}s
              </Button>
            ) : (
              <Button
                className="w-full h-12 text-sm font-semibold"
                onClick={handleGenerate}
                disabled={!ecrText.trim() || !systemPrompt.trim()}
              >
                <Play className="mr-2 h-4 w-4" />
                Generate Test Cases
              </Button>
            )}
          </div>

          {/* ============================================================= */}
          {/* Right Panel — Results */}
          {/* ============================================================= */}
          <div className="min-w-0">
            {/* Error State */}
            {error && (
              <ErrorView
                error={error}
                rawOutput={rawOutput}
                onRetry={handleGenerate}
              />
            )}

            {/* Loading State — Live Stream */}
            {isLoading && <StreamView streamText={streamText} elapsed={elapsed} />}

            {/* Empty State */}
            {!result && !isLoading && !error && <EmptyState />}

            {/* Truncation Warning */}
            {truncated && result && (
              <Card className="border-amber-500/50 bg-amber-500/5 mb-4">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-500">
                      Output was truncated
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The model ran out of tokens and only generated {result.test_cases?.length ?? 0} test case(s).
                      The prompt may be too large — try a shorter prompt version or reduce the expected test count.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleGenerate}>
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {result && !isLoading && (
              <ResultsView
                result={result}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onCopyJson={handleCopyJson}
                funcCount={funcCount}
                regCount={regCount}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-muted p-5 mb-5">
        <Shield className="h-10 w-10 text-muted-foreground/40" />
      </div>
      <p className="text-base font-medium text-muted-foreground">
        Ready to generate
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground/60 max-w-sm">
        Select a system prompt version, paste an ECR, and hit Generate to create
        X-Ray test case skeletons
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error View — shows error + raw model output for diagnostics
// ---------------------------------------------------------------------------
function ErrorView({
  error,
  rawOutput,
  onRetry,
}: {
  error: string;
  rawOutput: string | null;
  onRetry: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-3">
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-destructive">
                Generation failed
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry
            </Button>
            {rawOutput && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? "Hide" : "Show"} raw output ({rawOutput.length.toLocaleString()} chars)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {showRaw && rawOutput && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Raw Model Output
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                {rawOutput}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream View — shows live tokens as they arrive
// ---------------------------------------------------------------------------
function StreamView({ streamText, elapsed }: { streamText: string; elapsed: number }) {
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Generating test cases...{" "}
          <span className="font-mono font-medium text-foreground">{elapsed}s</span>
        </p>
        {streamText.length > 0 && (
          <span className="text-xs text-muted-foreground/60">
            {streamText.length.toLocaleString()} chars
          </span>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <pre
            ref={scrollRef}
            className="h-[600px] overflow-auto p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed"
          >
            {streamText || "Waiting for model response..."}
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary animate-pulse align-text-bottom" />
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results View
// ---------------------------------------------------------------------------
function ResultsView({
  result,
  activeTab,
  onTabChange,
  onCopyJson,
  funcCount,
  regCount,
}: {
  result: TestGenerationResult;
  activeTab: "cases" | "json";
  onTabChange: (tab: "cases" | "json") => void;
  onCopyJson: () => void;
  funcCount: number;
  regCount: number;
}) {
  return (
    <div className="space-y-4">
      {/* Result Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{result.mte_summary}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(result.mte_labels ?? []).map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <Separator className="mt-3" />
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">{funcCount}</span>
              <span className="text-xs text-muted-foreground">Functional</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-sm font-medium">{regCount}</span>
              <span className="text-xs text-muted-foreground">Regression</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">
              {result.test_cases?.length ?? 0} total test cases
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Tab Bar */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border bg-muted p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "cases"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onTabChange("cases")}
          >
            Test Cases
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "json"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onTabChange("json")}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "cases" ? (
        <div className="space-y-4">
          {(result.test_cases ?? []).map((tc, idx) => (
            <TestCaseCard key={idx} testCase={tc} index={idx} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-end gap-2 px-4 pt-3">
              <Button variant="ghost" size="sm" onClick={onCopyJson}>
                <Copy className="mr-2 h-3 w-3" />
                Copy
              </Button>
            </div>
            <ScrollArea className="h-[600px]">
              <pre className="px-4 pb-4 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test Case Card
// ---------------------------------------------------------------------------
function TestCaseCard({
  testCase,
  index,
}: {
  testCase: TestCase;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {expanded ? (
              <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <CardTitle className="text-sm">
              <span className="text-muted-foreground/60 mr-2 font-mono text-xs">
                {String(index + 1).padStart(2, "0")}
              </span>
              {testCase.summary}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {testCase.steps?.length ?? 0} steps
            </span>
            <Badge
              variant={testCase.test_type === "Functional" ? "default" : "outline"}
              className={`text-xs ${
                testCase.test_type === "Regression"
                  ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                  : ""
              }`}
            >
              {testCase.test_type}
            </Badge>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Description */}
          <div className="rounded-md bg-muted/30 p-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
                Scenario
              </p>
              <p className="text-sm leading-relaxed">{testCase.description?.scenario}</p>
            </div>
            <Separator />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
                Expected Result
              </p>
              <p className="text-sm leading-relaxed">
                {testCase.description?.expected_result}
              </p>
            </div>
          </div>

          {/* Preconditions */}
          {testCase.preconditions && (
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
                Preconditions
              </p>
              <p className="text-sm">{testCase.preconditions}</p>
            </div>
          )}

          {/* Steps Table */}
          {(testCase.steps?.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] text-xs">#</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="w-[80px] text-xs">Data</TableHead>
                  <TableHead className="text-xs">Expected Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(testCase.steps ?? []).map((step) => (
                  <TableRow key={step.step}>
                    <TableCell className="font-mono text-xs text-muted-foreground font-medium">
                      {step.step}
                    </TableCell>
                    <TableCell className="text-sm">{step.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground/60">
                      {step.data === "None" ? "--" : step.data}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {step.expected_result}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}
