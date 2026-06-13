<template>
  <div class="space-y-4 mdui-prose">
    <div class="flex flex-wrap justify-between items-start gap-4">
      <h1 class="text-3xl font-bold">更新管理</h1>
      <div class="flex flex-wrap items-end gap-3">
        <mdui-button variant="tonal" @click="openUploadDialog">
          <mdui-icon-upload slot="icon"></mdui-icon-upload>
          上传新版本
        </mdui-button>
        <mdui-button variant="filled" @click="openBatchDialog">
          <mdui-icon-cloud-upload slot="icon"></mdui-icon-cloud-upload>
          批量发版
        </mdui-button>
      </div>
    </div>

    <div class="flex flex-nowrap gap-2 overflow-x-auto pb-2">
      <mdui-chip
        v-for="opt in channelOptions"
        :key="opt.value"
        selectable
        variant="filter"
        @click="selectChannel(opt.value)"
      >
        {{ opt.label }}
      </mdui-chip>
    </div>

    <div class="text-center py-12" v-if="isUpdatesLoading">
      <mdui-circular-progress indeterminate></mdui-circular-progress>
      <p class="text-sm text-gray-500">
        别着急，坐和放宽<br />正在加载更新列表
      </p>
    </div>

    <div class="text-center py-12" v-else-if="filteredUpdates.length === 0">
      <mdui-icon-update-disabled class="w-16 h-16"></mdui-icon-update-disabled>
      <p class="text-sm text-gray-500">没有已发布的更新</p>
    </div>

    <div v-else class="space-y-4">
      <mdui-card
        v-for="update in paginatedUpdates"
        :key="update.id"
        class="p-6 w-full space-y-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-start gap-2">
              <h3 class="text-md font-semibold">{{ update.versionName }}</h3>
              <span class="px-2 text-md text-gray-400">
                {{ getChannelLabel(update.channel) }}
              </span>
            </div>
            <p class="text-sm text-gray-600 break-all">
              文件名: {{ update.fileName }} | 版本号: {{ update.versionCode }} |
              发布时间: {{ formatDate(update.updateTime) }}
            </p>
            <p class="text-sm text-gray-600 break-all">
              SHA256: {{ update.sha256 || "未填写" }}
            </p>
            <p class="text-sm text-gray-600 break-all">
              运行要求: .NET {{ update.required.dotnet }} | Windows OS 内部版本
              {{ update.required.windows }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <mdui-button variant="outlined" @click="openEditDialog(update)">
              <mdui-icon-edit slot="icon"></mdui-icon-edit>
              修改
            </mdui-button>
            <mdui-button variant="text" @click="confirmDeleteUpdate(update)">
              <mdui-icon-delete slot="icon"></mdui-icon-delete>
              删除
            </mdui-button>
          </div>
        </div>
        <mdui-divider></mdui-divider>
        <mdui-list>
          <mdui-collapse>
            <mdui-collapse-item>
              <mdui-list-item slot="header" rounded>
                此版本的更新日志
                <mdui-icon-tips-and-updates
                  slot="icon"
                ></mdui-icon-tips-and-updates>
                <mdui-icon-expand-more slot="end-icon"></mdui-icon-expand-more>
              </mdui-list-item>
              <div
                class="mt-6"
                v-html="md.render(update.changelog) || '暂无更新日志'"
              ></div>
            </mdui-collapse-item>
          </mdui-collapse>
        </mdui-list>
      </mdui-card>

      <div
        v-if="totalPages > 1"
        class="flex flex-wrap items-center justify-between gap-3 pt-2"
      >
        <p class="text-sm text-gray-500">
          第 {{ currentPage }} / {{ totalPages }} 页，每页 {{ pageSize }} 个
        </p>
        <div class="flex flex-wrap gap-2">
          <mdui-button
            variant="outlined"
            :disabled="currentPage === 1"
            @click="goToPreviousPage"
          >
            上一页
          </mdui-button>
          <mdui-button
            variant="outlined"
            :disabled="currentPage === totalPages"
            @click="goToNextPage"
          >
            下一页
          </mdui-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { dialog } from "mdui/functions/dialog.js";
import { confirm } from "mdui/functions/confirm.js";
import { snackbar } from "mdui";
import {
  deleteUpdate,
  getUpdates,
  updateUpdate,
  uploadUpdate,
  batchUploadUpdates,
} from "../services/api";
import markdownIt from "markdown-it";

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

useHead({
  title: "更新管理",
});

import "@mdui/icons/upload";
import "@mdui/icons/cloud-upload";
import "@mdui/icons/update-disabled";
import "@mdui/icons/tips-and-updates";
import "@mdui/icons/expand-more";
import "@mdui/icons/edit";
import "@mdui/icons/delete";
import { useHead } from "@unhead/vue";

type UpdateChannel = "frarm64" | "frx64" | "srarm64" | "srx64";

type UpdateRequirements = {
  dotnet: number;
  windows: string;
};

type UpdateItem = {
  id: string;
  fileName: string;
  required: UpdateRequirements;
  channel: UpdateChannel;
  versionName: string;
  versionCode: number;
  updateTime: string;
  downloads: string[];
  patches: string[];
  sha256: string;
  changelog: string;
};

type UpdateAssetResponse = {
  id?: string;
  file_name?: string;
  required?: {
    dotnet?: number;
    windows?: string;
  };
  version?: {
    channel?: string;
    name?: string;
    code?: number;
  };
  upd_time?: string;
  updateTime?: string;
  downloads?: string[];
  patches?: string[];
  sha256?: string;
  changelog?: string;
};

const pageSize = 8;
const channelOptions: Array<{ value: UpdateChannel; label: string }> = [
  { value: "frarm64", label: "FR ARM64" },
  { value: "frx64", label: "FR X64" },
  { value: "srarm64", label: "SR ARM64" },
  { value: "srx64", label: "SR X64" },
];

const updates = ref<UpdateItem[]>([]);
const isUpdatesLoading = ref(true);

const selectedChannels = ref<UpdateChannel[]>([]);

const currentPage = ref(1);
const defaultRequirements: UpdateRequirements = {
  dotnet: 8,
  windows: "10.0.19045",
};

const filteredUpdates = computed(() => {
  if (selectedChannels.value.length === 0) {
    return updates.value;
  }

  return updates.value.filter((update) =>
    selectedChannels.value.includes(update.channel),
  );
});

const totalPages = computed(() => {
  return Math.ceil(filteredUpdates.value.length / pageSize);
});

const paginatedUpdates = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredUpdates.value.slice(start, start + pageSize);
});

onMounted(() => {
  void loadUpdates();
});

async function loadUpdates() {
  isUpdatesLoading.value = true;

  try {
    const response = (await getUpdates()) as
      | { assets?: UpdateAssetResponse[] }
      | undefined;
    updates.value = (response?.assets ?? []).map(normalizeUpdateAsset);
    syncCurrentPage();
  } catch (error) {
    console.error("加载更新失败:", error);
    updates.value = [];
    snackbar({ message: "加载更新失败" });
  } finally {
    isUpdatesLoading.value = false;
  }
}

function normalizeUpdateAsset(asset: UpdateAssetResponse): UpdateItem {
  const version = asset.version ?? {};
  const channel = normalizeChannel(version.channel);
  const required = asset.required ?? {};

  return {
    id: asset.id ?? crypto.randomUUID(),
    fileName: asset.file_name ?? "",
    required: {
      dotnet: Number.isInteger(required.dotnet)
        ? (required.dotnet as number)
        : defaultRequirements.dotnet,
      windows:
        String(required.windows ?? "").trim() || defaultRequirements.windows,
    },
    channel,
    versionName: version.name ?? "",
    versionCode: version.code ?? 0,
    updateTime: asset.upd_time ?? asset.updateTime ?? new Date().toISOString(),
    downloads: Array.isArray(asset.downloads) ? asset.downloads : [],
    patches: Array.isArray(asset.patches) ? asset.patches : [],
    sha256: asset.sha256 ?? "",
    changelog: asset.changelog ?? "",
  };
}

function normalizeChannel(value?: string): UpdateChannel {
  const lower = String(value ?? "frarm64").toLowerCase();
  if (lower === "frx64" || lower === "srarm64" || lower === "srx64") {
    return lower;
  }

  return "frarm64";
}

function getChannelLabel(channel: UpdateChannel) {
  const option = channelOptions.find((item) => item.value === channel);
  return option?.label ?? channel;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("zh-CN");
}

function selectChannel(next: UpdateChannel) {
  const idx = selectedChannels.value.indexOf(next);
  if (idx >= 0) {
    selectedChannels.value.splice(idx, 1);
  } else {
    selectedChannels.value.push(next);
  }
  currentPage.value = 1;
  syncCurrentPage();
}

function goToPreviousPage() {
  if (currentPage.value > 1) {
    currentPage.value -= 1;
  }
}

function goToNextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1;
  }
}

function syncCurrentPage() {
  const safeTotalPages = totalPages.value;
  if (safeTotalPages <= 0) {
    currentPage.value = 1;
    return;
  }

  if (currentPage.value > safeTotalPages) {
    currentPage.value = safeTotalPages;
  }
}

function openUploadDialog() {
  openUpdateDialog();
}

function openEditDialog(update: UpdateItem) {
  openUpdateDialog(update);
}

function openUpdateDialog(initial?: UpdateItem) {
  const body = document.createElement("div");
  body.className = "space-y-4 py-4";
  body.innerHTML = initial
    ? `
      <mdui-text-field required id="update-file-name" label="文件名" readonly></mdui-text-field>
      <mdui-text-field required id="update-version-name" label="版本名称" placeholder="v2.14.5-beta.1.2147483647"></mdui-text-field>
      <mdui-text-field required id="update-version-code" type="number" label="版本号" placeholder="510"></mdui-text-field>
      <mdui-select required id="update-channel" label="渠道">
        <mdui-menu-item value="frarm64">Beta / 测试版 ARM64</mdui-menu-item>
        <mdui-menu-item value="frx64">Beta / 测试版 X64</mdui-menu-item>
        <mdui-menu-item value="srarm64">Release / 正式版 ARM64</mdui-menu-item>
        <mdui-menu-item value="srx64">Release / 正式版 X64</mdui-menu-item>
      </mdui-select>
      <mdui-text-field required id="update-changelog" label="更新日志" helper="支持 Markdown" rows="4"></mdui-text-field>
      <div class="space-y-2">
        <p class="text-sm font-medium">运行要求</p>
        <mdui-text-field required id="update-required-dotnet" type="number" label=".NET 版本" placeholder="8"></mdui-text-field>
        <mdui-text-field required id="update-required-windows" label="Windows OS 内部版本" placeholder="17763"></mdui-text-field>
      </div>
      <mdui-text-field id="update-source-group" label="下载源组" placeholder="cdn" helper="可选，用于多CDN镜像分发"></mdui-text-field>
    `
    : `
      <div class="space-y-2">
        <label class="block text-sm font-medium">EXE 文件</label>
        <input
          id="update-file"
          type="file"
          accept=".exe,.zip,application/octet-stream"
          class="block w-full text-sm"
        />
        <p class="text-xs">请选择完整 EXE 文件。</p>
      </div>
      <mdui-text-field required id="update-file-name" label="文件名" placeholder="PCL2_CE_Beta_x64.exe"></mdui-text-field>
      <mdui-text-field required id="update-version-name" label="版本名称" placeholder="2.14.5-beta.1.2147483647"></mdui-text-field>
      <mdui-text-field required id="update-version-code" type="number" label="版本号" placeholder="510"></mdui-text-field>
      <mdui-select required id="update-channel" label="渠道">
        <mdui-menu-item value="frarm64">Beta / 测试版 ARM64</mdui-menu-item>
        <mdui-menu-item value="frx64">Beta / 测试版 X64</mdui-menu-item>
        <mdui-menu-item value="srarm64">Release / 正式版 ARM64</mdui-menu-item>
        <mdui-menu-item value="srx64">Release / 正式版 X64</mdui-menu-item>
      </mdui-select>
      <mdui-text-field required id="update-changelog" label="更新日志" helper="支持 Markdown" rows="4"></mdui-text-field>
      <div class="space-y-2">
        <p class="text-sm font-medium">运行要求</p>
        <mdui-text-field required id="update-required-dotnet" type="number" label=".NET 版本" placeholder="8"></mdui-text-field>
        <mdui-text-field required id="update-required-windows" label="Windows OS 内部版本" placeholder="17763"></mdui-text-field>
      </div>
      <mdui-text-field id="update-source-group" label="下载源组" placeholder="cdn" helper="可选，用于多 CDN 镜像分发"></mdui-text-field>
    `;

  const fileInput = body.querySelector(
    "#update-file",
  ) as HTMLInputElement | null;
  const fileNameField = body.querySelector("#update-file-name") as any;
  const versionNameField = body.querySelector("#update-version-name") as any;
  const versionCodeField = body.querySelector("#update-version-code") as any;
  const channelField = body.querySelector("#update-channel") as any;
  const changelogField = body.querySelector("#update-changelog") as any;
  const requiredDotnetField = body.querySelector(
    "#update-required-dotnet",
  ) as any;
  const requiredWindowsField = body.querySelector(
    "#update-required-windows",
  ) as any;
  const sourceGroupField = body.querySelector("#update-source-group") as any;
  let selectedFile: File | null = null;

  fileNameField.value = initial?.fileName ?? "";
  versionNameField.value = initial?.versionName ?? "";
  versionCodeField.value = initial?.versionCode
    ? String(initial.versionCode)
    : "";
  channelField.value = initial?.channel ?? "frarm64";
  changelogField.value = initial?.changelog ?? "";
  requiredDotnetField.value = String(
    (initial?.required ?? defaultRequirements).dotnet,
  );
  requiredWindowsField.value = (
    initial?.required ?? defaultRequirements
  ).windows;
  if (sourceGroupField)
    sourceGroupField.value = (initial as any)?.sourceGroup ?? "";

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      selectedFile = fileInput.files?.[0] ?? null;
      if (selectedFile && !String(fileNameField.value ?? "").trim()) {
        fileNameField.value = selectedFile.name;
      }
    });
  }

  fileNameField.readonly = Boolean(initial);

  dialog({
    headline: initial ? "修改更新" : "上传新版本",
    body,
    closeOnEsc: true,
    closeOnOverlayClick: true,
    actions: [
      {
        text: "取消",
      },
      {
        text: initial ? "保存" : "上传",
        onClick: () => {
          const fileName = String(fileNameField.value ?? "").trim();
          const versionName = String(versionNameField.value ?? "").trim();
          const versionCode = Number(versionCodeField.value);
          const channel = normalizeChannel(
            String(channelField.value ?? "frarm64"),
          );
          const changelog = String(changelogField.value ?? "").trim();
          const requiredDotnet = Number(requiredDotnetField.value);
          const requiredWindows = String(
            requiredWindowsField.value ?? "",
          ).trim();
          const sourceGroup = sourceGroupField
            ? String(sourceGroupField.value ?? "").trim()
            : "";

          if (
            !fileName ||
            !versionName ||
            Number.isNaN(versionCode) ||
            !changelog ||
            !Number.isInteger(requiredDotnet) ||
            requiredDotnet <= 0 ||
            !requiredWindows
          ) {
            return false;
          }

          if (!initial && !selectedFile) {
            return false;
          }

          return (async () => {
            if (initial) {
              await updateUpdate(initial.id, {
                file_name: fileName,
                channel,
                version_name: versionName,
                version_code: versionCode,
                changelog,
                source_group: sourceGroup || undefined,
                required: {
                  dotnet: requiredDotnet,
                  windows: requiredWindows,
                },
              });
            } else {
              await uploadUpdate({
                file: selectedFile as File,
                file_name: fileName || selectedFile!.name,
                version: {
                  channel,
                  name: versionName,
                  code: versionCode,
                },
                changelog,
                source_group: sourceGroup || undefined,
                required: {
                  dotnet: requiredDotnet,
                  windows: requiredWindows,
                },
              });
            }

            await loadUpdates();
            snackbar({
              message: initial ? "更新已保存" : "更新已上传",
            });
          })().catch((error) => {
            console.error(initial ? "修改失败:" : "上传失败:", error);
            snackbar({
              message: initial ? "修改更新失败" : "上传更新失败",
            });
            throw error;
          });
        },
      },
    ],
  });
}

function openBatchDialog() {
  const body = document.createElement("div");
  body.className = "space-y-4 py-4";

  const channelConfigs: {
    channel: UpdateChannel;
    label: string;
    keyword: string;
  }[] = [
    { channel: "frarm64", label: "Beta ARM64 (frarm64)", keyword: "ARM64" },
    { channel: "frx64", label: "Beta X64 (frx64)", keyword: "x64" },
    { channel: "srarm64", label: "Release ARM64 (srarm64)", keyword: "ARM64" },
    { channel: "srx64", label: "Release X64 (srx64)", keyword: "x64" },
  ];

  body.innerHTML = `
    <p class="text-sm">一次上传多个文件，每个文件必须放入对应通道的输入框。</p>
    <mdui-divider></mdui-divider>
    ${channelConfigs
      .map(
        (cfg) => `
      <div class="space-y-1">
        <label class="block text-sm font-medium">${cfg.label}</label>
        <input
          id="batch-file-${cfg.channel}"
          type="file"
          accept=".exe,.zip,application/octet-stream"
          class="block w-full text-sm"
        />
      </div>
    `,
      )
      .join("")}
    <mdui-divider></mdui-divider>
    <mdui-text-field required id="batch-version-name" label="版本名称" placeholder="2.14.5-beta.1.2147483647"></mdui-text-field>
    <mdui-text-field required id="batch-version-code" type="number" label="版本号" placeholder="510"></mdui-text-field>
    <mdui-text-field required id="batch-changelog" label="更新日志" helper="支持 Markdown" rows="4"></mdui-text-field>
    <div class="space-y-2">
      <p class="text-sm font-medium">运行要求</p>
      <mdui-text-field required id="batch-required-dotnet" type="number" label=".NET 版本" placeholder="8"></mdui-text-field>
      <mdui-text-field required id="batch-required-windows" label="Windows 版本" placeholder="10.0.19045"></mdui-text-field>
    </div>
    <mdui-text-field id="batch-source-group" label="下载源组" placeholder="cdn" helper="可选，用于多CDN镜像分发"></mdui-text-field>
  `;

  const versionNameField = body.querySelector("#batch-version-name") as any;
  const versionCodeField = body.querySelector("#batch-version-code") as any;
  const changelogField = body.querySelector("#batch-changelog") as any;
  const requiredDotnetField = body.querySelector(
    "#batch-required-dotnet",
  ) as any;
  const requiredWindowsField = body.querySelector(
    "#batch-required-windows",
  ) as any;
  const sourceGroupField = body.querySelector("#batch-source-group") as any;

  requiredDotnetField.value = String(defaultRequirements.dotnet);
  requiredWindowsField.value = defaultRequirements.windows;

  const fileInputs: HTMLInputElement[] = channelConfigs.map(
    (cfg) =>
      body.querySelector(`#batch-file-${cfg.channel}`) as HTMLInputElement,
  );

  dialog({
    headline: "批量发版",
    body,
    closeOnEsc: true,
    closeOnOverlayClick: true,
    actions: [
      {
        text: "取消",
      },
      {
        text: "上传",
        onClick: () => {
          const versionName = String(versionNameField.value ?? "").trim();
          const versionCode = Number(versionCodeField.value);
          const changelog = String(changelogField.value ?? "").trim();
          const requiredDotnet = Number(requiredDotnetField.value);
          const requiredWindows = String(
            requiredWindowsField.value ?? "",
          ).trim();
          const sourceGroup = String(sourceGroupField.value ?? "").trim();

          if (
            !versionName ||
            Number.isNaN(versionCode) ||
            !changelog ||
            !Number.isInteger(requiredDotnet) ||
            requiredDotnet <= 0 ||
            !requiredWindows
          ) {
            return false;
          }

          const fileChannels: { file: File; channel: string }[] = [];
          for (let i = 0; i < fileInputs.length; i++) {
            const input = fileInputs[i];
            const channel = channelConfigs[i]!.channel;
            if (input?.files?.[0]) {
              fileChannels.push({ file: input.files[0], channel });
            }
          }

          if (fileChannels.length === 0) {
            return false;
          }

          return (async () => {
            await batchUploadUpdates({
              fileChannels,
              version_name: versionName,
              version_code: versionCode,
              changelog,
              source_group: sourceGroup || undefined,
              required: {
                dotnet: requiredDotnet,
                windows: requiredWindows,
              },
            });

            await loadUpdates();
            snackbar({
              message: `批量发版完成，共上传 ${fileChannels.length} 个文件`,
            });
          })().catch((error) => {
            console.error("批量发版失败:", error);
            snackbar({
              message: "批量发版失败",
            });
            throw error;
          });
        },
      },
    ],
  });
}

function confirmDeleteUpdate(update: UpdateItem) {
  confirm({
    headline: "删除更新",
    description: `确定要删除 ${update.channel} 通道的更新 "${update.versionName}" 吗？此操作无法撤销。`,
    closeOnEsc: true,
    closeOnOverlayClick: true,
    onConfirm: async () => {
      try {
        await deleteUpdate(update.id);
        await loadUpdates();
      } catch (error) {
        console.error("删除更新失败:", error);
        snackbar({ message: "删除更新失败" });
        throw error;
      }
    },
    confirmText: "删除",
    cancelText: "取消",
  });
}
</script>
