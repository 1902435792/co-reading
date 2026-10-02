import { useProviderStore } from "@/store/provider-store";
import { isVcpBridgeProvider } from "@/components/nova/nova-memory";
import { type BridgePurpose, bridgeModelIdFor } from "@/components/settings/vcp-bridge-models";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { fetch as fetchTauri } from "@tauri-apps/plugin-http";

export interface ProviderConfig {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * 动态创建AI提供商实例
 */
export function createProviderInstance(config: ProviderConfig) {
  const { providerId, apiKey, baseUrl } = config;

  switch (providerId) {
    case "deepseek":
      return createDeepSeek({
        apiKey: apiKey || "",
        baseURL: baseUrl,
      });

    case "openrouter":
      return createOpenRouter({
        apiKey: apiKey || "",
        baseURL: baseUrl,
      });

    case "openai":
      return createOpenAI({
        apiKey: apiKey || "",
        baseURL: baseUrl,
      });

    case "anthropic":
      return createOpenAICompatible({
        apiKey: apiKey || "",
        baseURL: baseUrl || "https://api.anthropic.com/v1",
        includeUsage: true,
        name: "OpenAI Compatible",
        fetch: fetchTauri,
      });

    case "gemini":
    case "google":
      return createGoogleGenerativeAI({
        apiKey: apiKey || "",
        baseURL: baseUrl,
      });

    case "grok":
      // Grok 使用 OpenAI 兼容的 API
      return createOpenAI({
        apiKey: apiKey || "",
        baseURL: baseUrl || "https://api.x.ai/v1",
      });

    default:
      return createOpenAICompatible({
        apiKey: apiKey || "",
        baseURL: baseUrl || "https://api.openai.com/v1",
        includeUsage: true,
        name: "OpenAI Compatible",
        fetch: fetchTauri,
      });
  }
}

/**
 * 根据提供商ID和模型ID创建模型实例
 */
export interface ModelInstanceOptions {
  /** VCP Bridge 提供商：按用途自动换成对应的 Profile 前缀（用户只选基础模型）。 */
  purpose?: BridgePurpose;
  /** VCP Bridge 提供商：去掉 -high，用不深度思考的快速版本。 */
  fast?: boolean;
}

export function createModelInstance(providerId: string, modelId: string, options: ModelInstanceOptions = {}) {
  // 从store获取提供商配置
  const { modelProviders } = useProviderStore.getState();
  const provider = modelProviders.find((p) => p.provider === providerId);

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  if (!provider.active) {
    throw new Error(`Provider is not active: ${providerId}`);
  }

  const model = provider.models.find((m) => m.id === modelId);
  if (!model || !model.active) {
    throw new Error(`Model not found or not active: ${modelId}`);
  }

  // 创建提供商实例
  const providerInstance = createProviderInstance({
    providerId,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
  });

  // 返回模型实例
  const requestModelId =
    options.purpose && isVcpBridgeProvider(provider)
      ? bridgeModelIdFor(modelId, options.purpose, { fast: options.fast, profileSet: provider.vcpProfileSet })
      : modelId;
  return providerInstance(requestModelId);
}

/**
 * Hook: 获取可用的模型列表
 */
export function useAvailableModels() {
  const { modelProviders } = useProviderStore();

  return modelProviders
    .filter((provider) => provider.active)
    .flatMap((provider) =>
      provider.models
        .filter((model) => model.active)
        .map((model) => ({
          modelId: model.id,
          providerId: provider.provider,
          providerName: provider.name,
          modelName: model.name || model.id,
        })),
    );
}
