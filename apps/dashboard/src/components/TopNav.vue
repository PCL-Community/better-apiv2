<template>
  <mdui-top-app-bar scroll-behavior="elevate">
    <mdui-button-icon @click="toggleDrawer" class="lg:hidden">
      <mdui-icon-menu></mdui-icon-menu>
    </mdui-button-icon>
    <mdui-top-app-bar-title class="hidden lg:inline lg:ml-4">
      PCL CE 管理后台
    </mdui-top-app-bar-title>
    <mdui-top-app-bar-title class="block lg:hidden">
      管理后台
    </mdui-top-app-bar-title>
    <div style="flex-grow: 1"></div>
    <mdui-button-icon @click="toggleDark()" class="mr-2">
      <mdui-icon-brightness-4></mdui-icon-brightness-4>
    </mdui-button-icon>
    <mdui-dropdown v-if="authStore.isAuthenticated">
      <mdui-avatar slot="trigger" :src="authStore.user?.avatarUrl"></mdui-avatar>
      <mdui-menu>
        <mdui-menu-item disabled class="text-sm">
          目前登录的身份：{{ authStore.user?.login }}
        </mdui-menu-item>
        <mdui-divider></mdui-divider>
        <mdui-menu-item @click="handleLogout">
          <mdui-icon-logout slot="icon"></mdui-icon-logout>
          退出登录
        </mdui-menu-item>
      </mdui-menu>
    </mdui-dropdown>
  </mdui-top-app-bar>
</template>

<script setup lang="ts">
import { isClient, useDark, useToggle } from '@vueuse/core'
import { setTheme } from 'mdui/functions/setTheme.js'
import { useAuthStore } from '../stores/auth'
import { logout } from '../services/api'

import "@mdui/icons/menu"
import "@mdui/icons/brightness-4"
import "@mdui/icons/logout"

const authStore = useAuthStore()

const emit = defineEmits<{
  toggleDrawer: []
}>()

const isDark = useDark({
  onChanged: (isDark) => {
    if (typeof document !== "undefined") setTheme(isDark ? "dark" : "light");
  },
  disableTransition: false, 
});

const toggleDark = useToggle(isDark);

function toggleDrawer() {
  emit('toggleDrawer')
}

async function handleLogout() {
  await logout()
  if (isClient) {
    window.location.href = '/login'
  }
}
</script>
