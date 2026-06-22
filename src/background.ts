// MV3 service worker：让点击工具栏图标即打开侧边栏。
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('setPanelBehavior failed', e));
});
