import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// 页面组件懒加载
const LoginPage = () => import('../pages/LoginPage.vue')
const CallbackPage = () => import('../pages/CallbackPage.vue')
const MainLayout = () => import('../layouts/MainLayout.vue')
const DashboardPage = () => import('../pages/DashboardPage.vue')
const AnnouncementPage = () => import('../pages/AnnouncementPage.vue')
const UpdatePage = () => import('../pages/UpdatePage.vue')
const SourcesPage = () => import('../pages/SourcesPage.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { requiresAuth: false }
  },
  {
    path: '/callback',
    name: 'callback',
    component: CallbackPage,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: DashboardPage,
      },
      {
        path: 'admin/announcements',
        name: 'announcements',
        component: AnnouncementPage,
        meta: { requiresAdmin: true }
      },
      {
        path: 'admin/updates',
        name: 'updates',
        component: UpdatePage,
        meta: { requiresAdmin: true }
      },
      {
        path: 'admin/sources',
        name: 'sources',
        component: SourcesPage,
        meta: { requiresAdmin: true }
      },
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  await authStore.ensureReady()

  if (authStore.isAuthenticated && !authStore.user) {
    try {
      await authStore.checkAuth()
    } catch {
      authStore.logout()
      if (to.matched.some(r => r.meta?.requiresAuth)) {
        next('/login')
        return
      }
    }
  }

  const requiresAuth = to.matched.some(r => r.meta?.requiresAuth)
  const requiresAdmin = to.matched.some(r => r.meta?.requiresAdmin)

  if (requiresAuth && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  if (requiresAdmin && !authStore.isAdmin) {
    next('/')
    return
  }

  if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
    return
  }

  next()
})

export default router
