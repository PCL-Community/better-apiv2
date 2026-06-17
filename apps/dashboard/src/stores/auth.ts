import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AdminUser, User } from '../types'
import { checkAuth as checkAuthApi } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | AdminUser | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)
  const initialized = ref(false)
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => !!token.value || !!user.value)
  const isAdmin = computed(() => Boolean(user.value?.expiresAt))

  function setUser(newUser: User | AdminUser | null) {
    user.value = newUser
  }

  function setToken(newToken: string | null) {
    token.value = newToken
  }

  function setLoading(isLoading: boolean) {
    loading.value = isLoading
  }

  function logout() {
    user.value = null
    token.value = null
  }

  async function checkAuth() {
    setLoading(true)
    try {
      const response = await checkAuthApi()
      if (response && 'user' in response && response.user) {
        setUser(response.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
      token.value = null
    } finally {
      setLoading(false)
    }
  }

  async function restoreSession() {
    if (token.value) return
    try {
      const response = await checkAuthApi()
      if (response && 'user' in response && response.user) {
        setUser(response.user)
      }
    } catch {
      // no valid cookie session
    }
  }

  async function ensureReady() {
    if (initialized.value) return
    if (!initPromise) {
      initPromise = restoreSession().then(() => {
        initialized.value = true
      }).finally(() => {
        initPromise = null
      })
    }
    return initPromise
  }

  return {
    user,
    token,
    loading,
    isAuthenticated,
    isAdmin,
    setUser,
    setToken,
    setLoading,
    logout,
    checkAuth,
    restoreSession,
    ensureReady,
  }
})
