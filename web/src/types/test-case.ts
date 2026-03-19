export interface TestStep {
  step: number;
  action: string;
  data: string;
  expected_result: string;
}

export interface TestCase {
  summary: string;
  test_type: "Functional" | "Regression";
  description: {
    scenario: string;
    expected_result: string;
  };
  preconditions: string | null;
  steps: TestStep[];
}

export interface TestGenerationResult {
  mte_summary: string;
  mte_labels: string[];
  test_cases: TestCase[];
}
