/* eslint-disable */

export const FC_READY_EVENT = "fc-ready";

function initFreshChat() {
  console.log("[SnapplifyChat] Initializing FreshChat widget...");
  const host = "https://wchat.eu.freshchat.com";
  const token = "4a7fdf98-d12f-49a6-aa99-fd0fb7d5f82a";
  const tags = ["bookgenius"];
  const faqTags = { tags: tags, filterType: "article" };
  const config = { content: { headers: { channel_response: { offline: " " } } } };

  console.log("[SnapplifyChat] FreshChat config:", { host, token, tags, faqTags });

  try {
    window.fcWidget.init({ token, host, config, tags, faqTags });
    console.log("[SnapplifyChat] FreshChat widget initialized successfully");
    window.dispatchEvent(new CustomEvent(FC_READY_EVENT));
  } catch (error) {
    console.error("[SnapplifyChat] Failed to initialize FreshChat widget:", error);
  }
}

export function snapplifyChatInitializer(i, t) {
  console.log("[SnapplifyChat] snapplifyChatInitializer called with:", {
    document: !!i,
    target: t,
  });
  let e;

  if (i.getElementById(t)) {
    console.log("[SnapplifyChat] Script element already exists, initializing FreshChat directly");
    initFreshChat();
  } else {
    console.log("[SnapplifyChat] Creating and appending FreshChat script element...");
    e = i.createElement("script");
    e.id = t;
    e.async = !0;
    e.src = "https://wchat.eu.freshchat.com/js/widget.js";
    e.onload = () => {
      console.log("[SnapplifyChat] FreshChat script loaded, initializing widget...");
      initFreshChat();
    };
    e.onerror = (error) => {
      console.error("[SnapplifyChat] Failed to load FreshChat script:", error);
    };
    i.head.appendChild(e);
    console.log("[SnapplifyChat] FreshChat script appended to head");
  }
}
