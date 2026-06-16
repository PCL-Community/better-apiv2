<template>
  <div class="w-full min-h-screen flex items-center justify-center">
    <mdui-card class="w-full max-w-md mdui-prose">
      <div class="p-6">
        <h2 class="text-2xl font-bold text-center">Better PCL CE</h2>
        <p class="text-center">使用 GitHub 账号登录</p>

        <mdui-button
          variant="filled"
          full-width
          @click="handleLogin"
          :loading="loading"
          :disabled="loading"
        >
          <span class="icon i-mdi-github" slot="icon"></span>
          用 GitHub 登录
        </mdui-button>

        <p class="text-center text-sm text-gray-500">
          该应用仅供 PCL Community 核心成员使用
        </p>
      </div>
    </mdui-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { isClient } from "@vueuse/core";
import { useHead } from "@unhead/vue";

useHead({
  title: "登录",
});

const loading = ref(false);

async function handleLogin() {
  loading.value = true;
  try {
    if (isClient) {
      const apiBase =
        (import.meta.env.VITE_API_URL as string) || window.location.origin;
      const state = crypto.randomUUID();
      sessionStorage.setItem('oauth_state', state);

      setTimeout(() => {
        window.location.href = `${apiBase.replace(/\/$/, "")}/auth/github/login?state=${state}`;
      }, 1000)
    }
  } catch (error) {
    console.error("登录失败:", error);
  } 
}
</script>
