"use strict";

const msPerDay = 3600000 * 24;
const ms28Days = msPerDay * 28;

const ICON_GREEN = "icons/48_green.png";
const ICON_ORANGE = "icons/48_orange.png";
const ICON_RED = "icons/48_red.png";

const CERTS = {};
let hiddenCommonNames = [];

function saveHiddenCommonNames() {
  browser.storage.local.set({
    hiddenCommonNames,
  });
}

function loadHiddenCommonNames() {
  browser.storage.local
    .get("hiddenCommonNames")
    .then(
      (hiddenCNames) =>
        (hiddenCommonNames = hiddenCNames.hiddenCommonNames || [])
    );
}

function pushHiddenCommonName(newHiddenCommonName, tabId) {
  if (hiddenCommonNames.includes(newHiddenCommonName)) {
    return;
  }

  hiddenCommonNames.push(newHiddenCommonName);
  hiddenCommonNames.sort();
  saveHiddenCommonNames();
  updateIcon(tabId);
}

function popHiddenCommonName(oldHiddenCommonName, tabId) {
  const index = hiddenCommonNames.indexOf(oldHiddenCommonName);

  if (index === -1) {
    return;
  }

  hiddenCommonNames = hiddenCommonNames.splice(index + 1, 1);
  saveHiddenCommonNames();
  updateIcon(tabId);
}

function setIcon(tabId, icon) {
  browser.browserAction.setIcon({
    tabId,
    path: { 48: icon },
  });
}

function setBadgeText(tabId, text) {
  browser.browserAction.setBadgeText({ tabId, text });
}

function updateIcon(tabId) {
  if (tabId in CERTS) {
    let isEarly = false;
    let isExpired = false;
    let minTimeLeft = ms28Days;

    Object.entries(CERTS[tabId]).forEach(([_, cert]) => {
      if (hiddenCommonNames.includes(cert.cn)) {
        return;
      }

      isEarly |= cert.isEarly;
      isExpired |= cert.isExpired;
      if (cert.isAlmostExpired) {
        minTimeLeft = Math.min(minTimeLeft, cert.timeLeft);
      }
    });

    if (isEarly) {
      setIcon(tabId, ICON_RED);
      setBadgeText(tabId, "");
    } else if (isExpired) {
      setIcon(tabId, ICON_RED);
      setBadgeText(tabId, "");
    } else if (minTimeLeft < ms28Days) {
      setIcon(tabId, ICON_ORANGE);
      setBadgeText(tabId, String(Math.trunc(minTimeLeft / msPerDay)));
    } else {
      setIcon(tabId, ICON_GREEN);
      setBadgeText(tabId, "");
    }
  }
}

async function logRootCert(details) {
  if (details.tabId === -1) {
    return;
  }

  try {
    let securityInfo = await browser.webRequest.getSecurityInfo(
      details.requestId,
      {}
    );

    securityInfo.certificates.forEach((c) => {
      if (c.isBuiltInRoot) {
        return;
      }

      const { start, end } = c.validity;
      const timestamp = details.timeStamp;
      const timeLeft = end - timestamp;

      const isEarly = timestamp < start;
      const isAlmostExpired = timeLeft < ms28Days;
      const isExpired = timeLeft < 0;

      const cert = {
        cert: c,
        cn: c.subject.match(/CN=(.*?)(:?,|$)/i)[1],
        start,
        end,
        timestamp,
        isEarly,
        isAlmostExpired,
        isExpired,
        timeLeft,
      };

      if (details.tabId in CERTS) {
        CERTS[details.tabId][c.fingerprint.sha256] = cert;
      } else {
        CERTS[details.tabId] = {
          [c.fingerprint.sha256]: cert,
        };
      }
    });

    updateIcon(details.tabId);
  } catch (error) {
    console.error(error);
  }
}

function sendData(data) {
  const { type, tabId } = data;

  if (type === "getCerts") {
    return Promise.resolve({
      certs: CERTS[tabId] || [],
      hiddenCommonNames: hiddenCommonNames || [],
    });
  }

  if (type === "removeCerts") {
    delete CERTS[tabId];
    setIcon(tabId, ICON_RED);
    setBadgeText(tabId, "!");
    return Promise.resolve(true);
  }

  if (type === "pushHiddenCommonNames") {
    pushHiddenCommonName(data.hiddenCommonName, tabId);
    return Promise.resolve(true);
  }

  if (type === "popHiddenCommonName") {
    popHiddenCommonName(data.hiddenCommonName, tabId);
    return Promise.resolve(true);
  }
}

browser.webRequest.onHeadersReceived.addListener(
  logRootCert,
  { urls: ["<all_urls>"] },
  ["blocking"]
);

browser.runtime.onMessage.addListener(sendData);

browser.tabs.onRemoved.addListener((tabId) => {
  delete CERTS[tabId];
});

loadHiddenCommonNames();
