import { createApp } from "vue";
import { createPinia } from "pinia";
import { createHead } from '@unhead/vue/client'
import "uno.css";
import "mdui";
import "./style.css";
import App from "./App.vue";
import router from "./router";
import { useAuthStore } from "./stores/auth";

const app = createApp(App);
const pinia = createPinia();
const head = createHead()

app.use(head)
app.use(pinia);

const authStore = useAuthStore(pinia);
await authStore.restoreSession()

app.use(router);
app.mount("#app");
