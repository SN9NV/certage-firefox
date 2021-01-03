"use strict";

const msPerDay = 3600000 * 24;

async function tabId() {
  const tabs = await browser.tabs.query({ currentWindow: true, active: true });
  for (const tab of tabs) {
    if (tab.active) {
      return tab.id;
    }
  }
}

async function getCerts() {
  const certs = await browser.runtime.sendMessage({
    type: "getCerts",
    tabId: await tabId(),
  });

  if (certs === undefined) {
    return [];
  }

  return Object.entries(certs)
    .map(([_, err]) => err)
    .sort((a, b) => {
      if ((a.isEarly || a.isExpired) && !(b.isEarly || b.isExpired)) {
        return -1;
      }
      if (a.timeLeft === b.timeLeft) {
        return b.cn.localeCompare(a.cn);
      }
      return a.timeLeft - b.timeLeft;
    });
}

async function main() {
  const certs = await getCerts();

  const certsDiv = document.getElementById("certs");

  for (const cert of certs) {
    const cn = document.createElement("span");
    const note = document.createElement("span");

    const className =
      cert.isEarly || cert.isExpired
        ? "error"
        : cert.isAlmostExpired
        ? "warning"
        : "good";

    const cnContent = document.createTextNode(cert.cn);
    cn.appendChild(cnContent);
    cn.setAttribute("title", cert.cert.subject);
    cn.setAttribute("class", className);

    const noteContent = document.createTextNode(
      cert.isEarly
        ? "Early"
        : cert.isExpired
        ? "Expired"
        : `${Math.trunc(cert.timeLeft / msPerDay)} days`
    );
    note.appendChild(noteContent);
    note.setAttribute("title", new Date(cert.end));
    note.setAttribute("class", className);

    certsDiv.append(cn, note);
  }

  const removeDataButton = document.getElementById("removeData");
  removeDataButton.onclick = sendRemoveTabData;
}

async function sendRemoveTabData() {
  await browser.runtime.sendMessage({
    type: "removeCerts",
    tabId: await tabId(),
  });

  window.close();
}

window.onload = main;
