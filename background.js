"use strict";

const msPerDay = 3600_000 * 24;

async function logRootCert(details) {
  if (details.documentUrl === undefined) {
    return ;
  }

  try {
    let securityInfo = await browser.webRequest.getSecurityInfo(
      details.requestId,
      {"certificateChain": true},
    );

    let error = undefined;

    securityInfo.certificates.forEach(c => {
      if (c.isBuiltInRoot) {
        return ;
      }

      const { start, end } = c.validity;
      const timestamp = details.timeStamp;

      const isEarly = timestamp < start;
      const isAlmostExpired = end - timestamp < msPerDay * 28;
      const isExpired = end - timestamp < 0;

      if (isEarly || isAlmostExpired) {
        error = {
          start,
          end,
          timestamp,
          isEarly,
          isAlmostExpired,
          isExpired,
        }
      }
    });

    if (error !== undefined) {
      browser.browserAction.setIcon({
        tabId: details.tabId,
        path: {
            48: error.isEarly || error.isExpired
              ? "icons/48_red.png"
              : "icons/48_orange.png",
        },
      });
      browser.browserAction.setBadgeText({
        tabId: details.tabId,
        text: error.isEarly
          ? "Early"
          : error.isExpired
            ? "Exipred"
            : String(Math.trunc((error.end - error.timestamp) / msPerDay)),
      });
    }
  }
  catch(error) {
    console.error(error);
  }
};

browser.webRequest.onHeadersReceived.addListener(
  logRootCert,
  {urls: ["<all_urls>"]},
  ["blocking"],
);
