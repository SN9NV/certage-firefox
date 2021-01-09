"use strict";

const msPerDay = 3600000 * 24;

const ICON_HIDDEN = "/icons/hidden.png";
const ICON_VISIBLE = "/icons/visible.png";

async function tabId() {
  const tabs = await browser.tabs.query({ currentWindow: true, active: true });
  for (const tab of tabs) {
    if (tab.active) {
      return tab.id;
    }
  }
}

async function getCerts() {
  const { certs, hiddenCommonNames } = await browser.runtime.sendMessage({
    type: "getCerts",
    tabId: await tabId(),
  });

  return {
    certs: Object.entries(certs)
      .map(([_, cert]) => cert)
      .sort((a, b) => {
        if ((a.isEarly || a.isExpired) && !(b.isEarly || b.isExpired)) {
          return -1;
        }

        if (a.timeLeft === b.timeLeft) {
          return b.cn.localeCompare(a.cn);
        }

        return a.timeLeft - b.timeLeft;
      }),
    hiddenCommonNames,
  };
}

function hideButton(commonName, isHidden, className) {
  const td = document.createElement("td");
  td.onclick = async () => {
    await browser.runtime.sendMessage({
      type: isHidden ? "popHiddenCommonName" : "pushHiddenCommonNames",
      tabId: await tabId(),
      hiddenCommonName: commonName,
    });
    main();
  };

  const icon = document.createElement("img");
  icon.setAttribute("src", isHidden ? ICON_HIDDEN : ICON_VISIBLE);
  icon.setAttribute("title", isHidden ? "Show" : "Hide");
  icon.setAttribute("class", className);

  td.append(icon);

  return td;
}

function cnSpan(cert, className) {
  const cn = document.createElement("td");
  cn.appendChild(document.createTextNode(cert.cn));
  cn.setAttribute("title", cert.cert.subject);
  cn.setAttribute("class", className);

  return cn;
}

function noteSpan(cert, className) {
  const note = document.createElement("td");
  note.appendChild(
    document.createTextNode(
      cert.isEarly
        ? "Early"
        : cert.isExpired
        ? "Expired"
        : `${Math.trunc(cert.timeLeft / msPerDay)} days`
    )
  );
  note.setAttribute("title", new Date(cert.end));
  note.setAttribute("class", className);

  return note;
}

async function main() {
  const { certs, hiddenCommonNames } = await getCerts();

  const certsTable = document.getElementById("certs");
  certsTable.replaceChildren();

  for (const cert of certs) {
    const row = document.createElement("tr");
    row.setAttribute(
      "class",
      cert.isEarly || cert.isExpired
        ? "error"
        : cert.isAlmostExpired
        ? "warning"
        : "good"
    );

    row.append(
      hideButton(cert.cn, hiddenCommonNames.includes(cert.cn)),
      cnSpan(cert),
      noteSpan(cert)
    );

    certsTable.append(row);
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
