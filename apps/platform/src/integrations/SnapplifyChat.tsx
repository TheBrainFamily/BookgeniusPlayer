/* eslint-disable */
// @ts-nocheck

function initFreshChat() {
  const host = "https://wchat.eu.freshchat.com";
  const token = "4a7fdf98-d12f-49a6-aa99-fd0fb7d5f82a";
  const tags = ["bookgenius"];
  const faqTags = { tags: tags, filterType: "article" };
  const config = { content: { headers: { channel_response: { offline: " " } } } };
  window.fcWidget.init({ token, host, config, tags, faqTags });

  window.fcWidget.user.setProperties({
    user_isAuthenticated: "False",
    // firstName: "Garth",
    // lastName: "Jacobs",
    // email: "gjacobs@snapplify.com",
    // user_username: "gjacobs",
    // customer_name: "Snapplify High School",
    // customer_country: "South Africa",
    // customer_URL: "snapplifyhighschool.snapplify.com",
    // user_grade: "12",
  });
}

function initialize(i, t) {
  let e;

  i.getElementById(t)
    ? initFreshChat()
    : (((e = i.createElement("script")).id = t), (e.async = !0), (e.src = "https://wchat.eu.freshchat.com/js/widget.js"), (e.onload = initFreshChat), i.head.appendChild(e));
}

function initiateCall() {
  initialize(document, "Freshdesk Messaging-js-sdk");
}

if (!import.meta.env.SSR && import.meta.env.VITE_AUTH_PROVIDER === "snapplify") {
  console.log("SnapplifyChat initializing");
  window.addEventListener ? window.addEventListener("load", initiateCall, !1) : window.attachEvent("load", initiateCall, !1);
} else {
  console.log("SnapplifyChat not initialized");
}
