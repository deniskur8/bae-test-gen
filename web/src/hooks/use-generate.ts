import { useState, useRef, useCallback } from "react";
import type { TestGenerationResult } from "@/types/test-case";
import { generateTestCasesStream } from "@/lib/ollama";

export function useGenerate() {
  const [result, setResult] = useState<TestGenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState<number | null>(null);
  const [streamText, setStreamText] = useState("");
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = useCallback(
    async (systemPrompt: string, ecrText: string) => {
      setIsLoading(true);
      setError(null);
      setResult(null);
      setElapsed(0);
      setFinalElapsed(null);
      setStreamText("");
      setRawOutput(null);
      setTruncated(false);

      abortRef.current = new AbortController();

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      let finalStreamText = "";
      try {
        const parseResult = await generateTestCasesStream(
          systemPrompt,
          ecrText,
          (accumulated) => {
            finalStreamText = accumulated;
            setStreamText(accumulated);
          },
          abortRef.current.signal
        );
        setResult(parseResult.data);
        setTruncated(parseResult.truncated);
        setRawOutput(finalStreamText || null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setError("Generation cancelled");
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
          if (finalStreamText) {
            setRawOutput(finalStreamText);
          }
        }
      } finally {
        setIsLoading(false);
        if (timerRef.current) clearInterval(timerRef.current);
        const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(totalSeconds);
        setFinalElapsed(totalSeconds);
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setElapsed(0);
    setFinalElapsed(null);
    setStreamText("");
    setRawOutput(null);
    setTruncated(false);
  }, []);

  return { result, isLoading, error, elapsed, finalElapsed, streamText, rawOutput, truncated, generate, cancel, reset };
}
