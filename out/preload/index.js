"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const customElectronTitlebar = require("custom-electron-titlebar");
const onCrawlerTaskComplete = (callback) => {
  electron.ipcRenderer.removeAllListeners("crawler:complete");
  electron.ipcRenderer.on("crawler:complete", async (_event, stopReason) => {
    callback(stopReason);
  });
};
const onReceiveCrawlerLog = (callback) => {
  electron.ipcRenderer.removeAllListeners("crawler:log");
  electron.ipcRenderer.on("crawler:log", async (_event, log) => {
    callback(log);
  });
};
const onReceiveCrawlerData = (callback) => {
  electron.ipcRenderer.removeAllListeners("crawler:data");
  electron.ipcRenderer.on("crawler:data", async (_event, result) => {
    callback(result);
  });
};
const onForceLogout = (callback) => {
  electron.ipcRenderer.removeAllListeners("auth:forceLogout");
  electron.ipcRenderer.on("auth:forceLogout", async (_event, message) => {
    callback(message);
  });
};
const onShopifyUploadComplete = (callback) => {
  electron.ipcRenderer.removeAllListeners("shopify:uploadComplete");
  electron.ipcRenderer.on("shopify:uploadComplete", async (_event, result) => {
    callback(result);
  });
};
let titlebarInstance = null;
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("spark-theme");
  const isDark = savedTheme === "dark" || !savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const options = {
    backgroundColor: customElectronTitlebar.TitlebarColor.fromHex(isDark ? "#0f0f23" : "#f8fafc"),
    onlyShowMenuBar: true
  };
  titlebarInstance = new customElectronTitlebar.Titlebar(options);
});
const updateTitlebarTheme = (isDark) => {
  if (titlebarInstance) {
    const color = isDark ? "#0f0f23" : "#f8fafc";
    titlebarInstance.updateBackground(customElectronTitlebar.TitlebarColor.fromHex(color));
  }
};
const api = {
  onCrawlerTaskComplete,
  // 크롤링 완료 알림
  onReceiveCrawlerData,
  // 크롤링 상품 데이터 수신
  onReceiveCrawlerLog,
  // 크롤링 로그 수신
  onForceLogout,
  // 강제 로그아웃
  onShopifyUploadComplete,
  // Shopify 업로드 완료
  updateTitlebarTheme
  // 타이틀바 테마 변경
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
