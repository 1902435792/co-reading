import assert from "node:assert/strict";
import test from "node:test";
import { buildCoReadingDiaryFallbackRequest, resolveChatCompletionsEndpoint } from "./co-reading-diary-request.ts";
import { parseVcpChatDiaryResponse } from "./co-reading-diary-response.ts";
import {
  DEFAULT_VCP_SETUP_VARS,
  buildVcpPackFiles,
  joinVcpPath,
  normalizeVcpSetupVars,
  parseEnvText,
  planVcpWrite,
  renderVcpTemplate,
  resolveVcpBridgeConfig,
  vcpExportReadme,
  vcpPackDirs,
} from "./vcp-setup.ts";

const templates = {
  coreading: "我是 {{AGENT_NAME}}，叫你{{READER_CALL}}。[[{{DIARY_NAME}}日记本::Time::Group]]",
  memory: "只输出 JSON。",
  diary: "写进“{{DIARY_NAME}}日记本”，maid={{AGENT_NAME}}。{{VarDailyNoteGuide}}",
};

test("变量：去空白、填默认值、拦下不安全的日记本名", () => {
  assert.deepEqual(normalizeVcpSetupVars({}).vars, DEFAULT_VCP_SETUP_VARS);
  assert.deepEqual(normalizeVcpSetupVars({ agentName: "  小雪 ", readerCall: "", diaryName: " 书房 " }).vars, {
    agentName: "小雪",
    readerCall: "你",
    diaryName: "书房",
  });
  assert.equal(normalizeVcpSetupVars({ diaryName: "../Nova" }).errors.length > 0, true);
  assert.equal(normalizeVcpSetupVars({ diaryName: "a:b" }).errors.length > 0, true);
  assert.equal(normalizeVcpSetupVars({ diaryName: "书房." }).errors.length > 0, true);
  assert.equal(normalizeVcpSetupVars({ agentName: "{{x}}" }).errors.length > 0, true);
  assert.equal(normalizeVcpSetupVars({ diaryName: "阅读器" }).errors.length, 0);
});

test("模板只替换三个变量，VCP 自己的占位符保留", () => {
  const vars = { agentName: "小雪", readerCall: "主人", diaryName: "书房" };
  assert.equal(renderVcpTemplate(templates.coreading, vars), "我是 小雪，叫你主人。[[书房日记本::Time::Group]]");
  assert.equal(renderVcpTemplate(templates.diary, vars), "写进“书房日记本”，maid=小雪。{{VarDailyNoteGuide}}");
});

test("配置包：4 个 Profile + 3 个提示词，Profile 指向的提示词都在包里", () => {
  const files = buildVcpPackFiles(templates, DEFAULT_VCP_SETUP_VARS);
  assert.equal(files.filter((file) => file.kind === "profile").length, 4);
  assert.equal(files.filter((file) => file.kind === "prompt").length, 3);
  const paths = new Set(files.map((file) => file.relPath));
  for (const file of files.filter((item) => item.kind === "profile")) {
    const profile = JSON.parse(file.content) as Record<string, string>;
    assert.equal(file.relPath, `Plugin/VCPBridgeServer/profiles/${profile.name}.json`);
    assert.ok(profile.name.startsWith("deepreader-"));
    assert.ok(profile.systemPrompt.trim(), "systemPrompt 不能留空，否则会回退到全局提示词");
    assert.equal(profile.modelOverride, "");
    if (profile.systemPrompt.startsWith("prompts/")) {
      assert.ok(paths.has(`Plugin/VCPBridgeServer/${profile.systemPrompt}`), profile.systemPrompt);
    } else {
      assert.equal(profile.hijackMode, "off");
    }
  }
  assert.ok(
    files.every((file) => !file.content.includes("{{AGENT_NAME}}") && !file.content.includes("{{DIARY_NAME}}")),
  );
});

test("日记本文件夹跟着变量走", () => {
  assert.deepEqual(vcpPackDirs({ ...DEFAULT_VCP_SETUP_VARS, diaryName: "书房" }), [
    "Plugin/VCPBridgeServer/profiles",
    "Plugin/VCPBridgeServer/prompts",
    "dailynote/书房",
  ]);
});

test("只新增不覆盖：已存在的同名文件进跳过列表", () => {
  const files = buildVcpPackFiles(templates, DEFAULT_VCP_SETUP_VARS);
  const existing = new Set(["Plugin/VCPBridgeServer/profiles/deepreader-coreading-diary.json"]);
  const plan = planVcpWrite(files, existing);
  assert.equal(plan.skip.length, 1);
  assert.equal(plan.create.length, files.length - 1);
  assert.ok(plan.create.every((file) => !existing.has(file.relPath)));
});

test("拼路径保留 Windows 反斜杠", () => {
  assert.equal(joinVcpPath("D:\\VCP\\VCPToolBox\\", "dailynote/阅读器"), "D:\\VCP\\VCPToolBox\\dailynote\\阅读器");
  assert.equal(joinVcpPath("/home/a/VCPToolBox", "Plugin/x.json"), "/home/a/VCPToolBox/Plugin/x.json");
});

test("解析 .env：注释、引号、行尾注释", () => {
  const env = parseEnvText('# c\nBRIDGE_PORT=3200 # 端口\nKey="abc def"\nEMPTY=\nBAD LINE\r\n');
  assert.equal(env.BRIDGE_PORT, "3200");
  assert.equal(env.Key, "abc def");
  assert.equal(env.EMPTY, "");
  assert.equal("BAD LINE" in env, false);
});

test("端口和密钥按 Bridge 的优先级取", () => {
  assert.deepEqual(resolveVcpBridgeConfig({}), { port: 3100, key: null });
  assert.deepEqual(
    resolveVcpBridgeConfig({ bridgeEnv: "BRIDGE_PORT=3200\nBRIDGE_UPSTREAM_KEY=", rootEnv: "Key=root" }),
    {
      port: 3200,
      key: "root",
    },
  );
  assert.deepEqual(
    resolveVcpBridgeConfig({
      bridgeConfigJson: JSON.stringify({ port: 3300, upstreamKey: "json" }),
      bridgeEnv: "BRIDGE_PORT=3200\nBRIDGE_UPSTREAM_KEY=env",
      rootEnv: "Key=root",
    }),
    { port: 3300, key: "json" },
  );
  assert.deepEqual(resolveVcpBridgeConfig({ bridgeConfigJson: "{坏的", bridgeEnv: "BRIDGE_UPSTREAM_KEY=env" }), {
    port: 3100,
    key: "env",
  });
  assert.equal(resolveVcpBridgeConfig({ bridgeEnv: "BRIDGE_PORT=99999" }).port, 3100);
});

test("导出说明里带上日记本名字", () => {
  assert.ok(vcpExportReadme({ ...DEFAULT_VCP_SETUP_VARS, diaryName: "书房" }).includes("dailynote/书房/"));
});

const diaryPayload = {
  bookTitle: "书",
  currentDate: "2026-10-02",
  currentTime: "20:00",
  selectedCount: 1,
  sourceKeys: ["k1"],
  entries: [{ originalText: "原文", aiComment: "评论", summary: "摘要" }],
} as unknown as Parameters<typeof buildCoReadingDiaryFallbackRequest>[0];

test("日记兜底：走普通通道，带上显式触发标志", () => {
  const request = buildCoReadingDiaryFallbackRequest(diaryPayload, "gemini-3.8-flash", "deepreader-coreading-diary");
  assert.equal(request.model, "deepreader-coreading-diary/gemini-3.8-flash");
  assert.equal(request.stream, false);
  const body = JSON.parse(request.messages[0].content) as Record<string, unknown>;
  assert.equal(body.userExplicitlyTriggered, true);
  assert.equal(body.bookTitle, "书");
  assert.equal("model" in body, false);
  assert.equal(
    buildCoReadingDiaryFallbackRequest(diaryPayload, "reading/gemini-x", "deepreader-coreading-diary").model,
    "deepreader-coreading-diary/gemini-x",
  );
  assert.throws(() =>
    buildCoReadingDiaryFallbackRequest({ ...diaryPayload, selectedCount: 2 }, "gemini-x", "deepreader-coreading-diary"),
  );
  assert.equal(
    resolveChatCompletionsEndpoint("http://127.0.0.1:3100/v1/"),
    "http://127.0.0.1:3100/v1/chat/completions",
  );
});

test("日记兜底的结果：要有内容和服务端 ID，不自己编", () => {
  assert.deepEqual(parseVcpChatDiaryResponse({ id: "chatcmpl-1", choices: [{ message: { content: "已写入" } }] }), {
    diaryId: "chatcmpl-1",
    message: "已写入",
  });
  assert.throws(() => parseVcpChatDiaryResponse({ choices: [{ message: { content: "已写入" } }] }));
  assert.throws(() => parseVcpChatDiaryResponse({ id: "x", choices: [] }));
  assert.throws(() => parseVcpChatDiaryResponse(null));
});
