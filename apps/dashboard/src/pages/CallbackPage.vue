<template>
  <div class="w-full min-h-screen flex items-center justify-center">
    <mdui-card class="w-full max-w-md p-6 mdui-prose">
      <div v-if="loading" class="flex flex-col items-center">
        <mdui-circular-progress indeterminate></mdui-circular-progress>
        <p class="text-sm text-gray-500">正在完成 GitHub 登录...</p>
      </div>

      <div v-else-if="error" class="text-center space-y-6">
        <div class="space-y-2 mdui-prose">
          <h2>登录失败</h2>
          <p>{{ errorMessage }}</p>
        </div>

        <mdui-button variant="filled" full-width @click="goToLogin">
          返回登录页
        </mdui-button>
      </div>
    </mdui-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api, getAuthRequestOptions } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { isClient } from "@vueuse/core";
import { useHead } from "@unhead/vue";

useHead({
  title: "登录",
});

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref(false);
const errorMessage = ref("在登录过程中发生了错误。");

const code = computed(() => {
  const value = route.query.code;
  return typeof value === "string" ? value : "";
});

const state = computed(() => {
  const value = route.query.state;
  return typeof value === "string" ? value : "";
});

onMounted(async () => {
  try {
    if (!code.value) {
      error.value = true;
      errorMessage.value = "缺少 GitHub OAuth code。";
      return;
    }

    if (isClient) {
      const savedState = sessionStorage.getItem("oauth_state");
      sessionStorage.removeItem("oauth_state"); // 使用后作废

      if (!savedState || savedState !== state.value) {
        error.value = true;
        errorMessage.value = "请求校验失败，请重新登录。";
        return;
      }
    }

    const response = await api.auth.github.callback.get({
      query: {
        code: code.value,
        ...(state.value ? { state: state.value } : {}),
      },
    });

    if (response.error || !response.data) {
      error.value = true;
      errorMessage.value = "GitHub OAuth 回调失败。";
      return;
    }

    const payload = response.data;

    if (!payload.success || !payload.token || !payload.user) {
      error.value = true;
      errorMessage.value = payload.error || "GitHub OAuth 回调返回了无效结果。";
      return;
    }

    authStore.setToken(payload.token);

    const meResponse = await api.admin.me.get(
      getAuthRequestOptions(payload.token),
    );

    if (
      meResponse.error ||
      !meResponse.data?.success ||
      !meResponse.data.user
    ) {
      authStore.setUser(payload.user);
    } else {
      authStore.setUser(meResponse.data.user);
    }

    await router.replace("/");
  } catch (err) {
    console.error("OAuth 回调失败:", err);
    error.value = true;
    errorMessage.value =
      err instanceof Error ? err.message : "GitHub OAuth 登录失败。";
  } finally {
    loading.value = false;
  }
});

function goToLogin() {
  router.replace("/login");
}
</script>
