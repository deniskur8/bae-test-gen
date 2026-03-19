export interface PromptFile {
  name: string;
  content: string;
}

export interface EcrFile {
  name: string;
  content: string;
}

export async function loadPromptList(): Promise<PromptFile[]> {
  const res = await fetch("/api/prompts");
  return res.json();
}

export async function loadEcrList(): Promise<EcrFile[]> {
  const res = await fetch("/api/ecrs");
  return res.json();
}
