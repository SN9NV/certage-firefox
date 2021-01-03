"use strict";

const msPerDay = 3600000 * 24;
const ms28Days = msPerDay * 28;

const ICON_RED = "icons/48_red.png";
const ICON_ORANGE = "icons/48_orange.png";

const CERTS = {};

function setIcon(tabId, icon) {
  browser.browserAction.setIcon({
    tabId,
    path: { 48: icon },
  });
}

function setBadgeText(tabId, text) {
  browser.browserAction.setBadgeText({ tabId, text });
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

    if (details.tabId in CERTS) {
      let isEarly = false;
      let isExpired = false;
      let minTimeLeft = ms28Days;

      Object.entries(CERTS[details.tabId]).forEach(([_, err]) => {
        isEarly |= err.isEarly;
        isExpired |= err.isExpired;
        if (err.isAlmostExpired) {
          minTimeLeft = Math.min(minTimeLeft, err.timeLeft);
        }
      });

      if (isEarly) {
        setIcon(details.tabId, ICON_RED);
      } else if (isExpired) {
        setIcon(details.tabId, ICON_RED);
      } else if (minTimeLeft < ms28Days) {
        setIcon(details.tabId, ICON_ORANGE);
        setBadgeText(details.tabId, String(Math.trunc(minTimeLeft / msPerDay)));
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function sendData(data) {
  if (data.type === "getCerts") {
    return Promise.resolve(CERTS[data.tabId]);
  }
  if (data.type === "removeCerts") {
    delete CERTS[data.tabId];
    setIcon(data.tabId, ICON_RED);
    setBadgeText(data.tabId, "!");
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
