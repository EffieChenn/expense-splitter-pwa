import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// 移除預設的 index.css 引用，因為我們直接用 Tailwind CDN
// import './index.css'

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
