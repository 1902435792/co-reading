/**
 * The model object structure
 */
type Model = {
  id: string;
  name?: string;
  active?: boolean;
  description?: string;
  capabilities?: string[];
  manual?: boolean;
};

/**
 * The provider object structure
 */
type ModelProvider = {
  name: string;
  active: boolean;
  provider: string;
  exploreModelsUrl?: string;
  apiKey?: string;
  apiKeyHelpUrl?: string;
  baseUrl?: string;
  baseUrlHelpUrl?: string;
  models: Model[];
  /** 一键配置向导建的 VCP Bridge 提供商：即使端口不是 3100 也按 Bridge 处理。 */
  vcpBridge?: boolean;
  /** 这个 Bridge 用哪套 Profile；不填 = 原来那套（coreading-lite / reading / memory-extract）。 */
  vcpProfileSet?: "classic" | "deepreader";
};
