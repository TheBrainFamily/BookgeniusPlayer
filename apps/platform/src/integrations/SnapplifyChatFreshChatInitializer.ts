/* eslint-disable */

export const FC_READY_EVENT = "fc-ready";

function initFreshChat() {
  const host = "https://wchat.eu.freshchat.com";
  const token = "4a7fdf98-d12f-49a6-aa99-fd0fb7d5f82a";
  const tags = ["bookgenius"];
  const faqTags = { tags: tags, filterType: "article" };
  const config = { content: { headers: { channel_response: { offline: " " } } } };
  window.fcWidget.init({ token, host, config, tags, faqTags });
  window.dispatchEvent(new CustomEvent(FC_READY_EVENT));
}

export function snapplifyChatInitializer(i, t) {
  let e;

  i.getElementById(t)
    ? initFreshChat()
    : (((e = i.createElement("script")).id = t), (e.async = !0), (e.src = "https://wchat.eu.freshchat.com/js/widget.js"), (e.onload = initFreshChat), i.head.appendChild(e));
}
