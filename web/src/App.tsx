// sync test
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
  GripVertical,
  Trash2,
  Check,
  X,
  Clock,
  Terminal,
  Plus,
  Save,
  Settings,
  Send,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import { useGenerate } from "@/hooks/use-generate";
import { loadPromptList, loadEcrList } from "@/lib/ecr-loader";
import type { PromptFile, EcrFile } from "@/lib/ecr-loader";
import type { TestCase, TestStep, TestGenerationResult } from "@/types/test-case";
import {
  loadJiraConfig,
  saveJiraConfig,
  isJiraConfigured,
  testJiraConnection,
  sendAllTestCases,
  searchEcrs,
  fetchEcrDetail,
  formatEcrAsText,
  type JiraConfig,
  type SendResult,
  type EcrSearchResult,
} from "@/lib/jira";

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
  const [ecrMode, setEcrMode] = useState<"file" | "jira">("file");

  // Jira ECR search state
  const [ecrSearchQuery, setEcrSearchQuery] = useState("");
  const [ecrSearchResults, setEcrSearchResults] = useState<EcrSearchResult[]>([]);
  const [ecrSearching, setEcrSearching] = useState(false);
  const [ecrFetching, setEcrFetching] = useState(false);
  const [showEcrDropdown, setShowEcrDropdown] = useState(false);
  const ecrSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ecrSearchContainerRef = useRef<HTMLDivElement>(null);

  // Model info
  const [modelInfo, setModelInfo] = useState<{ family: string; parameter_size: string } | null>(null);

  // Results state
  const [activeTab, setActiveTab] = useState<"cases" | "json">("cases");

  // Editable result — local copy that the user can mutate
  const [editableResult, setEditableResult] = useState<TestGenerationResult | null>(null);

  // Jira state
  const [jiraConfig, setJiraConfig] = useState<JiraConfig>(loadJiraConfig);
  const [showJiraSettings, setShowJiraSettings] = useState(false);
  const [showSendToJira, setShowSendToJira] = useState(false);

  const { result, isLoading, error, elapsed, finalElapsed, streamText, rawOutput, truncated, generate, cancel, reset } =
    useGenerate();

  // Sync generation result into editable copy
  useEffect(() => {
    if (result) {
      setEditableResult(JSON.parse(JSON.stringify(result)));
    }
  }, [result]);

  // Load prompts + ECRs on mount
  useEffect(() => {
    loadPromptList()
      .then((list) => {
        setPrompts(list);
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
    setEditableResult(null);
    setActiveTab("cases");
    generate(systemPrompt, ecrText);
  }, [systemPrompt, ecrText, generate, reset]);

  const handleCopyJson = useCallback(async () => {
    const data = editableResult ?? result;
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success("JSON copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [editableResult, result]);

  const handleExportJson = useCallback(() => {
    const data = editableResult ?? result;
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.mte_summary.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON file downloaded");
  }, [editableResult, result]);

  // --- ECR search handlers ---
  const handleEcrSearch = useCallback(
    (query: string) => {
      setEcrSearchQuery(query);
      setShowEcrDropdown(true);

      // Clear previous timer
      if (ecrSearchTimerRef.current) clearTimeout(ecrSearchTimerRef.current);

      if (!query.trim() || !isJiraConfigured(jiraConfig)) {
        setEcrSearchResults([]);
        return;
      }

      // Debounce 400ms
      ecrSearchTimerRef.current = setTimeout(async () => {
        setEcrSearching(true);
        try {
          const results = await searchEcrs(query, jiraConfig);
          setEcrSearchResults(results);
        } catch {
          setEcrSearchResults([]);
        }
        setEcrSearching(false);
      }, 400);
    },
    [jiraConfig]
  );

  const handleEcrSelect_Jira = useCallback(
    async (result: EcrSearchResult) => {
      setEcrSearchQuery(result.key);
      setShowEcrDropdown(false);
      setEcrFetching(true);

      try {
        const detail = await fetchEcrDetail(result.key, jiraConfig);
        const formatted = formatEcrAsText(detail);
        setEcrText(formatted);
        setSelectedEcr("");
        toast.success(`Loaded ${result.key}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch ECR");
      }

      setEcrFetching(false);
    },
    [jiraConfig]
  );

  // Close ECR dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ecrSearchContainerRef.current && !ecrSearchContainerRef.current.contains(e.target as Node)) {
        setShowEcrDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // --- Step mutation handlers ---
  const handleUpdateStep = useCallback(
    (caseIdx: number, stepIdx: number, updated: TestStep) => {
      setEditableResult((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as TestGenerationResult;
        next.test_cases[caseIdx].steps[stepIdx] = updated;
        return next;
      });
    },
    []
  );

  const handleDeleteStep = useCallback(
    (caseIdx: number, stepIdx: number) => {
      setEditableResult((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as TestGenerationResult;
        next.test_cases[caseIdx].steps.splice(stepIdx, 1);
        // Re-number remaining steps
        next.test_cases[caseIdx].steps.forEach((s, i) => {
          s.step = i + 1;
        });
        return next;
      });
      toast.success("Step deleted");
    },
    []
  );

  const handleReorderSteps = useCallback(
    (caseIdx: number, oldIndex: number, newIndex: number) => {
      setEditableResult((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as TestGenerationResult;
        next.test_cases[caseIdx].steps = arrayMove(
          next.test_cases[caseIdx].steps,
          oldIndex,
          newIndex
        );
        // Re-number
        next.test_cases[caseIdx].steps.forEach((s, i) => {
          s.step = i + 1;
        });
        return next;
      });
    },
    []
  );

  const handleAddStep = useCallback(
    (caseIdx: number) => {
      setEditableResult((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as TestGenerationResult;
        const steps = next.test_cases[caseIdx].steps;
        steps.push({
          step: steps.length + 1,
          action: "",
          data: "None",
          expected_result: "",
        });
        return next;
      });
    },
    []
  );

  const displayResult = editableResult ?? result;
  const funcCount = displayResult?.test_cases?.filter((t) => t.test_type === "Functional").length ?? 0;
  const regCount = displayResult?.test_cases?.filter((t) => t.test_type === "Regression").length ?? 0;

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
            {displayResult && (
              <>
                <Button variant="outline" size="sm" onClick={handleCopyJson}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!isJiraConfigured(jiraConfig)) {
                      setShowJiraSettings(true);
                      toast.error("Configure Jira settings first");
                    } else {
                      setShowSendToJira(true);
                    }
                  }}
                >
                  <Send className="mr-2 h-3.5 w-3.5" />
                  Send to Jira
                </Button>
              </>
            )}
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowJiraSettings(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                      Change Request (ECR)
                    </CardTitle>
                  </div>
                  <div className="flex rounded-md border bg-muted p-0.5">
                    <button
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        ecrMode === "file"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setEcrMode("file")}
                    >
                      Local
                    </button>
                    <button
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        ecrMode === "jira"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => {
                        if (!isJiraConfigured(jiraConfig)) {
                          setShowJiraSettings(true);
                          toast.error("Configure Jira settings first");
                          return;
                        }
                        setEcrMode("jira");
                      }}
                    >
                      From Jira
                    </button>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  {ecrMode === "file"
                    ? "Select a saved ECR or paste one manually"
                    : "Search Jira for an ECR by key or keywords"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ecrMode === "file" ? (
                  <>
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
                  </>
                ) : (
                  <div ref={ecrSearchContainerRef} className="relative">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Type ECR key (e.g. ECR-7167) or keywords..."
                        value={ecrSearchQuery}
                        onChange={(e) => handleEcrSearch(e.target.value)}
                        onFocus={() => ecrSearchResults.length > 0 && setShowEcrDropdown(true)}
                        className="pl-8 font-mono text-xs"
                      />
                      {(ecrSearching || ecrFetching) && (
                        <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    {/* Search results dropdown */}
                    {showEcrDropdown && ecrSearchResults.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                        <ScrollArea className="max-h-[200px]">
                          {ecrSearchResults.map((r) => (
                            <button
                              key={r.key}
                              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                              onClick={() => handleEcrSelect_Jira(r)}
                            >
                              <span className="font-mono text-xs font-medium text-primary shrink-0 mt-0.5">
                                {r.key}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                {r.summary}
                              </span>
                            </button>
                          ))}
                        </ScrollArea>
                      </div>
                    )}

                    {/* No results message */}
                    {showEcrDropdown && ecrSearchQuery.trim() && !ecrSearching && ecrSearchResults.length === 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2">
                        <p className="text-xs text-muted-foreground">No ECRs found</p>
                      </div>
                    )}
                  </div>
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
            {!displayResult && !isLoading && !error && <EmptyState />}

            {/* Truncation Warning */}
            {truncated && displayResult && (
              <Card className="border-amber-500/50 bg-amber-500/5 mb-4">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-500">
                      Output was truncated
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The model ran out of tokens and only generated {displayResult.test_cases?.length ?? 0} test case(s).
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
            {displayResult && !isLoading && (
              <ResultsView
                result={displayResult}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onCopyJson={handleCopyJson}
                funcCount={funcCount}
                regCount={regCount}
                finalElapsed={finalElapsed}
                rawOutput={rawOutput}
                onUpdateStep={handleUpdateStep}
                onDeleteStep={handleDeleteStep}
                onReorderSteps={handleReorderSteps}
                onAddStep={handleAddStep}
              />
            )}
          </div>
        </div>
      </main>

      {/* Jira Settings Dialog */}
      <JiraSettingsDialog
        open={showJiraSettings}
        onOpenChange={setShowJiraSettings}
        config={jiraConfig}
        onSave={(config) => {
          setJiraConfig(config);
          saveJiraConfig(config);
          toast.success("Jira settings saved");
        }}
      />

      {/* Send to Jira Dialog */}
      {displayResult && (
        <SendToJiraDialog
          open={showSendToJira}
          onOpenChange={setShowSendToJira}
          result={displayResult}
          config={jiraConfig}
        />
      )}
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
// Format elapsed seconds into human-readable string
// ---------------------------------------------------------------------------
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
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
  finalElapsed,
  rawOutput,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
  onAddStep,
}: {
  result: TestGenerationResult;
  activeTab: "cases" | "json";
  onTabChange: (tab: "cases" | "json") => void;
  onCopyJson: () => void;
  funcCount: number;
  regCount: number;
  finalElapsed: number | null;
  rawOutput: string | null;
  onUpdateStep: (caseIdx: number, stepIdx: number, updated: TestStep) => void;
  onDeleteStep: (caseIdx: number, stepIdx: number) => void;
  onReorderSteps: (caseIdx: number, oldIndex: number, newIndex: number) => void;
  onAddStep: (caseIdx: number) => void;
}) {
  const [showRawOutput, setShowRawOutput] = useState(false);

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
          <div className="flex items-center gap-4 pt-1 flex-wrap">
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
            {finalElapsed !== null && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono font-medium text-muted-foreground">
                    {formatElapsed(finalElapsed)}
                  </span>
                </div>
              </>
            )}
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

        {/* Show full output toggle */}
        {rawOutput && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => setShowRawOutput(!showRawOutput)}
          >
            <Terminal className="mr-1.5 h-3 w-3" />
            {showRawOutput ? "Hide" : "Show"} Model Output
          </Button>
        )}
      </div>

      {/* Full Model Output (collapsible) */}
      {showRawOutput && rawOutput && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Full Model Output
              </CardTitle>
              <span className="text-xs text-muted-foreground/60">
                {rawOutput.length.toLocaleString()} chars
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                {rawOutput}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Tab Content */}
      {activeTab === "cases" ? (
        <div className="space-y-4">
          {(result.test_cases ?? []).map((tc, idx) => (
            <TestCaseCard
              key={idx}
              testCase={tc}
              index={idx}
              onUpdateStep={(stepIdx, updated) => onUpdateStep(idx, stepIdx, updated)}
              onDeleteStep={(stepIdx) => onDeleteStep(idx, stepIdx)}
              onReorderSteps={(oldIndex, newIndex) => onReorderSteps(idx, oldIndex, newIndex)}
              onAddStep={() => onAddStep(idx)}
            />
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
// Sortable Step Row
// ---------------------------------------------------------------------------
function SortableStepRow({
  step,
  stepIdx,
  onEdit,
  onDelete,
}: {
  step: TestStep;
  stepIdx: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `step-${step.step}-${stepIdx}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-[40px] p-0">
        <button
          className="flex items-center justify-center w-full h-full py-2 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground font-medium w-[40px]">
        {step.step}
      </TableCell>
      <TableCell className="text-sm">{step.action}</TableCell>
      <TableCell className="text-xs text-muted-foreground/60 w-[80px]">
        {step.data === "None" ? "--" : step.data}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {step.expected_result}
      </TableCell>
      <TableCell className="w-[80px]">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Step Edit Dialog
// ---------------------------------------------------------------------------
function StepEditDialog({
  step,
  open,
  onOpenChange,
  onSave,
}: {
  step: TestStep | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: TestStep) => void;
}) {
  const [action, setAction] = useState("");
  const [data, setData] = useState("");
  const [expectedResult, setExpectedResult] = useState("");

  useEffect(() => {
    if (step) {
      setAction(step.action);
      setData(step.data);
      setExpectedResult(step.expected_result);
    }
  }, [step]);

  const handleSave = () => {
    if (!step) return;
    onSave({
      ...step,
      action,
      data,
      expected_result: expectedResult,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Step {step?.step}</DialogTitle>
          <DialogDescription>
            Modify the step details below
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Action
            </label>
            <Textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Data
            </label>
            <Textarea
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="min-h-[60px] text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Expected Result
            </label>
            <Textarea
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-3.5 w-3.5" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Test Case Card
// ---------------------------------------------------------------------------
function TestCaseCard({
  testCase,
  index,
  onUpdateStep,
  onDeleteStep,
  onReorderSteps,
  onAddStep,
}: {
  testCase: TestCase;
  index: number;
  onUpdateStep: (stepIdx: number, updated: TestStep) => void;
  onDeleteStep: (stepIdx: number) => void;
  onReorderSteps: (oldIndex: number, newIndex: number) => void;
  onAddStep: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingStep, setEditingStep] = useState<{ step: TestStep; idx: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const steps = testCase.steps ?? [];
  const sortableIds = steps.map((s, i) => `step-${s.step}-${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderSteps(oldIndex, newIndex);
    }
  };

  const handleDeleteClick = (stepIdx: number) => {
    if (deleteConfirm === stepIdx) {
      onDeleteStep(stepIdx);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(stepIdx);
      // Auto-clear confirm after 3s
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  return (
    <>
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

            {/* Steps Table with DnD */}
            {steps.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortableIds}
                  strategy={verticalListSortingStrategy}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px] text-xs"></TableHead>
                        <TableHead className="w-[40px] text-xs">#</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="w-[80px] text-xs">Data</TableHead>
                        <TableHead className="text-xs">Expected Result</TableHead>
                        <TableHead className="w-[80px] text-xs"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {steps.map((step, stepIdx) => (
                        <SortableStepRow
                          key={sortableIds[stepIdx]}
                          step={step}
                          stepIdx={stepIdx}
                          onEdit={() => setEditingStep({ step, idx: stepIdx })}
                          onDelete={() => handleDeleteClick(stepIdx)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            )}

            {/* Add Step button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={(e) => {
                e.stopPropagation();
                onAddStep();
              }}
            >
              <Plus className="mr-2 h-3 w-3" />
              Add Step
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Edit Dialog */}
      <StepEditDialog
        step={editingStep?.step ?? null}
        open={editingStep !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStep(null);
        }}
        onSave={(updated) => {
          if (editingStep) {
            onUpdateStep(editingStep.idx, updated);
            toast.success(`Step ${updated.step} updated`);
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Jira Settings Dialog
// ---------------------------------------------------------------------------
function JiraSettingsDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: JiraConfig;
  onSave: (config: JiraConfig) => void;
}) {
  const [draft, setDraft] = useState<JiraConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setTestResult(null);
    }
  }, [open, config]);

  const update = (key: keyof JiraConfig, value: string | string[]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testJiraConnection(draft);
    setTestResult(result);
    setTesting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Jira Configuration
          </DialogTitle>
          <DialogDescription>
            Configure connection to BAE Jira instance
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Jira Base URL
            </label>
            <Input
              value={draft.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="https://air-jira.intranet.baesystems.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Personal Access Token (PAT)
            </label>
            <Input
              type="password"
              value={draft.pat}
              onChange={(e) => update("pat", e.target.value)}
              placeholder="Enter your Jira PAT"
            />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Project ID
              </label>
              <Input
                value={draft.projectId}
                onChange={(e) => update("projectId", e.target.value)}
                placeholder="13102"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Test Issue Type ID
              </label>
              <Input
                value={draft.testIssueTypeId}
                onChange={(e) => update("testIssueTypeId", e.target.value)}
                placeholder="10100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fix Version ID
              </label>
              <Input
                value={draft.fixVersionId}
                onChange={(e) => update("fixVersionId", e.target.value)}
                placeholder="106502"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Component IDs
              </label>
              <Input
                value={draft.componentIds.join(", ")}
                onChange={(e) =>
                  update(
                    "componentIds",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="115101"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              SSL Certificate Path (PEM)
            </label>
            <Input
              value={draft.pemPath}
              onChange={(e) => update("pemPath", e.target.value)}
              placeholder="BAE-Systems-Root-CA-UK-2015.pem"
            />
          </div>

          {/* Test connection result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              {testResult.ok ? "Connection successful" : testResult.error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !draft.baseUrl || !draft.pat}
          >
            {testing ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="mr-2 h-3.5 w-3.5" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Send to Jira Dialog
// ---------------------------------------------------------------------------
function SendToJiraDialog({
  open,
  onOpenChange,
  result,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: TestGenerationResult;
  config: JiraConfig;
}) {
  const testCases = result.test_cases ?? [];
  const [selected, setSelected] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<"select" | "sending" | "done">("select");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<SendResult[]>([]);

  useEffect(() => {
    if (open) {
      setSelected(testCases.map(() => true));
      setPhase("select");
      setProgress({ completed: 0, total: 0 });
      setResults([]);
    }
  }, [open, testCases.length]);

  const selectedIndices = selected
    .map((s, i) => (s ? i : -1))
    .filter((i) => i !== -1);
  const selectedCount = selectedIndices.length;

  const handleSend = async () => {
    setPhase("sending");
    setProgress({ completed: 0, total: selectedCount });

    const sendResults = await sendAllTestCases(
      result,
      selectedIndices,
      config,
      (completed, total, latest) => {
        setProgress({ completed, total });
        setResults((prev) => [...prev, latest]);
      }
    );

    setResults(sendResults);
    setPhase("done");

    const successCount = sendResults.filter((r) => r.key).length;
    const failCount = sendResults.filter((r) => r.error).length;
    if (failCount === 0) {
      toast.success(`Created ${successCount} test case(s) in Jira`);
    } else {
      toast.error(`${failCount} test case(s) failed to create`);
    }
  };

  const handleCopyKeys = async () => {
    const keys = results.filter((r) => r.key).map((r) => r.key).join("\n");
    try {
      await navigator.clipboard.writeText(keys);
      toast.success("Jira keys copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={phase === "sending" ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {phase === "select" && "Send Test Cases to Jira"}
            {phase === "sending" && "Creating Issues..."}
            {phase === "done" && "Complete"}
          </DialogTitle>
          {phase === "select" && (
            <DialogDescription>
              Select test cases to create as Jira issues in project {config.projectId}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Selection phase */}
        {phase === "select" && (
          <div className="space-y-4 py-2">
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {testCases.map((tc, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      checked={selected[idx] ?? false}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = [...prev];
                          next[idx] = checked;
                          return next;
                        })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        <span className="text-muted-foreground/60 font-mono text-xs mr-2">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        {tc.summary}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {tc.steps?.length ?? 0} steps
                      </p>
                    </div>
                    <Badge
                      variant={tc.test_type === "Functional" ? "default" : "outline"}
                      className={`text-xs shrink-0 ${
                        tc.test_type === "Regression"
                          ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                          : ""
                      }`}
                    >
                      {tc.test_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedCount} of {testCases.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelected(testCases.map(() => true))}
                >
                  Select all
                </button>
                <span className="text-muted-foreground/40">|</span>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelected(testCases.map(() => false))}
                >
                  Deselect all
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sending phase */}
        {phase === "sending" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm">
                Creating issue {progress.completed} of {progress.total}...
              </p>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.key ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="truncate">{r.summary}</span>
                    {r.key && (
                      <span className="ml-auto font-mono text-xs text-primary shrink-0">
                        {r.key}
                      </span>
                    )}
                    {r.error && (
                      <span className="ml-auto text-xs text-destructive truncate max-w-[200px]">
                        {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Done phase */}
        {phase === "done" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              {results.every((r) => r.key) ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <p className="text-sm font-medium">
                {results.filter((r) => r.key).length} of {results.length} issue(s) created
                {results.some((r) => r.error) &&
                  `, ${results.filter((r) => r.error).length} failed`}
              </p>
            </div>

            <ScrollArea className="max-h-[350px]">
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-md border p-3 ${
                      r.error ? "border-destructive/30 bg-destructive/5" : ""
                    }`}
                  >
                    {r.key ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{r.summary}</p>
                      {r.error && (
                        <p className="text-xs text-destructive mt-0.5">{r.error}</p>
                      )}
                    </div>
                    {r.key && (
                      <a
                        href={`${config.baseUrl}/browse/${r.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-xs text-primary hover:underline shrink-0"
                      >
                        {r.key}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {phase === "select" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={selectedCount === 0}>
                <Send className="mr-2 h-3.5 w-3.5" />
                Send {selectedCount} Test Case{selectedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {phase === "done" && (
            <>
              {results.some((r) => r.key) && (
                <Button variant="outline" onClick={handleCopyKeys}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy Keys
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
