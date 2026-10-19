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
function parsePartialOptimizerOutput(raw) {
  const text = stripThinkBlocks(raw);
  const o = findLastMarker(text, "OPTIMIZED");
  const a = findLastMarker(text, "ANALYSIS");
  return {
    analysis: a ? segmentAfter(text, a) : "",
    optimized: o ? segmentAfter(text, o) : ""
  };
}
function compactPartialBuffer(raw) {
  const o = findLastMarker(raw, "OPTIMIZED");
  const a = findLastMarker(raw, "ANALYSIS");
  if (o && a && o.index < a.index) {
    return {
      compacted: `${MARKERS.analysis}
${raw.slice(a.index + a.length)}`,
      analysis: "",
      optimized: raw.slice(o.index + o.length, a.index).trim()
    };
  }
  if (o) {
    const analysis = a && a.index < o.index ? raw.slice(a.index + a.length, o.index).trim() : "";
    return { compacted: `${MARKERS.optimized}
${raw.slice(o.index + o.length)}`, analysis, optimized: "" };
  }
  return { compacted: null, analysis: "", optimized: "" };
}
export {
  buildSystemPrompt,
  buildUserPayload,
  capConversationContext,
  compactPartialBuffer,
  createThinkFilter,
  estimateTokens,
  parseOptimizerOutput,
  parsePartialOptimizerOutput,
  stripThinkBlocks
};
