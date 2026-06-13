<template>
  <div class="min-h-screen flex flex-col bg-[var(--mdui-color-surface)]">
    <TopNav @toggle-drawer="sideNav?.toggleDrawer()" />
    <SideNav ref="sideNav" />
    <main class="flex-1 w-full">
      <div class="p-4 lg:p-8 max-w-230 mx-auto mb-26">
        <router-view />
      </div>
      <BackToTop />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TopNav from '../components/TopNav.vue'
import SideNav from '../components/SideNav.vue'
import BackToTop from '../components/BackToTop.vue'

const sideNav = ref<InstanceType<typeof SideNav>>()
</script>
