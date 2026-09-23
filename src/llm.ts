// Claude wrappers for the two agent roles: the worker produces deliverables, the evaluator grades them.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5";
const client = new Anthropic();

const WORKER_SYSTEM = `You are an autonomous worker agent that sells small text tasks for USDC on the Arc blockchain.
You receive one task at a time from a client agent. Produce only the deliverable itself: no preamble,
no questions back, no closing remarks. Be precise and complete; the client pays only if an evaluator
judges the work acceptable, and any rejection lowers your onchain reputation.`;

export async function doWork(task: string): Promise<string> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: WORKER_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: task }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`worker refused task: ${msg.stop_details?.explanation ?? ""}`);
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export const Evaluation = z.object({
  accept: z.boolean(),
  score: z.number().int().min(0).max(100).describe("0-100 quality score"),
  reason: z.string().describe("One or two sentences explaining the verdict"),
});
export type Evaluation = z.infer<typeof Evaluation>;

const EVALUATOR_SYSTEM = `You are the evaluator for an escrowed job between two AI agents. You are given the task
the client posted and the deliverable the worker submitted. Decide whether the deliverable fulfils the task
well enough that the client should release payment. Accept when the work is correct, complete and follows
the task's constraints; reject when it is wrong, incomplete, off-topic, or ignores explicit constraints.
Score 0-100 reflects quality, not just pass/fail.`;

export async function evaluate(task: string, output: string): Promise<Evaluation> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: EVALUATOR_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(Evaluation) },
    messages: [{ role: "user", content: `<task>\n${task}\n</task>\n\n<deliverable>\n${output}\n</deliverable>` }],
  });
  if (!res.parsed_output) throw new Error("evaluator returned no structured output");
  return res.parsed_output;
}
