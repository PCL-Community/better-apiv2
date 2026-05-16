<template>
  <div class="space-y-4 mdui-prose">
    <div class="flex justify-between items-start">
      <h1 class="text-3xl font-bold">公告管理</h1>
      <mdui-button variant="filled" @click="openCreateDialog">
        <mdui-icon-add slot="icon"></mdui-icon-add>
        新增公告
      </mdui-button>
    </div>

    <div class="text-center py-12" v-if="isAnnouncementsLoading">
      <mdui-circular-progress indeterminate></mdui-circular-progress>
      <p class="text-sm text-gray-500">别着急，坐和放宽<br />正在加载公告</p>
    </div>

    <div class="text-center py-12" v-else-if="announcements.length === 0">
      <mdui-icon-comments-disabled--outlined class="w-16 h-16"></mdui-icon-comments-disabled--outlined>
      <p class="text-sm text-gray-500">没有公告</p>
    </div>

    <div v-else class="space-y-4">
      <mdui-card
        v-for="announcement in paginatedAnnouncements"
        :key="announcement.id"
        class="p-6 w-full space-y-0"
        @click="editAnnouncement(announcement)"
        clickable
      >
        <div class="flex-1 mb-4">
          <h3 class="font-semibold">{{ announcement.title }}</h3>
          <p>{{ announcement.details }}</p>
          <p class="text-sm text-gray-600">
            {{ formatDate(announcement.date) }}
          </p>
        </div>
        <mdui-divider></mdui-divider>
        <mdui-button
          variant="text"
          @click.stop="comfirmDeletion(announcement)"
          class="!mt-6"
        >
          删除
          <mdui-icon-delete slot="icon"></mdui-icon-delete>
        </mdui-button>
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
  createAnnouncement,
  deleteAnnouncement as deleteAnnouncementApi,
  getAnnouncements,
  updateAnnouncement,
} from "../services/api";

import "@mdui/icons/add";
import "@mdui/icons/delete";
import "@mdui/icons/comments-disabled--outlined";
import { useHead } from "@unhead/vue";

useHead({
  title: "公告管理",
});

type AnnouncementButtonResponse = {
  text: string;
  exec: string;
  argument: string;
};

type AnnouncementSkipResponse = {
  min?: string | null;
  max?: string | null;
  notBefore?: string | null;
  notAfter?: string | null;
};

type AnnouncementItem = {
  id: string;
  title: string;
  details: string;
  priority: number;
  level: number;
  date: string;
  skip?: AnnouncementSkipResponse | null;
  buttons: AnnouncementButtonResponse[];
};

const announcements = ref<AnnouncementItem[]>([]);

const isAnnouncementsLoading = ref(true);

const pageSize = 8;
const currentPage = ref(1);

const totalPages = computed(() => {
  return Math.ceil(announcements.value.length / pageSize);
});

const paginatedAnnouncements = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return announcements.value.slice(start, start + pageSize);
});

async function loadAnnouncements() {
  isAnnouncementsLoading.value = true;
  try {
    const response = (await getAnnouncements()) as
      | AnnouncementItem[]
      | undefined;
    announcements.value = response ?? [];
  } catch (error) {
    console.error("加载公告失败:", error);
    announcements.value = [];
    snackbar({
      message: "加载公告失败",
    });
  } finally {
    isAnnouncementsLoading.value = false;
    syncCurrentPage();
  }
}

onMounted(() => {
  void loadAnnouncements();
});

function formatDate(date: string) {
  return new Date(date.replace(" ", "T")).toLocaleDateString("zh-CN");
}

function openCreateDialog() {
  openAnnouncementDialog();
}

function editAnnouncement(announcement: AnnouncementItem) {
  openAnnouncementDialog(announcement);
}

function normalizeButton(
  button?: AnnouncementButtonResponse | null,
): AnnouncementButtonResponse | null {
  if (!button) return null;

  return {
    text: button.text ?? "",
    exec: button.exec ?? "OpenWebSite",
    argument: button.argument ?? "",
  };
}

function normalizeSkip(skip?: AnnouncementSkipResponse | null) {
  if (!skip) {
    return null;
  }

  return {
    min: skip.min ?? "",
    max: skip.max ?? "",
    notBefore: skip.notBefore ?? "",
    notAfter: skip.notAfter ?? "",
  };
}

function createAnnouncementDialogBody(initial?: AnnouncementItem) {
  const body = document.createElement("div");
  body.className = "space-y-4 py-4";

  body.innerHTML = `
    <mdui-text-field id="announcement-title" label="标题" required></mdui-text-field>
    <mdui-text-field id="announcement-details" label="详情" required rows="4"></mdui-text-field>

    <div class="grid grid-cols-2 gap-4">
      <mdui-text-field id="announcement-priority" label="优先级" type="number"></mdui-text-field>
      <mdui-text-field id="announcement-level" label="等级" type="number"></mdui-text-field>
    </div>

    <div class="mt-2 space-y-4">
      <label class="block text-sm font-medium mb-1">跳过条件（可选）</label>
      <div class="grid grid-cols-2 gap-4">
        <mdui-text-field id="announcement-skip-min" label="最小版本"></mdui-text-field>
        <mdui-text-field id="announcement-skip-max" label="最大版本"></mdui-text-field>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <mdui-text-field id="announcement-skip-not-before" label="开始时间"></mdui-text-field>
        <mdui-text-field id="announcement-skip-not-after" label="结束时间"></mdui-text-field>
      </div>
    </div>

    <div class="mt-2 space-y-4">
      <label class="block text-sm font-medium mb-1">按钮 1（可选）</label>
      <mdui-text-field id="announcement-button1-text" label="按钮文字"></mdui-text-field>
      <mdui-text-field id="announcement-button1-exec" label="执行动作"></mdui-text-field>
      <mdui-text-field id="announcement-button1-argument" label="参数"></mdui-text-field>
    </div>

    <div class="mt-2 space-y-4">
      <label class="block text-sm font-medium mb-1">按钮 2（可选）</label>
      <mdui-text-field id="announcement-button2-text" label="按钮文字"></mdui-text-field>
      <mdui-text-field id="announcement-button2-exec" label="执行动作"></mdui-text-field>
      <mdui-text-field id="announcement-button2-argument" label="参数"></mdui-text-field>
    </div>
  `;

  const titleField = body.querySelector("#announcement-title") as any;
  const detailsField = body.querySelector("#announcement-details") as any;
  const priorityField = body.querySelector("#announcement-priority") as any;
  const levelField = body.querySelector("#announcement-level") as any;
  const skipMinField = body.querySelector("#announcement-skip-min") as any;
  const skipMaxField = body.querySelector("#announcement-skip-max") as any;
  const skipNotBeforeField = body.querySelector(
    "#announcement-skip-not-before",
  ) as any;
  const skipNotAfterField = body.querySelector(
    "#announcement-skip-not-after",
  ) as any;
  const button1TextField = body.querySelector(
    "#announcement-button1-text",
  ) as any;
  const button1ExecField = body.querySelector(
    "#announcement-button1-exec",
  ) as any;
  const button1ArgumentField = body.querySelector(
    "#announcement-button1-argument",
  ) as any;
  const button2TextField = body.querySelector(
    "#announcement-button2-text",
  ) as any;
  const button2ExecField = body.querySelector(
    "#announcement-button2-exec",
  ) as any;
  const button2ArgumentField = body.querySelector(
    "#announcement-button2-argument",
  ) as any;

  titleField.value = initial?.title ?? "";
  detailsField.value = initial?.details ?? "";
  priorityField.value = String(initial?.priority ?? 0);
  levelField.value = String(initial?.level ?? 0);

  const initialSkip = normalizeSkip(initial?.skip);

  skipMinField.value = initialSkip?.min ?? "";
  skipMaxField.value = initialSkip?.max ?? "";
  skipNotBeforeField.value = initialSkip?.notBefore ?? "";
  skipNotAfterField.value = initialSkip?.notAfter ?? "";

  const initialButton1 = normalizeButton(initial?.buttons?.[0]);
  const initialButton2 = normalizeButton(initial?.buttons?.[1]);

  button1TextField.value = initialButton1?.text ?? "";
  button1ExecField.value = initialButton1?.exec ?? "";
  button1ArgumentField.value = initialButton1?.argument ?? "";

  button2TextField.value = initialButton2?.text ?? "";
  button2ExecField.value = initialButton2?.exec ?? "";
  button2ArgumentField.value = initialButton2?.argument ?? "";

  return {
    body,
    titleField,
    detailsField,
    priorityField,
    levelField,
    skipMinField,
    skipMaxField,
    skipNotBeforeField,
    skipNotAfterField,
    button1TextField,
    button1ExecField,
    button1ArgumentField,
    button2TextField,
    button2ExecField,
    button2ArgumentField,
  };
}

function readButton(
  textField: any,
  execField: any,
  argumentField: any,
): AnnouncementButtonResponse | null {
  const text = String(textField.value ?? "").trim();
  const exec = String(execField.value ?? "").trim();
  const argument = String(argumentField.value ?? "").trim();

  if (!text && !exec && !argument) {
    return null;
  }

  return {
    text,
    exec: exec || "OpenWebSite",
    argument,
  };
}

function readSkip(form: ReturnType<typeof createAnnouncementDialogBody>) {
  const min = String(form.skipMinField.value ?? "").trim();
  const max = String(form.skipMaxField.value ?? "").trim();
  const notBefore = String(form.skipNotBeforeField.value ?? "").trim();
  const notAfter = String(form.skipNotAfterField.value ?? "").trim();

  if (!min && !max && !notBefore && !notAfter) {
    return null;
  }

  return {
    min: min || null,
    max: max || null,
    notBefore: notBefore || null,
    notAfter: notAfter || null,
  };
}

function openAnnouncementDialog(initial?: AnnouncementItem) {
  const form = createAnnouncementDialogBody(initial);

  dialog({
    headline: initial?.id ? "编辑公告" : "创建公告",
    body: form.body,
    closeOnEsc: true,
    closeOnOverlayClick: true,
    actions: [
      {
        text: "取消",
      },
      {
        text: "保存",
        onClick: () => {
          const title = String(form.titleField.value ?? "").trim();
          const details = String(form.detailsField.value ?? "").trim();
          const priority = Number(form.priorityField.value ?? 0);
          const level = Number(form.levelField.value ?? 0);

          if (!title || !details) {
            return false;
          }

          const button1 = readButton(
            form.button1TextField,
            form.button1ExecField,
            form.button1ArgumentField,
          );
          const button2 = readButton(
            form.button2TextField,
            form.button2ExecField,
            form.button2ArgumentField,
          );
          const buttons = [button1, button2].filter(
            (button): button is AnnouncementButtonResponse => Boolean(button),
          );
          const payload = {
            title,
            details,
            priority: Number.isFinite(priority) ? priority : 0,
            level: Number.isFinite(level) ? level : 0,
            date: initial?.date ? new Date(initial.date) : new Date(),
            skip: readSkip(form),
            buttons,
          };

          return (async () => {
            if (initial?.id) {
              await updateAnnouncement(initial.id, payload);
              snackbar({
                message: "公告更新成功",
              });
            } else {
              await createAnnouncement(payload);
              snackbar({
                message: "公告创建成功",
              });
            }

            await loadAnnouncements();
          })().catch((error) => {
            console.error("保存失败:", error);
            snackbar({
              message: "保存公告失败",
            });
            throw error;
          });
        },
      },
    ],
  });
}

async function deleteAnnouncement(id: string) {
  try {
    await deleteAnnouncementApi(id);
    announcements.value = announcements.value.filter((a) => a.id !== id);
    syncCurrentPage();
    snackbar({
      message: "删除公告成功",
    });
  } catch (error) {
    console.error("删除失败:", error);
    snackbar({
      message: "删除公告失败",
    });
  }
}

async function comfirmDeletion(announcement: AnnouncementItem) {
  confirm({
    headline: "确认删除",
    description: `确定要删除公告 "${announcement.title}" 吗？此操作无法撤销。`,
    closeOnEsc: true,
    closeOnOverlayClick: true,
    confirmText: "删除",
    cancelText: "取消",
    onConfirm: () => {
      return deleteAnnouncement(announcement.id);
    },
  });
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
</script>
