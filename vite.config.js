import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 這裡非常重要！必須設定為您的儲存庫名稱
  // 如果您的儲存庫網址是 https://github.com/user/my-repo
  // 這裡就填 '/my-repo/'
  base: "/expense-splitter-pwa/",
});
