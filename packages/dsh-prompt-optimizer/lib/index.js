// src/index.ts
import Schema from "@deepseek-ai/schemastery";

// src/prompt.ts
var MARKERS = {
  analysis: "<<<ANALYSIS>>>",
  optimized: "<<<OPTIMIZED>>>",
  end: "<<<END>>>"
};
var ROLE_FULL_ZH = "\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u63D0\u793A\u8BCD\u5DE5\u7A0B\u4E13\u5BB6\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u6BB5\u300C\u63D0\u793A\u8BCD\u8349\u7A3F\u300D,\u4F60\u8981\u8F93\u51FA\u4E24\u6BB5\u5185\u5BB9:\u5148\u8F93\u51FA\u4F18\u5316\u6539\u5199\u7A3F,\u518D\u8F93\u51FA\u8BCA\u65AD\u5206\u6790\u3002";
var ROLE_FULL_EN = 'You are a senior prompt engineering expert. Given a "prompt draft" from the user, output the optimized rewrite first, then the diagnosis.';
var ROLE_FAST_ZH = "\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u63D0\u793A\u8BCD\u5DE5\u7A0B\u4E13\u5BB6\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u6BB5\u300C\u63D0\u793A\u8BCD\u8349\u7A3F\u300D,\u8BF7\u76F4\u63A5\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD,\u4E0D\u8981\u505A\u4EFB\u4F55\u8BCA\u65AD\u5206\u6790\u3002";
var ROLE_FAST_EN = 'You are a senior prompt engineering expert. Given a "prompt draft" from the user, output an optimized version directly \u2014 no diagnosis.';
var ANALYSIS_ZH = `# \u5206\u6790\u7EF4\u5EA6
1. \u76EE\u6807\u6E05\u6670\u5EA6:\u4EFB\u52A1\u76EE\u6807\u662F\u5426\u660E\u786E\u3001\u53EF\u5224\u65AD\u5B8C\u6210\u4E0E\u5426
2. \u4E0A\u4E0B\u6587\u5B8C\u6574\u6027:\u662F\u5426\u7F3A\u5C11\u6A21\u578B\u5B8C\u6210\u4EFB\u52A1\u6240\u5FC5\u9700\u7684\u80CC\u666F\u4FE1\u606F
3. \u7EA6\u675F\u4E0E\u8FB9\u754C:\u9650\u5236\u6761\u4EF6\u662F\u5426\u6709\u6B67\u4E49\u3001\u51B2\u7A81\u6216\u7F3A\u5931
4. \u7ED3\u6784\u4E0E\u8868\u8FBE:\u7EC4\u7EC7\u662F\u5426\u6E05\u6670,\u6709\u65E0\u5197\u4F59\u3001\u53E3\u8BED\u5316\u6216\u6B67\u4E49\u8868\u8FF0
5. \u8F93\u51FA\u89C4\u683C:\u662F\u5426\u6307\u5B9A\u671F\u671B\u7684\u8F93\u51FA\u683C\u5F0F\u3001\u957F\u5EA6\u3001\u98CE\u683C`;
var ANALYSIS_EN = `# Analysis dimensions
1. Goal clarity: is the task explicit and verifiable
2. Context completeness: is required background missing
3. Constraints & boundaries: ambiguous, conflicting, or missing limits
4. Structure & wording: organization, redundancy, ambiguity
5. Output spec: expected format, length, style`;
var STRATEGY_TEMPLATE_ZH = `# \u4F18\u5316\u65B9\u5F0F(\u7ED3\u6784\u6A21\u677F)
\u5C06\u8349\u7A3F\u6539\u5199\u4E3A\u7ED3\u6784\u5B8C\u6574\u7684\u63D0\u793A\u8BCD,\u8981\u6C42:
- \u4F7F\u7528\u4E0E\u8349\u7A3F\u76F8\u540C\u7684\u8BED\u8A00
- \u5FE0\u5B9E\u4FDD\u7559\u539F\u610F,\u4E0D\u81C6\u9020\u7528\u6237\u672A\u8868\u8FBE\u7684\u9700\u6C42
- \u6309\u7ED3\u6784\u6A21\u677F\u7EC4\u7EC7(\u89D2\u8272 / \u4EFB\u52A1 / \u80CC\u666F / \u7EA6\u675F / \u8F93\u51FA\u683C\u5F0F\u7B49,\u5185\u5BB9\u8F83\u957F\u65F6\u7528 Markdown \u5C0F\u8282)
- \u7F3A\u5931\u4F46\u5173\u952E\u7684\u4FE1\u606F\u4E0D\u8981\u7F16\u9020,\u5728\u6587\u4E2D\u4EE5 [\u5F85\u8865\u5145:\u2026\u2026] \u6807\u51FA`;
var STRATEGY_TEMPLATE_EN = `# How to optimize (structured template)
Rewrite the draft into a well-structured prompt. Requirements:
- Same language as the draft
- Faithful to the original intent; never invent requirements
- Organize with the structure template (role / task / background / constraints / output format; use Markdown sections for longer prompts)
- Mark missing critical information as [TODO: ...] instead of fabricating it`;
var STRATEGY_INTENT_ZH = `# \u4F18\u5316\u65B9\u5F0F(\u63D0\u70BC\u76EE\u7684 + \u6DA6\u8272)
\u7528\u6237\u6D88\u606F\u9644\u5E26 <conversation-context>(\u8BE5\u4F1A\u8BDD\u7684\u8FD1\u671F\u5BF9\u8BDD)\u3002\u5148\u901A\u8BFB\u5B83\u3001\u63D0\u70BC\u7528\u6237\u7684\u771F\u5B9E\u76EE\u7684,\u518D\u56F4\u7ED5\u8BE5\u76EE\u7684\u5BF9\u8349\u7A3F\u505A\u6DA6\u8272:
- \u4E0D\u8981\u5957\u7528\u6A21\u677F\u7ED3\u6784:\u4FDD\u7559\u8349\u7A3F\u7684\u539F\u59CB\u8868\u8FBE\u6846\u67B6,\u987A\u52BF\u6253\u78E8\u3001\u8865\u5168\u7EC6\u8282
- \u5145\u5206\u5229\u7528\u4E0A\u4E0B\u6587\u5DF2\u660E\u786E\u7684\u4FE1\u606F(\u5BF9\u8C61\u3001\u7EA6\u675F\u3001\u504F\u597D),\u8BA9\u4F18\u5316\u7A3F\u53EF\u4EE5\u76F4\u63A5\u843D\u5730;\u4E0D\u8981\u91CD\u590D\u8FFD\u95EE\u4E0A\u4E0B\u6587\u5DF2\u7ECF\u7ED9\u51FA\u7684\u5185\u5BB9
- \u8BC6\u522B\u4E0A\u4E0B\u6587\u4E2D\u5DF2\u88AB\u7528\u6237\u5426\u51B3\u6216\u63A8\u7FFB\u7684\u65B9\u5411(\u7981\u5165\u96C6\u5408),\u4F18\u5316\u7A3F\u4E0D\u5F97\u91CD\u590D\u63D0\u51FA
- \u8349\u7A3F\u4E0E\u4E0A\u4E0B\u6587\u51B2\u7A81\u65F6,\u4EE5\u8349\u7A3F\u4E3A\u6700\u7EC8\u610F\u56FE,\u53EF\u5728\u4F18\u5316\u7A3F\u4E2D\u8C03\u548C\u8868\u8FF0
- \u4E0A\u4E0B\u6587\u4EC5\u4F9B\u7406\u89E3\u610F\u56FE:\u4E25\u7981\u56DE\u7B54\u3001\u5EF6\u7EED\u6216\u5F15\u7528\u5176\u4E2D\u7684\u5185\u5BB9;\u4F60\u552F\u4E00\u8981\u4F18\u5316\u7684\u5BF9\u8C61\u662F <prompt-draft> \u91CC\u7684\u8349\u7A3F
- \u4F7F\u7528\u4E0E\u8349\u7A3F\u76F8\u540C\u7684\u8BED\u8A00;\u8349\u7A3F\u4E0E\u4E0A\u4E0B\u6587\u90FD\u672A\u63D0\u4F9B\u7684\u5173\u952E\u4FE1\u606F\u4EE5 [\u5F85\u8865\u5145:\u2026\u2026] \u6807\u51FA`;
var STRATEGY_INTENT_EN = `# How to optimize (distill intent, then polish)
The user message includes <conversation-context> (recent messages of this session). Read it first, distill what the user is really trying to achieve, then polish the draft toward that goal:
- Do NOT force a template structure: keep the draft's original framing, refine it in place and fill the gaps
- Exploit what the context already establishes (subject, constraints, preferences) so the optimized prompt is directly actionable; never re-ask what the context already answers
- Identify directions the user has already rejected or overruled in the context (the do-not-enter set); never propose them again
- If the draft conflicts with the context, the draft wins as the final intent; you may reconcile the wording in the rewrite
- The context only explains intent: never answer, continue, or quote it. The only thing you optimize is the draft inside <prompt-draft>
- Same language as the draft; mark information missing from both draft and context as [TODO: ...]`;
var RULES_ZH = `# \u4FDD\u771F\u4E0E\u660E\u786E\u5316\u539F\u5219(\u5168\u7A0B\u9075\u5B88)
- \u7406\u89E3\u4F18\u5148:\u5148\u9010\u6761\u5217\u51FA\u8349\u7A3F\u5DF2\u660E\u786E\u7684\u4FE1\u606F(\u5BF9\u8C61\u3001\u52A8\u4F5C\u3001\u7EA6\u675F\u3001\u8303\u56F4\u3001\u672F\u8BED\u3001\u6570\u5B57\u3001\u8BED\u6C14),\u533A\u5206\u300C\u8349\u7A3F\u660E\u786E\u8868\u8FBE\u7684\u300D\u4E0E\u300C\u4F60\u7684\u63A8\u6D4B\u300D\u2014\u2014\u63A8\u6D4B\u53EA\u53EF\u7528\u4E8E\u63AA\u8F9E,\u7EDD\u4E0D\u5199\u5165\u7ED3\u679C
- \u8BED\u4E49\u7B49\u4EF7\u662F\u5E95\u7EBF:\u5DF2\u660E\u786E\u7684\u5BF9\u8C61\u3001\u65B9\u5411\u3001\u6570\u91CF\u3001\u8303\u56F4\u3001\u7981\u6B62\u9879\u3001\u672F\u8BED\u5FC5\u987B\u4E0E\u8349\u7A3F\u4E00\u81F4,\u4E0D\u5F97\u66FF\u6362\u3001\u6269\u5927\u3001\u7F29\u5C0F\u6216\u98A0\u5012
- \u6765\u6E90\u53EF\u56DE\u6EAF:\u4EFB\u4F55\u5177\u4F53\u5316\u7684\u5185\u5BB9\u90FD\u5FC5\u987B\u80FD\u4ECE\u8349\u7A3F\u6216\u4E0A\u4E0B\u6587\u5DF2\u786E\u8BA4\u4FE1\u606F\u627E\u5230\u4F9D\u636E;\u63A8\u65AD\u5904\u7528\u300C\u5982\u65E0\u7279\u522B\u8BF4\u660E/\u9ED8\u8BA4\u300D\u63AA\u8F9E\u4FDD\u7559\u9009\u62E9\u6743,\u65E0\u4F9D\u636E\u7684\u5B81\u53EF\u4E0D\u8865
- \u4FDD\u771F\u81EA\u68C0:\u8F93\u51FA\u524D\u9010\u8981\u7D20\u6838\u5BF9\u2014\u2014\u8349\u7A3F\u7684\u6BCF\u4E2A\u539F\u5B50\u4FE1\u606F\u90FD\u8981\u5728\u4F18\u5316\u7A3F\u4E2D\u627E\u5230\u5BF9\u5E94,\u627E\u4E0D\u5230\u5373\u4E3A\u8BED\u4E49\u6F02\u79FB,\u5FC5\u987B\u4FEE\u6B63
- \u957F\u5EA6\u7EAA\u5F8B:\u7B80\u5355\u4EFB\u52A1\u7684\u4F18\u5316\u7A3F\u63A7\u5236\u5728 500 \u5B57\u7B26\u4EE5\u5185,\u590D\u6742\u4EFB\u52A1\u53EF\u8D85\u51FA;\u4F18\u5316\u7A3F\u5C31\u662F\u63D0\u793A\u8BCD\u672C\u8EAB\u2014\u2014\u4E0D\u590D\u8FF0\u539F\u7A3F\u3001\u4E0D\u52A0\u591A\u4F59\u7684\u89E3\u91CA\u6216\u524D\u8A00;\u4EFB\u4F55\u60C5\u51B5\u4E0B\u4FDD\u771F\u81EA\u68C0\u4F18\u5148\u4E8E\u957F\u5EA6\u2014\u2014\u8981\u7D20\u7F3A\u5931\u6BD4\u5197\u957F\u66F4\u4E25\u91CD,\u4F46\u4E5F\u4E0D\u5F97\u5197\u4F59
- \u8BED\u8A00\u5339\u914D:\u8349\u7A3F\u4EE5\u4E2D\u6587\u4E3A\u4E3B\u4F53\u5219\u8F93\u51FA\u5FC5\u987B\u4E3A\u4E2D\u6587,\u4EE5\u82F1\u6587\u4E3A\u4E3B\u4F53\u5219\u8F93\u51FA\u5FC5\u987B\u4E3A\u82F1\u6587;\u4FDD\u7559\u539F\u6587\u7684\u672F\u8BED\u4E0E\u4E13\u6709\u540D\u8BCD`;
var RULES_EN = `# Fidelity & clarification rules (always apply)
- Understand first: list what the draft explicitly states (subject, action, constraints, scope, terms, numbers, tone), and separate it from your guesses \u2014 guesses may shape wording only, never enter the output
- Semantic equivalence is the floor: what the draft states (subject, direction, quantities, scope, prohibitions, terms) must survive intact \u2014 never replace, widen, narrow, or invert it
- Traceability: every concretized detail must trace back to the draft or to information the context has confirmed; mark inferences with "unless otherwise specified / by default" phrasing; when in doubt, leave it out
- Fidelity self-check: before output, verify every atomic element of the draft has a counterpart in your rewrite \u2014 a missing one is semantic drift and must be fixed
- Length discipline: keep the rewrite under 500 characters for simple tasks; longer is allowed for complex ones. The rewrite is the prompt itself \u2014 never restate the draft or add explanations or preamble. Fidelity always outranks length \u2014 a missing element is worse than verbosity, but never pad
- Language match: Chinese-dominant draft \u2192 Chinese output; English-dominant \u2192 English output; keep the draft's terms and proper nouns`;
var EXAMPLE_TEMPLATE_ZH = `# \u793A\u4F8B(\u4E25\u683C\u6A21\u4EFF\u5176\u300C\u8F93\u5165 \u2192 \u8F93\u51FA\u300D\u7684\u98CE\u683C)
\u8F93\u5165:\u5E2E\u6211\u5199\u4E2A\u8BF7\u5047\u6761
\u8F93\u51FA:\u8BF7\u5E2E\u6211\u64B0\u5199\u4E00\u5F20\u8BF7\u5047\u6761:\u4E8B\u7531\u4E3A\u611F\u5192\u5C31\u533B,\u8BF7\u5047\u4E24\u5929([\u5F85\u8865\u5145:\u8D77\u6B62\u65E5\u671F]);\u8BED\u6C14\u6B63\u5F0F\u7B80\u6D01,\u5305\u542B\u79F0\u547C\u4E0E\u843D\u6B3E,[\u5F85\u8865\u5145:\u8BF7\u5047\u5BF9\u8C61\u4E0E\u8054\u7CFB\u65B9\u5F0F]\u3002`;
var EXAMPLE_TEMPLATE_EN = `# Example (strictly mirror its "input \u2192 output" style)
Input: help me write a leave note
Output: Write a formal leave request: two days off for a medical visit ([TODO: exact dates]); concise tone, with salutation and sign-off, [TODO: recipient and contact].`;
var EXAMPLE_INTENT_ZH = `# \u793A\u4F8B(\u4E25\u683C\u6A21\u4EFF\u5176\u300C\u8F93\u5165 \u2192 \u8F93\u51FA\u300D\u7684\u98CE\u683C;\u8F93\u5165\u4E2D\u7684\u80CC\u666F\u6765\u81EA <conversation-context>)
\u8F93\u5165:(\u80CC\u666F:\u7528\u6237\u5728\u8FD0\u8425 200 \u4EBA\u5C0F\u533A\u5B9D\u5988\u95F2\u7F6E\u7FA4,\u9996\u6B21\u63A5\u9F99\u53EA\u6709\u5341\u51E0\u4EBA\u53C2\u4E0E,\u590D\u76D8\u4E3A\u5956\u54C1\u5DEE\u3001\u683C\u5F0F\u4E71)\u5E2E\u6211\u91CD\u65B0\u8BBE\u8BA1\u4E00\u4E0B\u8FD9\u4E2A\u63A5\u9F99
\u8F93\u51FA:\u5E2E\u6211\u91CD\u65B0\u8BBE\u8BA1\u5C0F\u533A\u95F2\u7F6E\u7FA4\u7684\u300C\u597D\u7269\u63A8\u8350\u300D\u63A5\u9F99:\u7FA4 200 \u4F59\u4EBA\u3001\u4EE5\u5B9D\u5988\u4E3A\u4E3B,\u4E0A\u6B21\u53C2\u4E0E\u4EC5\u5341\u51E0\u4EBA,\u95EE\u9898\u5728\u4E8E\u5956\u54C1\u5438\u5F15\u529B\u4E0D\u8DB3\u3001\u63A5\u9F99\u683C\u5F0F\u6DF7\u4E71;\u8BF7\u7ED9\u51FA\u683C\u5F0F\u7B80\u660E\u7684\u63A5\u9F99\u6587\u6848\u6A21\u677F\u3001\u4F4E\u6210\u672C\u9AD8\u5438\u5F15\u529B\u7684\u5956\u54C1\u5EFA\u8BAE,\u4EE5\u53CA\u63D0\u5347\u53C2\u4E0E\u5EA6\u7684\u5177\u4F53\u624B\u6BB5\u3002`;
var EXAMPLE_INTENT_EN = `# Example (strictly mirror its "input \u2192 output" style; the background comes from <conversation-context>)
Input: (background: the user runs a 200-member neighborhood parents' swap group; the first chain-post drew only a dozen joins, blamed on weak prizes and a messy format) redesign the chain post for me
Output: Redesign the "hidden gems" chain post for my 200-member neighborhood swap group (mostly parents): last round drew only a dozen joins because prizes were unappealing and the format confusing \u2014 provide a simple chain-post template, low-cost but attractive prize ideas, and concrete tactics to lift participation.`;
var FORMAT_FULL_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.analysis}
\u6309\u7EF4\u5EA6\u9010\u6761\u8F93\u51FA\u8BCA\u65AD,\u6BCF\u6761\u4E00\u884C,\u683C\u5F0F:\u300C\u7EF4\u5EA6 | \u95EE\u9898 | \u5EFA\u8BAE\u300D\u3002\u67D0\u7EF4\u5EA6\u65E0\u660E\u663E\u95EE\u9898\u65F6\u5199:\u300C\u7EF4\u5EA6 | \u65E0\u660E\u663E\u95EE\u9898 | -\u300D\u3002
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FULL_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.analysis}
One finding per line: "dimension | issue | suggestion". If a dimension is fine: "dimension | no issue | -".
${MARKERS.end}

Do not output anything outside these markers.`;
var FORMAT_FAST_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FAST_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`;
function buildSystemPrompt(language, mode = "full", strategy = "template") {
  const zh = language !== "en";
  const parts = [zh ? mode === "fast" ? ROLE_FAST_ZH : ROLE_FULL_ZH : mode === "fast" ? ROLE_FAST_EN : ROLE_FULL_EN];
  if (mode !== "fast") parts.push(zh ? ANALYSIS_ZH : ANALYSIS_EN);
  parts.push(zh ? strategy === "intent" ? STRATEGY_INTENT_ZH : STRATEGY_TEMPLATE_ZH : strategy === "intent" ? STRATEGY_INTENT_EN : STRATEGY_TEMPLATE_EN);
  parts.push(zh ? RULES_ZH : RULES_EN);
  parts.push(zh ? strategy === "intent" ? EXAMPLE_INTENT_ZH : EXAMPLE_TEMPLATE_ZH : strategy === "intent" ? EXAMPLE_INTENT_EN : EXAMPLE_TEMPLATE_EN);
  parts.push(mode === "fast" ? zh ? FORMAT_FAST_ZH : FORMAT_FAST_EN : zh ? FORMAT_FULL_ZH : FORMAT_FULL_EN);
  return parts.join("\n\n");
}
var CONTEXT_MAX_TURNS = 8;
var CONTEXT_MAX_CHARS = 1600;
var CONTEXT_TURN_MAX_CHARS = 600;
var CONTEXT_MIN_USER_TURNS = 1;
var CONTEXT_USER_BUDGET = 800;
function capConversationContext(turns) {
  const recent = turns.filter((t) => t.text.trim()).slice(-CONTEXT_MAX_TURNS).map((t) => ({
    role: t.role,
    text: t.text.trim().length > CONTEXT_TURN_MAX_CHARS ? `${t.text.trim().slice(0, CONTEXT_TURN_MAX_CHARS)}\u2026` : t.text.trim()
  }));
  if (recent.length === 0) return [];
  const indexed = recent.map((turn, index) => ({ turn, index }));
  const kept = /* @__PURE__ */ new Map();
  let budget = CONTEXT_MAX_CHARS;
  const users = indexed.filter((x) => x.turn.role === "user");
  let userBudget = Math.min(CONTEXT_USER_BUDGET, budget);
  for (let i = users.length - 1; i >= 0; i--) {
    const { turn, index } = users[i];
    const keptUsers = users.length - i;
    const mustKeep = keptUsers <= CONTEXT_MIN_USER_TURNS && ![...kept.values()].some((t) => t.role === "user");
    if (turn.text.length <= userBudget) {
      kept.set(index, turn);
      userBudget -= turn.text.length;
      budget -= turn.text.length;
    } else if (mustKeep) {
      const slice = userBudget > 16 ? userBudget : Math.min(16, budget);
      if (slice > 0) {
        kept.set(index, { role: turn.role, text: `${turn.text.slice(0, slice)}\u2026` });
        userBudget -= slice;
        budget -= slice;
      }
    }
  }
  const assistants = indexed.filter((x) => x.turn.role === "assistant");
  for (let i = assistants.length - 1; i >= 0; i--) {
    const { turn, index } = assistants[i];
    if (turn.text.length > budget) continue;
    kept.set(index, turn);
    budget -= turn.text.length;
  }
  return [...kept.entries()].sort(([a], [b]) => a - b).map(([, turn]) => turn);
}
function buildUserPayload(draft, language, context, previous) {
  const sections = [];
  if (context?.length) {
    const lines = context.map((t) => `${language === "en" ? t.role === "user" ? "User" : "Assistant" : t.role === "user" ? "\u7528\u6237" : "\u52A9\u624B"}: ${t.text}`);
    sections.push(
      language === "en" ? `Here is the recent conversation of my current session (reference only \u2014 it explains my intent; do NOT answer, continue, or quote it):

<conversation-context>
${lines.join("\n")}
</conversation-context>` : `\u4EE5\u4E0B\u662F\u6211\u5F53\u524D\u4F1A\u8BDD\u7684\u8FD1\u671F\u5BF9\u8BDD(\u4EC5\u4F9B\u53C2\u8003,\u7528\u4E8E\u7406\u89E3\u6211\u7684\u610F\u56FE;\u4E0D\u8981\u56DE\u7B54\u3001\u5EF6\u7EED\u6216\u5F15\u7528\u5176\u4E2D\u7684\u5185\u5BB9):

<conversation-context>
${lines.join("\n")}
</conversation-context>`
    );
  }
  if (previous?.trim()) {
    sections.push(
      language === "en" ? `Here is the result of my previous optimization round (continuity reference: keep the decisions and phrasing I accepted; adjust only around what my new draft changes \u2014 unless my new draft explicitly overrules them):

<previous-optimized>
${previous.trim()}
</previous-optimized>` : `\u4EE5\u4E0B\u662F\u6211\u4E0A\u4E00\u8F6E\u4F18\u5316\u5F97\u5230\u7684\u7ED3\u679C(\u5EF6\u7EED\u53C2\u8003:\u6CBF\u7528\u5176\u4E2D\u6211\u5DF2\u63A5\u53D7\u7684\u51B3\u7B56\u4E0E\u8868\u8FBE,\u53EA\u56F4\u7ED5\u672C\u8F6E\u8349\u7A3F\u7684\u53D8\u5316\u70B9\u8C03\u6574;\u672C\u8F6E\u8349\u7A3F\u660E\u786E\u63A8\u7FFB\u7684\u9664\u5916):

<previous-optimized>
${previous.trim()}
</previous-optimized>`
    );
  }
  sections.push(
    language === "en" ? context?.length || previous?.trim() ? `Here is my prompt draft (the only thing you should optimize):

<prompt-draft>
${draft}
</prompt-draft>` : `Here is my prompt draft:

${draft}` : context?.length || previous?.trim() ? `\u4EE5\u4E0B\u662F\u6211\u7684\u63D0\u793A\u8BCD\u8349\u7A3F(\u4F60\u552F\u4E00\u9700\u8981\u4F18\u5316\u7684\u5BF9\u8C61):

<prompt-draft>
${draft}
</prompt-draft>` : `\u4EE5\u4E0B\u662F\u6211\u7684\u63D0\u793A\u8BCD\u8349\u7A3F:

${draft}`
  );
  return sections.join("\n\n");
}
function isWideTokenChar(code) {
  return code >= 4352 && code <= 4607 || // 谚文字母
  code >= 11904 && code <= 12255 || // CJK 部首补充 / 康熙部首
  code >= 12288 && code <= 12351 || // CJK 符号与标点(全角)
  code >= 12352 && code <= 12543 || // 平假名 / 片假名
  code >= 12592 && code <= 12687 || // 谚文兼容字母
  code >= 13312 && code <= 19903 || // CJK 扩展 A
  code >= 19968 && code <= 40959 || // CJK 统一表意文字
  code >= 43360 && code <= 43391 || // 谚文字母扩展 A
  code >= 44032 && code <= 55215 || // 谚文音节
  code >= 63744 && code <= 64255 || // CJK 兼容表意文字
  code >= 65280 && code <= 65376 || // 全角 ASCII 变体
  code >= 65504 && code <= 65510 || // 全角符号
  code >= 131072 && code <= 262143;
}
function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isWideTokenChar(ch.codePointAt(0) ?? 0)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk + other / 4);
}
function findMarker(text, word, fromIndex = 0) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function findLastMarker(text, word, beforeIndex = text.length) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  let last = null;
  for (const match of text.matchAll(re)) {
    if (match.index >= beforeIndex) break;
    last = { index: match.index, length: match[0].length };
  }
  return last;
}
function stripMarkers(text) {
  return text.replace(/<<<\s*(?:ANALYSIS|OPTIMIZED|END)\s*>>>/g, "");
}
function findNextMarker(text, fromIndex) {
  const re = /<<<\s*(?:ANALYSIS|OPTIMIZED|END)\s*>>>/g;
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function segmentAfter(text, marker) {
  const firstEnd = findMarker(text, "END");
  if (firstEnd && marker.index > firstEnd.index) return "";
  const start = marker.index + marker.length;
  const next = findNextMarker(text, start);
  let end = next ? next.index : text.length;
  if (firstEnd && firstEnd.index > start && firstEnd.index < end) end = firstEnd.index;
  return text.slice(start, end).trim();
}
var THINK_OPEN = "<think>";
var THINK_CLOSE = "</think>";
function stripThinkBlocks(text) {
  let out = "";
  let rest = text;
  for (; ; ) {
    const open = rest.indexOf(THINK_OPEN);
    if (open === -1) return out + rest;
    out += rest.slice(0, open);
    const close = rest.indexOf(THINK_CLOSE, open + THINK_OPEN.length);
    if (close === -1) return out;
    rest = rest.slice(close + THINK_CLOSE.length);
  }
}
function createThinkFilter() {
  let buf = "";
  let inThink = false;
  const splitSafeTail = (tagLen) => {
    const lastLt = buf.lastIndexOf("<");
    const keepFrom = lastLt !== -1 && buf.length - lastLt <= tagLen - 1 ? lastLt : buf.length;
    return [buf.slice(0, keepFrom), buf.slice(keepFrom)];
  };
  const push = (chunk) => {
    buf += chunk;
    let out = "";
    for (; ; ) {
      if (inThink) {
        const close = buf.indexOf(THINK_CLOSE);
        if (close === -1) {
          const [emit, keep] = splitSafeTail(THINK_CLOSE.length);
          void emit;
          buf = keep;
          return out;
        }
        buf = buf.slice(close + THINK_CLOSE.length);
        inThink = false;
        continue;
      }
      const open = buf.indexOf(THINK_OPEN);
      if (open === -1) {
        const [emit, keep] = splitSafeTail(THINK_OPEN.length);
        out += emit;
        buf = keep;
        return out;
      }
      out += buf.slice(0, open);
      buf = buf.slice(open + THINK_OPEN.length);
      inThink = true;
    }
  };
  const flush = () => {
    if (inThink) {
      buf = "";
      return "";
    }
    const rest = buf;
    buf = "";
    return rest;
  };
  return { push, flush };
}
function parseOptimizerOutput(raw, mode = "full") {
  const text = stripThinkBlocks(raw).trim();
  const o = findLastMarker(text, "OPTIMIZED");
  const a = findLastMarker(text, "ANALYSIS");
  const wellFormed = mode === "fast" ? true : Boolean(a && o);
  if (!a && !o) {
    const body = stripMarkers(text).trim();
    return { analysis: "", optimized: body, wellFormed: wellFormed && Boolean(body) };
  }
  const optimized = o ? segmentAfter(text, o) : "";
  const analysis = a ? segmentAfter(text, a) : "";
  return {
    // 有标记但段落为空:保持为空(可能只是模型没写内容),绝不回退到含标记的原文。
    analysis,
    optimized,
    // 优化稿为空 = 这次输出不可用,降级展示并让客户端弹格式警示。
    wellFormed: wellFormed && Boolean(optimized)
  };
}

// src/index.ts
var name = "dsh-prompt-optimizer";
var inject = ["llm"];
var Config = Schema.object({
  language: Schema.string().default("zh").volatile(),
  model: Schema.string().volatile(),
  fallbackModel: Schema.string().volatile(),
  maxTokens: Schema.number().min(1024).max(32768).default(8192).volatile(),
  timeoutSeconds: Schema.number().min(10).max(600).default(120).volatile(),
  mode: Schema.string().default("fast").volatile(),
  reasoningEffort: Schema.string().default("lowest").volatile(),
  temperature: Schema.number().min(0).max(2).default(0.2).volatile(),
  autoMaxTokens: Schema.boolean().default(true).volatile(),
  includeContext: Schema.boolean().default(true).volatile()
});
function unwrapCell(value) {
  return typeof value?.get === "function" ? value.get() : value;
}
function readConfig(raw) {
  return {
    language: unwrapCell(raw.language),
    model: unwrapCell(raw.model),
    fallbackModel: unwrapCell(raw.fallbackModel),
    maxTokens: unwrapCell(raw.maxTokens),
    timeoutSeconds: unwrapCell(raw.timeoutSeconds),
    mode: unwrapCell(raw.mode),
    reasoningEffort: unwrapCell(raw.reasoningEffort),
    temperature: unwrapCell(raw.temperature),
    autoMaxTokens: unwrapCell(raw.autoMaxTokens),
    includeContext: unwrapCell(raw.includeContext)
  };
}
var NS = "prompt-optimizer";
var ROUTE_PATH = "/dsh-prompt-optimizer/optimize";
var TEST_ROUTE_PATH = "/dsh-prompt-optimizer/test-model";
var MAX_BODY_BYTES = 256 * 1024;
var MAX_CONCURRENT_OPTIMIZES = 3;
var SSE_HEARTBEAT_MS = 15e3;
var ONESHOT_SESSION_ID = "prompt-optimizer-one-shot";
function warnUnknownEnum(warned, value, allowed, label) {
  const key = `${label}=${value}`;
  if (!allowed.includes(value) && !warned.has(key)) {
    warned.add(key);
    console.warn(`[${name}] \u914D\u7F6E ${label}="${value}" \u4E0D\u662F\u6709\u6548\u503C(\u652F\u6301:${allowed.join("/")}),\u5DF2\u6309\u9ED8\u8BA4\u5904\u7406`);
  }
}
function warnUnknownEnumConfig(warned, cfg) {
  if (cfg.language !== "zh" && cfg.language !== "en") warnUnknownEnum(warned, cfg.language, ["zh", "en"], "language");
  if (cfg.mode !== "full" && cfg.mode !== "fast") warnUnknownEnum(warned, cfg.mode, ["full", "fast"], "mode");
  if (cfg.reasoningEffort !== "lowest" && cfg.reasoningEffort !== "session") {
    warnUnknownEnum(warned, cfg.reasoningEffort, ["lowest", "session"], "reasoningEffort");
  }
}
function asOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function parseContextInput(value) {
  if (!Array.isArray(value)) return void 0;
  const turns = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { role, text } = item;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      turns.push({ role, text: text.trim() });
    }
  }
  return turns.length ? capConversationContext(turns) : void 0;
}
function writeJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
function assertTrustedOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = "";
  }
  if (!host || originHost !== host) {
    writeJson(res, 403, { ok: false, error: "\u5DF2\u62D2\u7EDD\u8DE8\u7AD9\u8BF7\u6C42(Origin \u4E0E Host \u4E0D\u7B26)" });
    return false;
  }
  const hostName = host.replace(/:\d+$/, "");
  const hostPort = /:(\d+)$/.exec(host)?.[1] ?? "80";
  const loopback = hostName === "localhost" || hostName === "127.0.0.1" || hostName === "[::1]" || hostName === "::1";
  if (!loopback) {
    const sock = req.socket;
    if (!(sock?.localAddress && sock?.localPort && hostName === sock.localAddress && hostPort === String(sock.localPort))) {
      writeJson(res, 403, { ok: false, error: "\u8BF7\u6C42\u7684 Host \u4E0E\u672C\u673A\u670D\u52A1\u5730\u5740\u4E0D\u7B26(\u53EF\u80FD\u7684 DNS rebinding),\u5DF2\u62D2\u7EDD" });
      return false;
    }
  }
  return true;
}
var PayloadTooLargeError = class extends Error {
};
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError("\u8BF7\u6C42\u4F53\u8D85\u8FC7 256KB \u4E0A\u9650");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  return parsed;
}
async function readBodyOrReply(req, res) {
  try {
    return await readJsonBody(req);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      writeJson(res, 413, { ok: false, error: error.message });
    } else {
      writeJson(res, 400, { ok: false, error: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON \u5BF9\u8C61" });
    }
    return void 0;
  }
}
async function collectText(stream, onDelta) {
  let deltas = "";
  const blocks = /* @__PURE__ */ new Map();
  let truncated = false;
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text-delta":
        deltas += chunk.text;
        onDelta?.(chunk.text);
        break;
      case "block-end":
        if (chunk.block.type === "text") blocks.set(chunk.index, chunk.block.text);
        break;
      case "finish": {
        const reason = chunk.reason;
        if (reason.kind === "error" || reason.kind === "aborted") {
          throw new Error(`\u6A21\u578B\u8C03\u7528\u5931\u8D25(${reason.failure.code}): ${reason.failure.message}`);
        }
        if (reason.kind === "tool-calls") {
          throw new Error("\u6A21\u578B\u610F\u5916\u8BF7\u6C42\u5DE5\u5177\u8C03\u7528(\u4F18\u5316\u8C03\u7528\u4E0D\u63D0\u4F9B\u5DE5\u5177),\u8BF7\u68C0\u67E5\u6A21\u578B\u8DEF\u7531\u914D\u7F6E");
        }
        if (reason.kind === "max-tokens") truncated = true;
        break;
      }
      default:
        break;
    }
  }
  const text = deltas || [...blocks.entries()].sort(([a], [b]) => a - b).map(([, t]) => t).join("");
  return { text, truncated };
}
var EFFORT_RANK = [
  { rank: 4, re: /(?:^|[^a-z])(?:x[\s_-]?high|very[\s_-]?high|maximum|max|highest)(?:$|[^a-z])|最高/i },
  { rank: 3, re: /(?:^|[^a-z])high(?:$|[^a-z])|高/i },
  { rank: 2, re: /(?:^|[^a-z])(?:medium|mid(?:dle)?|standard|default)(?:$|[^a-z])|中/i },
  { rank: 1, re: /(?:^|[^a-z])(?:minimal|minimum|lowest|low)(?:$|[^a-z])|最少|最低|低/i },
  { rank: 0, re: /(?:^|[^a-z])(?:none|off|disabled|no[\s_-]?reasoning)(?:$|[^a-z])|^(?:0)$/i }
];
function effortRank(id, name2) {
  for (const { rank, re } of EFFORT_RANK) {
    if (re.test(id) || re.test(name2)) return rank;
  }
  return void 0;
}
async function resolveLowestEffort(llm, provider, model) {
  try {
    const efforts = (await llm.resolveModelInfo(provider, model)).reasoning?.efforts;
    if (!efforts?.length) return void 0;
    let best;
    for (const effort of efforts) {
      const rank = effortRank(String(effort.id), String(effort.name ?? ""));
      if (rank === void 0) continue;
      if (!best || rank < best.rank) best = { id: String(effort.id), rank };
    }
    return best?.id;
  } catch {
    return void 0;
  }
}
var EFFORT_CACHE_TTL = 10 * 60 * 1e3;
async function resolveRoute(llm, pinnedModel, bodyProvider, bodyModel) {
  let provider;
  let model;
  const pinned = asOptionalString(pinnedModel);
  if (pinned) {
    const slash = pinned.indexOf("/");
    if (slash > 0 && slash < pinned.length - 1) {
      provider = pinned.slice(0, slash);
      model = pinned.slice(slash + 1);
    }
  }
  provider ??= bodyProvider;
  model ??= bodyModel;
  if (!provider || !model) {
    const first = llm.listProviders()[0];
    if (!provider && first) provider = first.id;
    if (provider && !model) {
      try {
        model = (await llm.listModels(provider))[0]?.id;
      } catch {
      }
    }
  }
  return provider && model ? { provider, model } : void 0;
}
function apply(ctx, config) {
  const warnedConfigValues = /* @__PURE__ */ new Set();
  let inFlightOptimizes = 0;
  const effortCache = /* @__PURE__ */ new Map();
  const resolveLowestEffortCached = async (llm, provider, model) => {
    const key = `${provider}/${model}`;
    const hit = effortCache.get(key);
    if (hit && Date.now() - hit.at < EFFORT_CACHE_TTL) return hit.effort;
    const effort = await resolveLowestEffort(llm, provider, model);
    if (effort !== void 0) effortCache.set(key, { effort, at: Date.now() });
    return effort;
  };
  let current = () => readConfig(config);
  ctx.inject(["settings"], (sctx) => {
    const settings = sctx.settings;
    if (!settings) return;
    if (typeof settings.configure === "function") {
      ctx.effect(() => settings.configure({ auto: false }, ctx.fiber));
    }
    if (typeof settings.installSection === "function") {
      settings.installSection(ctx, NS, Config, config, {
        setSource: (source) => {
          current = () => readConfig(source());
        },
        onChange: () => {
        }
      });
      return;
    }
    if (typeof settings.register !== "function") return;
    const scope = settings.register(NS, Config, { base: config });
    current = () => readConfig(scope.get());
    const disposeWatch = scope.watch(() => {
      current = () => readConfig(scope.get());
    });
    ctx.effect(() => () => {
      disposeWatch();
      current = () => readConfig(config);
    });
  });
  warnUnknownEnumConfig(warnedConfigValues, current());
  let mounted = false;
  const mount = (server) => {
    if (!server || mounted) return;
    mounted = true;
    ctx.effect(() => {
      const disposeOptimize = server.register({ kind: "exact", path: ROUTE_PATH, handler });
      const disposeTest = server.register({ kind: "exact", path: TEST_ROUTE_PATH, handler: testHandler });
      console.log(`[${name}] loaded, POST ${ROUTE_PATH}`);
      return () => {
        mounted = false;
        disposeOptimize();
        disposeTest();
      };
    });
  };
  ctx.inject(["webServer"], (sctx) => mount(sctx.webServer));
  ctx.inject(["httpServer"], (sctx) => mount(sctx.httpServer));
  ctx.effect(() => {
    const timer = setTimeout(() => {
      if (!mounted) {
        console.error(`[${name}] \u672A\u627E\u5230 webServer/httpServer \u670D\u52A1,\u8DEF\u7531\u672A\u6CE8\u518C\u2014\u2014\u5F53\u524D dsh \u7248\u672C\u53EF\u80FD\u4E0D\u517C\u5BB9`);
      }
    }, 1e4);
    return () => clearTimeout(timer);
  });
  async function handler(req, res) {
    if (req.method !== "POST") {
      writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
      return;
    }
    if (!assertTrustedOrigin(req, res)) return;
    if (inFlightOptimizes >= MAX_CONCURRENT_OPTIMIZES) {
      writeJson(res, 429, {
        ok: false,
        error: `\u540C\u65F6\u8FDB\u884C\u7684\u4F18\u5316\u5DF2\u8FBE\u4E0A\u9650(${MAX_CONCURRENT_OPTIMIZES} \u4E2A),\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002`
      });
      return;
    }
    inFlightOptimizes += 1;
    try {
      await handleOptimize(req, res);
    } finally {
      inFlightOptimizes -= 1;
    }
  }
  async function handleOptimize(req, res) {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      const body = await readBodyOrReply(req, res);
      if (!body) return;
      const text = asOptionalString(body.text);
      const sessionId = asOptionalString(body.sessionId) ?? ONESHOT_SESSION_ID;
      if (!text) {
        writeJson(res, 400, { ok: false, error: "\u63D0\u793A\u8BCD\u5185\u5BB9\u4E3A\u7A7A" });
        return;
      }
      const cfg = current();
      warnUnknownEnumConfig(warnedConfigValues, cfg);
      const language = cfg.language === "en" ? "en" : "zh";
      const mode = cfg.mode === "fast" ? "fast" : "full";
      const route = await resolveRoute(ctx.llm, cfg.model, asOptionalString(body.provider), asOptionalString(body.model));
      if (!route) {
        writeJson(res, 409, {
          ok: false,
          error: "\u672A\u627E\u5230\u53EF\u7528\u6A21\u578B:\u8BF7\u5148\u5728 \u8BBE\u7F6E \u2192 \u6A21\u578B \u4E2D\u914D\u7F6E\u63D0\u4F9B\u65B9,\u6216\u5728 \u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D \u4E2D\u56FA\u5B9A\u4E00\u4E2A\u6A21\u578B"
        });
        return;
      }
      const routes = [route];
      const fallbackRaw = asOptionalString(cfg.fallbackModel);
      if (fallbackRaw) {
        const slash = fallbackRaw.indexOf("/");
        if (slash > 0 && slash < fallbackRaw.length - 1) {
          const fb = { provider: fallbackRaw.slice(0, slash), model: fallbackRaw.slice(slash + 1) };
          if (fb.provider !== route.provider || fb.model !== route.model) routes.push(fb);
        }
      }
      const context = cfg.includeContext === false ? void 0 : parseContextInput(body.context);
      const previousRaw = cfg.includeContext === false ? void 0 : asOptionalString(body.previous);
      const previous = previousRaw ? previousRaw.length > 1500 ? `${previousRaw.slice(0, 1500)}\u2026` : previousRaw : void 0;
      const message = {
        id: `prompt-optimizer-${crypto.randomUUID()}`,
        role: "user",
        content: [{ type: "text", text: buildUserPayload(text, language, context, previous) }],
        source: { kind: "plugin", plugin: name }
      };
      const system = buildSystemPrompt(language, mode, context?.length ? "intent" : "template");
      const maxTokens = cfg.autoMaxTokens === false ? cfg.maxTokens : Math.min(32768, Math.max(cfg.maxTokens, Math.ceil(estimateTokens(text) * (mode === "fast" ? 1.5 : 2))));
      const sessionEffort = asOptionalString(body.reasoningEffort);
      const preferSessionEffort = cfg.reasoningEffort === "session";
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no"
      });
      const send = (event) => {
        if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}

`);
      };
      const heartbeat = setInterval(() => {
        if (!res.destroyed && !res.writableEnded) res.write(": ping\n\n");
      }, SSE_HEARTBEAT_MS);
      const timeoutSec = cfg.timeoutSeconds ?? 120;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, timeoutSec * 1e3);
      try {
        let sentAny = false;
        let used = routes[0];
        let raw = null;
        let lastError = null;
        let fallbackReason;
        for (const attempt of routes) {
          used = attempt;
          try {
            const options = {
              provider: attempt.provider,
              model: attempt.model,
              system,
              messages: [message],
              maxTokens,
              temperature: cfg.temperature ?? 0.2,
              signal: abort.signal,
              // 会话标注恒存在:客户端会话 id 优先(会话级计量正确归属),
              // 缺席回落合成 id。opencode 等提供方要求会话头(x-opencode-session,
              // 由 pi-ai 适配器按 GenerateOptions.sessionId 注入),缺失会被
              // API 以「缺少请求头」拒绝;其余适配器仅作模型不可见的传输
              // 元数据处理,不外发。
              sessionId
            };
            let effort = sessionEffort;
            if (!preferSessionEffort) {
              effort = await resolveLowestEffortCached(ctx.llm, attempt.provider, attempt.model) ?? sessionEffort;
            }
            if (effort) {
              options.reasoningEffort = effort;
            }
            const thinkFilter = createThinkFilter();
            raw = await collectText(ctx.llm.stream(options), (delta) => {
              sentAny = true;
              const clean = thinkFilter.push(delta);
              if (clean) send({ type: "delta", text: clean });
            });
            const thinkTail = thinkFilter.flush();
            if (thinkTail) send({ type: "delta", text: thinkTail });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (timedOut || abort.signal.aborted || sentAny) break;
            if (attempt !== routes[routes.length - 1]) {
              fallbackReason = error instanceof Error ? error.message : String(error);
              console.error(`[${name}] \u4E3B\u8DEF\u7531 ${attempt.provider}/${attempt.model} \u5931\u8D25,\u5C1D\u8BD5\u56DE\u9000\u8DEF\u7531:`, error);
            }
          }
        }
        if (raw) {
          const parsed = parseOptimizerOutput(raw.text, mode);
          send({
            type: "done",
            ...parsed,
            truncated: raw.truncated,
            provider: used.provider,
            model: used.model,
            fallbackUsed: used !== routes[0],
            ...fallbackReason ? { fallbackReason } : {}
          });
        } else if (timedOut) {
          send({
            type: "error",
            error: `\u4F18\u5316\u8D85\u65F6:${timeoutSec} \u79D2\u5185\u672A\u751F\u6210\u5B8C\u6BD5\u3002\u53EF\u5728 \u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D \u4E2D\u8C03\u9AD8\u300C\u8D85\u65F6\u65F6\u95F4\u300D\u3002`
          });
        } else if (!abort.signal.aborted && lastError) {
          const message2 = lastError instanceof Error ? lastError.message : String(lastError);
          console.error(`[${name}] optimize failed:`, lastError);
          send({ type: "error", error: message2 });
        }
      } finally {
        clearTimeout(timer);
        clearInterval(heartbeat);
      }
      res.end();
    } catch (error) {
      if (abort.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${name}] optimize failed:`, error);
      writeJson(res, 502, { ok: false, error: message });
      if (!res.writableEnded) res.end();
    }
  }
  async function testHandler(req, res) {
    if (req.method !== "POST") {
      writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
      return;
    }
    if (!assertTrustedOrigin(req, res)) return;
    const body = await readBodyOrReply(req, res);
    if (!body) return;
    const cfg = current();
    const route = await resolveRoute(ctx.llm, cfg.model, asOptionalString(body.provider), asOptionalString(body.model));
    if (!route) {
      writeJson(res, 409, {
        ok: false,
        error: "\u672A\u627E\u5230\u53EF\u7528\u6A21\u578B:\u8BF7\u5148\u5728 \u8BBE\u7F6E \u2192 \u6A21\u578B \u4E2D\u914D\u7F6E\u63D0\u4F9B\u65B9,\u6216\u5728 \u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D \u4E2D\u56FA\u5B9A\u4E00\u4E2A\u6A21\u578B"
      });
      return;
    }
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 2e4);
    const started = Date.now();
    try {
      const message = {
        id: `prompt-optimizer-test-${crypto.randomUUID()}`,
        role: "user",
        content: [{ type: "text", text: "ping" }],
        source: { kind: "plugin", plugin: name }
      };
      const result = await collectText(
        ctx.llm.stream({
          provider: route.provider,
          model: route.model,
          messages: [message],
          maxTokens: 32,
          signal: abort.signal,
          // 探活没有真实会话,标注一个固定合成 id:opencode 等提供方要求
          // 会话头(x-opencode-session,适配器按 sessionId 注入),缺失会被
          // API 以「缺少请求头」拒绝;固定值让探活稳定路由到同一桶。
          sessionId: "prompt-optimizer-connectivity-test"
        })
      );
      writeJson(res, 200, {
        ok: true,
        provider: route.provider,
        model: route.model,
        latencyMs: Date.now() - started,
        reply: result.text.slice(0, 80)
      });
    } catch (error) {
      if (timedOut) {
        writeJson(res, 200, { ok: false, error: "\u8FDE\u63A5\u6D4B\u8BD5\u8D85\u65F6(20s \u65E0\u54CD\u5E94)" });
      } else if (!abort.signal.aborted) {
        writeJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
export {
  Config,
  apply,
  inject,
  name
};
