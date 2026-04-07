## How to use the v5.1 prompt with Ollama structured output

The key change: let Ollama enforce the JSON schema mechanically so the model
doesn't waste reasoning capacity on getting the structure right.

### Using curl:

```bash
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:latest",
    "prompt": "<paste prompt-v5.1.txt content here, with ECR appended after the last line>",
    "stream": false,
    "options": {
      "temperature": 0,
      "num_predict": 8192
    },
    "format": {
      "type": "object",
      "properties": {
        "mte_summary": { "type": "string" },
        "mte_labels": {
          "type": "array",
          "items": { "type": "string" }
        },
        "test_cases": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "summary": { "type": "string" },
              "test_type": { "type": "string" },
              "description": {
                "type": "object",
                "properties": {
                  "scenario": { "type": "string" },
                  "expected_result": { "type": "string" }
                },
                "required": ["scenario", "expected_result"]
              },
              "preconditions": {},
              "steps": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "step": { "type": "integer" },
                    "action": { "type": "string" },
                    "data": { "type": "string" },
                    "expected_result": { "type": "string" }
                  },
                  "required": ["step", "action", "data", "expected_result"]
                }
              }
            },
            "required": ["summary", "test_type", "description", "preconditions", "steps"]
          }
        }
      },
      "required": ["mte_summary", "mte_labels", "test_cases"]
    }
  }'
```

### Using Python (recommended):

```python
import ollama
import json

# Read prompt
with open("prompt-v5.1.txt", "r") as f:
    prompt = f.read()

# Append ECR
ecr = """
Title: BPMS015 skipping some validation for sub-con requisitions
Labels: Bizagi, Procurement
Components: BPMS015

Description:
Requirement/Issue: BPMS015 is currently skipping some validation checks for
subcontracted purchase requisitions. Specifically, requisitions with missing
peg/GI information or blank/EMPloyee business partners are not being caught
during the approval workflow.

Exact Change Required: Add validation in BPMS015 to check subcontracted
requisitions for: (1) Missing peg/GI information - auto-reject with email
notification, (2) Blank BP or EMPloyee supplier - reject after buyer review
with email notification, (3) SubConDefault items not linked to production
orders - reject with email notification, (4) Multi-line requisitions with
subcontracted items - reject with email notification.

Benefit: Prevents invalid subcontracted requisitions from progressing through
the approval workflow.
"""

full_prompt = prompt + ecr

# Define schema
schema = {
    "type": "object",
    "properties": {
        "mte_summary": {"type": "string"},
        "mte_labels": {
            "type": "array",
            "items": {"type": "string"}
        },
        "test_cases": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "test_type": {"type": "string"},
                    "description": {
                        "type": "object",
                        "properties": {
                            "scenario": {"type": "string"},
                            "expected_result": {"type": "string"}
                        },
                        "required": ["scenario", "expected_result"]
                    },
                    "preconditions": {},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "step": {"type": "integer"},
                                "action": {"type": "string"},
                                "data": {"type": "string"},
                                "expected_result": {"type": "string"}
                            },
                            "required": ["step", "action", "data", "expected_result"]
                        }
                    }
                },
                "required": ["summary", "test_type", "description", "preconditions", "steps"]
            }
        }
    },
    "required": ["mte_summary", "mte_labels", "test_cases"]
}

# Call with structured output
response = ollama.generate(
    model="qwen2.5:latest",
    prompt=full_prompt,
    format=schema,
    options={
        "temperature": 0,
        "num_predict": 8192
    }
)

result = json.loads(response["response"])
print(json.dumps(result, indent=2))
```

### Key settings:
- temperature: 0 (Ollama docs recommend this for structured output)
- thinking: OFF (already confirmed better results)
- num_predict: 8192 (enough for 6 detailed test cases)
- format: pass the JSON schema directly, Ollama enforces it at decode time
