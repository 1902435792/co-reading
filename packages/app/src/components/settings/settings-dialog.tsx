import { Anthropic, DeepSeek, Gemini, Grok, OpenAI, OpenRouter } from "@/components/icons";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProviderStore } from "@/store/provider-store";
import {
  BookOpenText,
  Boxes,
  ChevronRight,
  Database,
  FolderCog,
  Globe,
  Info,
  Palette,
  Server,
  Type,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import CoReadingSettings from "./co-reading-settings";
import FontManager from "./font-manager";
import GeneralSettings from "./general";
import LlamaSettings from "./llama";
import { OPEN_SETTINGS_EVENT } from "./open-settings";
import ProviderDetailSettings from "./provider-detail";
import ProvidersSettings from "./providers";
import ShortcutsSettings from "./shortcuts";
import TTSSettings from "./tts-settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsKey =
  | "general"
  | "appearance"
  | "co-reading"
  | "web-memory"
  | "data-privacy"
  | "about"
  | "font-manager"
  | "llama"
  | "tts"
  | "model-providers"
  | "shortcuts"
  | "provider-openai"
  | "provider-anthropic"
  | "provider-openrouter"
  | "provider-gemini"
  | "provider-deepseek"
  | "provider-grok";

interface SettingsItem {
  key: SettingsKey;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | null;
  children?: SettingsItem[];
}

export function ProviderIcons({ providerId }: { providerId: string }): React.ReactNode {
  switch (providerId) {
    case "openai":
      return <OpenAI className="h-4 w-4" />;
    case "anthropic":
      return <Anthropic className="h-4 w-4" />;
    case "openrouter":
      return <OpenRouter className="h-4 w-4" />;
    case "gemini":
      return <Gemini className="h-4 w-4" />;
    case "grok":
      return <Grok className="h-4 w-4" />;
    case "deepseek":
      return <DeepSeek className="h-4 w-4" />;
    default:
      return <Server className="h-4 w-4" />;
  }
}

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeKey, setActiveKey] = useState<SettingsKey>("appearance");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(["model-providers"]));
  const { modelProviders } = useProviderStore();

  const settingsGroups: { title: string; items: SettingsItem[] }[] = [
    {
      title: "通用",
      items: [
        { key: "appearance", label: "外观", icon: Palette },
        { key: "font-manager", label: "字体管理", icon: Type },
      ],
    },
    {
      title: "AI",
      items: [
        {
          key: "model-providers",
          label: "模型提供商",
          icon: Boxes,
          children: modelProviders.map((provider) => ({
            key: `provider-${provider.provider}` as SettingsKey,
            label: provider.name,
          })),
        },
        { key: "co-reading", label: "AI 共读与 Nova", icon: BookOpenText },
        { key: "web-memory", label: "联网与记忆", icon: Globe },
        { key: "llama", label: "向量模型", icon: Database },
        { key: "tts", label: "语音朗读", icon: Volume2 },
      ],
    },
    {
      title: "数据",
      items: [
        { key: "data-privacy", label: "数据与隐私", icon: FolderCog },
        { key: "about", label: "关于", icon: Info },
      ],
    },
  ];

  const pageInfo: Partial<Record<SettingsKey, { title: string; description: string }>> = {
    appearance: {
      title: "外观",
      description: "界面的浅色 / 深色主题。阅读时的字体、字号、排版和背景色，在阅读页顶栏的「设置」里调整。",
    },
    "font-manager": { title: "字体管理", description: "导入和管理自定义字体，导入后可以在阅读设置里选用。" },
    "model-providers": {
      title: "模型提供商",
      description: "配置 AI 服务的地址和 Key。问答、共读、记忆提取都从这里的模型中选择。",
    },
    "co-reading": { title: "AI 共读与 Nova", description: "VCP Bridge 连接自检、共读模型说明和 Nova 形象。" },
    "web-memory": { title: "联网与记忆", description: "问答时的联网搜索，以及从对话中提取长期记忆。" },
    llama: { title: "向量模型", description: "本地向量模型，用于全书语义检索。" },
    tts: { title: "语音朗读", description: "朗读书籍时使用的语音模型。" },
    "data-privacy": { title: "数据与隐私", description: "应用数据目录、Obsidian 知识库和隐私选项。" },
    about: { title: "关于", description: "版本信息。" },
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      const section = (event as CustomEvent<string>).detail as SettingsKey;
      if (section) setActiveKey(section);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  const getProviderStatus = (providerId: string) => {
    const provider = modelProviders.find((p) => p.provider === providerId);
    return provider?.active ?? false;
  };

  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };

  const renderSettingsContent = () => {
    switch (activeKey) {
      case "general":
      case "appearance":
        return <GeneralSettings sections={["appearance"]} />;
      case "co-reading":
        return <CoReadingSettings />;
      case "web-memory":
        return <GeneralSettings sections={["web", "memory"]} />;
      case "data-privacy":
        return <GeneralSettings sections={["data", "obsidian", "privacy"]} />;
      case "about":
        return <GeneralSettings sections={["about"]} />;
      case "llama":
        return <LlamaSettings />;
      case "tts":
        return <TTSSettings />;
      case "model-providers":
        return (
          <ProvidersSettings onProviderSelect={(providerId) => setActiveKey(`provider-${providerId}` as SettingsKey)} />
        );
      case "font-manager":
        return <FontManager />;
      case "shortcuts":
        return <ShortcutsSettings />;
      default:
        if (activeKey.startsWith("provider-")) {
          const providerId = activeKey.replace("provider-", "");
          return <ProviderDetailSettings providerId={providerId} onBack={() => setActiveKey("model-providers")} />;
        }
        return <GeneralSettings sections={["appearance"]} />;
    }
  };

  const renderSidebarItem = (item: SettingsItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.key);
    const isActive = activeKey === item.key;

    return (
      <div key={item.key}>
        {hasChildren ? (
          <Collapsible open={isExpanded}>
            <button
              onClick={() => setActiveKey(item.key)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg p-1.5 py-1 text-left text-neutral-700 text-sm transition-colors focus:outline-0",
                level === 0 ? "" : "ml-4",
                isActive ? "bg-muted/80 dark:text-neutral-100" : "hover:bg-muted/80 dark:text-neutral-300",
              )}
            >
              <div className="flex items-center gap-2">
                {item.icon && <item.icon className="h-4 w-4" />}
                <span className="truncate text-sm">{item.label}</span>
              </div>
              <ChevronRight
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(item.key);
                }}
                className={cn("h-4 w-4 flex-shrink-0 transition-transform", isExpanded && "rotate-90")}
              />
            </button>
            <CollapsibleContent className="mt-1 space-y-1">
              {item.children?.map((child) => renderSidebarItem(child, level + 1))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <button
            onClick={() => setActiveKey(item.key)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg p-1.5 py-1 text-left text-neutral-700 text-sm transition-colors focus:outline-0",
              level === 0 ? "" : "ml-3 w-[91%]",
              isActive ? "bg-muted/80 dark:text-neutral-100" : "hover:bg-muted/80 dark:text-neutral-300",
            )}
          >
            {item.key.startsWith("provider-") ? (
              <ProviderIcons providerId={item.key.replace("provider-", "")} />
            ) : item.icon ? (
              <item.icon className="h-4 w-4" />
            ) : null}
            <span className="truncate text-sm">{item.label}</span>
            {item.key.startsWith("provider-") && (
              <div
                className={cn(
                  "mr-1 ml-auto h-2 w-2 flex-shrink-0 rounded-full",
                  getProviderStatus(item.key.replace("provider-", "")) ? "bg-green-500" : "bg-red-500",
                )}
              />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] min-h-[80vh] min-w-[800px] max-w-[800px] flex-col gap-0 overflow-y-auto p-0">
        <DialogHeader className="flex-shrink-0 border-neutral-200 border-b px-3 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <DialogTitle className="dark:text-neutral-100">设置</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 dark:bg-neutral-900">
          <div className="w-48 flex-shrink-0 overflow-y-auto border-neutral-200 border-r p-3 px-2 dark:border-neutral-800 dark:bg-neutral-900">
            <nav className="space-y-4">
              {settingsGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-1.5 pb-0.5 font-medium text-[11px] text-muted-foreground tracking-wide">
                    {group.title}
                  </div>
                  {group.items.map((item) => renderSidebarItem(item))}
                </div>
              ))}
            </nav>
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto dark:bg-neutral-900">
            {pageInfo[activeKey] && (
              <div className="px-4 pt-4">
                <h3 className="font-medium text-base dark:text-neutral-100">{pageInfo[activeKey]?.title}</h3>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{pageInfo[activeKey]?.description}</p>
              </div>
            )}
            {renderSettingsContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
