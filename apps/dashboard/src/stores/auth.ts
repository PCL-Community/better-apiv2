import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AdminUser, User } from '../types'
import { checkAuth as checkAuthApi } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | AdminUser | null>(null)
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const loading = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => Boolean(user.value?.isTeamMember))

  function setUser(newUser: User | AdminUser | null) {
    user.value = newUser
  }

  function setToken(newToken: string | null) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem('auth_token', newToken)
    } else {
      localStorage.removeItem('auth_token')
    }
  }

  function setLoading(isLoading: boolean) {
    loading.value = isLoading
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('auth_token')
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
    } finally {
      setLoading(false)
    }
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
  }
})
