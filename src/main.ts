import platformClient from "purecloud-platform-client-v2";
import { registerSparkComponents } from "genesys-spark";
import ClientApp from "purecloud-client-app-sdk";

import { conversationDetailQuery, EmailListElement } from "./types";
const client = platformClient.ApiClient.instance;
client.setPersistSettings(true, "my_app_name");
loadSparkComponents();
let url = new URL(document.location.href);
let gc_region = url.searchParams.get("gc_region");
let gc_clientId = url.searchParams.get("gc_clientId");
let gc_redirectUrl = url.searchParams.get("gc_redirectUrl");
let gc_conversationId = url.searchParams.get("gc_conversationId");
let csvRows: any[] = [];

gc_region
  ? sessionStorage.setItem("gc_region", gc_region)
  : (gc_region = sessionStorage.getItem("gc_region"));
gc_clientId
  ? sessionStorage.setItem("gc_clientId", gc_clientId)
  : (gc_clientId = sessionStorage.getItem("gc_clientId"));
gc_redirectUrl
  ? sessionStorage.setItem("gc_redirectUrl", gc_redirectUrl)
  : (gc_redirectUrl = sessionStorage.getItem("gc_redirectUrl"));
gc_conversationId
  ? sessionStorage.setItem("gc_conversationId", gc_conversationId)
  : (gc_conversationId = sessionStorage.getItem("gc_conversationId"));

if (!gc_region) {
  gc_region = "mypurecloud.ie";
}
client.setEnvironment(gc_region);

const myClientApp = new ClientApp({
  pcEnvironment: gc_region,
});

const uapi = new platformClient.UsersApi();
const capi = new platformClient.ConversationsApi();
const rapi = new platformClient.RoutingApi();
const papi = new platformClient.PresenceApi();

let user: platformClient.Models.UserMe | null = null;
let selectedConversationId = "";
let selectedParticipantId = "";
let queueCounts: Record<string, number> = {};
// @ts-ignore
let selectedStatus = "";

// document.getElementById("column-visibility-checklist")!.addEventListener("change", function (event) {
//   const target = event.target as HTMLInputElement;
//   console.log("target", target);
//   const columnName = target.getAttribute("data-column-name");
//   console.log("columnName", columnName);
//   const isChecked = target.checked;
//   toggleColumnVisibility(columnName, isChecked);
// })

// const sel = document.getElementById("dropdown") as HTMLSelectElement;
// console.log("sel", sel.children[0].childNodes);
// // function to get values from multi-select dropdown with option value and checked status
// const values = Array.from(sel.children).map((child) => {
//   console.log("child", child);
//   return { value: child.getAttribute("value"), checked: (child as HTMLOptionElement).selected };
// }
// );
// console.log("values", values);

function getSelectedColumnValues() {
  const selectedOptions = document.querySelectorAll(
    "gux-option-multi.gux-selected"
  );
  console.log("selectedOptions", selectedOptions);
  const selectedValues = Array.from(selectedOptions).map((option) =>
    option.getAttribute("value")
  );
  return selectedValues;
}

// Example usage
const selectedValues = getSelectedColumnValues();
console.log("Selected column values:", selectedValues);

function toggleColumnVisibility(columnName: string | null, isVisible: boolean) {
  if (!columnName) return;

  const headers = document.querySelectorAll(
    `#sortable-table thead th[data-column-name=${columnName}]`
  );
  const columnIndex = Array.from(headers).map((header) =>
    Array.from(header.parentElement!.children).indexOf(header)
  );

  const rows = document.querySelectorAll("#tbody tr");
  rows.forEach((row) => {
    columnIndex.forEach((index) => {
      const cell = row.children[index] as HTMLElement;
      if (cell) {
        cell.style.display = isVisible ? "" : "none";
      }
    });
  });

  headers.forEach((header) => {
    // @ts-ignore
    header.style.display = isVisible ? "" : "none";
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const checklistItems = document.querySelectorAll(
    "#column-visibility-checklist input[type=checkbox]"
  );
  checklistItems.forEach((item) => {
    const target = item as HTMLInputElement;
    const columnName = target.getAttribute("data-column-name");
    const isChecked = target.checked;
    toggleColumnVisibility(columnName, isChecked);
  });
});

document
  .getElementById("search-value")!
  .addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      const searchField = document.getElementById(
        "search-field"
      ) as HTMLSelectElement;

      const searchValue = document.querySelector(
        "[name=search-field]"
      ) as HTMLInputElement;
      console.log("searchValue", searchValue.value);
      const statusValue = document.querySelector(
        "[name=status-field]"
      ) as HTMLSelectElement;
      const queueFilterValue = (
        document.querySelector("[name=queue-filter-field]") as HTMLSelectElement
      ).value;
      filterTable(searchValue.value, statusValue.value, queueFilterValue);
      searchValue.value = "";
      //@ts-ignore
      searchField.guxForceUpdate();
    }
  });

document
  .getElementById("status-value")!
  .addEventListener("change", function () {
    const searchValue = (
      document.querySelector("[name=search-field]") as HTMLInputElement
    ).value;
    const statusValue = (
      document.querySelector("[name=status-field]") as HTMLSelectElement
    ).value;
    const queueFilterValue = (
      document.querySelector("[name=queue-filter-field]") as HTMLSelectElement
    ).value;
    filterTable(searchValue, statusValue, queueFilterValue);
  });

document
  .getElementById("queue-filter-value")!
  .addEventListener("change", function () {
    const searchValue = (
      document.querySelector("[name=search-field]") as HTMLInputElement
    ).value;
    const statusValue = (
      document.querySelector("[name=status-field]") as HTMLSelectElement
    ).value;
    const queueFilterValue = (this as HTMLSelectElement).value;
    filterTable(searchValue, statusValue, queueFilterValue);
    refreshQueueFilterLabels();
  });

document.getElementById("months12")!.addEventListener("click", function () {
  months12();
});
document.getElementById("months24")!.addEventListener("click", function () {
  months24();
});
document.getElementById("getData")!.addEventListener("click", function () {
  getData();
});
document.getElementById("getDisconnected")!.addEventListener("click", function () {
  const disconnectedColIndex = csvRows.length > 0
    ? csvRows[0].indexOf("Disconnected in App")
    : -1;
  getData(row => disconnectedColIndex !== -1 && row[disconnectedColIndex] === true);
});
document.getElementById("months12")!.addEventListener("click", function () {
  months12();
});
document.getElementById("clearData")!.addEventListener("click", function () {
  clearData();
});

document.getElementById("queue-stats-toggle")!.addEventListener("click", function () {
  const panel = document.getElementById("queue-stats-panel")!;
  panel.style.display = panel.style.display === "none" ? "flex" : "none";
});

window.addEventListener("click", async function (e) {
  console.log("Window click", e);

  if ((e.target as HTMLElement).id === "column-visibility-setting") {
    console.log("Column visibility button clicked");
  }
  if ((e.target as HTMLElement).id === "transfer-queue") {
    console.log("Transfer Queue button clicked");
    let selectedQueue = (
      document.getElementById("listQueues") as HTMLSelectElement
    ).value;
    console.log("selectedQueue", selectedQueue);

    try {
      let rows = document.getElementById("tbody")!.children;

      const headers = document.querySelectorAll("#sortable-table thead th");
      let participantColumnIndex = -1;
      let statusColumnIndex = -1;

      // Find the index of the "Status" column
      headers.forEach((header, index) => {
        if (header.getAttribute("data-column-name") === "participant") {
          participantColumnIndex = index;
        }
      });

      headers.forEach((header, index) => {
        if (header.getAttribute("data-column-name") === "status") {
          statusColumnIndex = index;
        }
      });

      if (participantColumnIndex === -1 || statusColumnIndex === -1) {
        console.error("Participant or status column not found");
        return;
      }

      let selectedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        const cells = row.querySelectorAll("td");

        console.log("row", row);
        // console.log("data selected", row?.attributes[2]?.name);
        console.log(
          "status",
          cells[statusColumnIndex]?.textContent?.toLowerCase()
        );
        console.log("row is selected", row?.attributes[2]?.name == "data-selected-row")
        console.log("row select", row?.attributes)
        console.log("row eligible for transfer", (cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "interacting" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "on hold" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "parked"))
        console.log("participant found", cells[participantColumnIndex]?.textContent)
        if (
          (row?.hasAttribute("data-selected-row") &&
            (cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "interacting" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "on hold" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "parked"))
        ) {
          const participantId = cells[participantColumnIndex]?.textContent;
          if (!participantId) {
            console.error("Participant ID not found");
            return;
          }
          await transferQueue(row.id, participantId, selectedQueue);
          selectedCount++;
        }
      }
      console.log("selectedCount", selectedCount);
      if (selectedCount == 0) {
        console.log("no in queue rows selected");
      } else {
        await delay(2000);
        getActiveEmails();
      }
    } catch (error) {
      console.error("Error: ", error);
    }
  }

  if ((e.target as HTMLElement).id === "transfer-user") {
    console.log("Transfer User button clicked");
    let selectedUser = (
      document.getElementById("listUsers") as HTMLSelectElement
    ).value;
    console.log("selectedUser", selectedUser);
    try {
      let rows = document.getElementById("tbody")!.children;

      const headers = document.querySelectorAll("#sortable-table thead th");
      let participantColumnIndex = -1;
      let statusColumnIndex = -1;

      // Find the index of the "Status" column
      headers.forEach((header, index) => {
        if (header.getAttribute("data-column-name") === "participant") {
          participantColumnIndex = index;
        }
      });

      headers.forEach((header, index) => {
        if (header.getAttribute("data-column-name") === "status") {
          statusColumnIndex = index;
        }
      });

      if (participantColumnIndex === -1 || statusColumnIndex === -1) {
        console.error("Participant or status column not found");
        return;
      }
      console.log("participantColumnIndex", participantColumnIndex);
      console.log("statusColumnIndex", statusColumnIndex);
      let selectedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        const cells = row.querySelectorAll("td");
        console.log("row", row);
        console.log("data selected", row?.attributes[2]?.name);
        console.log(
          "status",
          cells[statusColumnIndex]?.textContent?.toLowerCase()
        );
        console.log("row is selected", row?.hasAttribute("data-selected-row"))
        console.log("row eligible for transfer", (cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "interacting" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "on hold" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "parked"))
        console.log("participant found", cells[participantColumnIndex]?.textContent)


        if (
          row?.hasAttribute("data-selected-row") &&
          ((cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "interacting" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "on hold" || cells[statusColumnIndex]?.textContent?.toLowerCase() == "parked"))
        ) {
          const participantId = cells[participantColumnIndex]?.textContent;
          console.log("participantId", participantId);
          if (!participantId) {
            console.error("Participant ID not found");
            return;
          }
          await transferUser(row.id, participantId, selectedUser);
          selectedCount++;
        }
      }
      console.log("selectedCount", selectedCount);
      if (selectedCount == 0) {
        console.log("no in queue rows selected");
      } else {
        await delay(2000);
        getActiveEmails();
      }
    } catch (error) {
      console.error("Error: ", error);
    }
  }

  if ((e.target as HTMLElement).id === "delete-emails") {
    console.log("Delete emails button clicked");
    //@ts-ignore
    document.getElementById("delete-modal")!.showModal();
  }

  if ((e.target as HTMLElement).id === "delete-email-modal-button") {
    console.log("Delete Yes button clicked");
    let rows = document.getElementById("tbody")!.children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row?.hasAttribute("data-selected-row")) {
        console.log("row", row);
        console.log("row id", row?.id);
        const conversationId = row?.id;
        await disconnectEmail(conversationId);
      }
    }
    await delay(1500);
    getActiveEmails();

    //@ts-ignore
    document.getElementById("delete-modal")!.close();
  }

  if ((e.target as HTMLElement).id === "delete-email-modal-button") {
    console.log("Delete Yes button clicked");
    let rows = document.getElementById("tbody")!.children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row?.hasAttribute("data-selected-row")) {
        console.log("row", row);
        console.log("row id", row?.id);
        const conversationId = row?.id;
        await disconnectEmail(conversationId);
      }
    }
    delay(3000);
    getActiveEmails();

    //@ts-ignore
    document.getElementById("delete-modal")!.close();
  }

  if ((e.target as HTMLElement).id === "refresh") {
    console.log("Refresh button clicked");
    start();
  }

  if ((e.target as HTMLElement).id === "search") {
    console.log("Search button clicked");
    const searchField = document.getElementById(
      "search-field"
    ) as HTMLSelectElement;

    const searchValue = document.querySelector(
      "[name=search-field]"
    ) as HTMLInputElement;
    console.log("searchValue", searchValue.value);
    // const statusField = document.getElementById("status-field") as HTMLSelectElement;
    let statusValue = document.querySelector(
      "[name=status-field]"
    ) as HTMLSelectElement;
    const queueFilterValue = (
      document.querySelector("[name=queue-filter-field]") as HTMLSelectElement
    ).value;
    filterTable(searchValue.value, statusValue.value, queueFilterValue);
    searchValue.value = "";
    //@ts-ignore
    searchField.guxForceUpdate();
  }

  if ((e.target as HTMLElement).id === "claim-email") {
    console.log("Claim emeail button clicked", (e.target as HTMLElement).innerText);
    // if (selectedStatus !== "In Queue" || selectedStatus !== "Parked") {
    //   console.log("Email is not in queue");
    //   return;
    // }
    if ((e.target as HTMLElement).innerText == "Preview") {
      claimEmail(selectedConversationId, selectedParticipantId);
    }
    else if ((e.target as HTMLElement).innerText == "Reconnect") {
      console.log("Starting reconnect process")
      // put reconnect logic here
        reconnectEmail(selectedConversationId) 
      
    }
    else return
  }
});


// Intercept gux-table's select-all before it processes it, so only visible rows are selected.
// gux-all-row-select emits 'internalallrowselectchange' which bubbles through the slotted
// <table> before reaching gux-table's @Listen handler on the host element.
document.querySelector('#sortable-table table[slot="data"]')!
  .addEventListener('internalallrowselectchange', (event: Event) => {
    event.stopPropagation();
    const selectAll = (event as CustomEvent).detail as boolean;

    document.querySelectorAll<HTMLElement>('#tbody tr').forEach(tr => {
      const rowSelect = tr.querySelector('gux-row-select') as any;
      if (!rowSelect || rowSelect.disabled) return;

      if (tr.style.display !== 'none') {
        rowSelect.selected = selectAll;
        if (selectAll) {
          tr.setAttribute('data-selected-row', '');
        } else {
          tr.removeAttribute('data-selected-row');
        }
      }
    });
  });

document.getElementById("tbody")!.addEventListener("dblclick", function (e) {
  const target = e.target as HTMLElement;
  const row = target.closest("tr");
  const headers = document.querySelectorAll("#sortable-table thead th");
  let participantColumnIndex = -1;
  let statusColumnIndex = -1;

  // Find the index of the "Status" column
  headers.forEach((header, index) => {
    if (header.getAttribute("data-column-name") === "participant") {
      participantColumnIndex = index;
    }
  });

  headers.forEach((header, index) => {
    if (header.getAttribute("data-column-name") === "status") {
      statusColumnIndex = index;
    }
  });

  if (participantColumnIndex === -1 || statusColumnIndex === -1) {
    console.error("Participant or status column not found");
    return;
  }
  console.log("participantColumnIndex", participantColumnIndex);
  console.log("statusColumnIndex", statusColumnIndex);

  if (row) {
    const cells = row.querySelectorAll("td");

    const rowId = row.getAttribute("data-row-id");
    console.log("Double-clicked row ID:", rowId);
    const participantId = cells[participantColumnIndex]?.textContent;

    console.log("participantId", participantId);
    if (!participantId || !rowId) {
      console.error("Participant ID not found");
      return;
    }
    const status = cells[statusColumnIndex]?.textContent;

    console.log("status", status);
    previewEmail(rowId, participantId, status!);
  }
});

async function loadSparkComponents() {
  await registerSparkComponents();
}

start();

async function start() {
  try {
    console.log("%cLogging in to Genesys Cloud", "color: green");
    //   await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {})
    // console.log("client", client);
    // console.log("gc_clientId", gc_clientId);
    // console.log("gc_redirectUrl", gc_redirectUrl);
    // console.log("region", gc_region);
    if (!gc_clientId || !gc_redirectUrl) {
      console.error("Client ID or Redirect URL not provided");
      return;
    }
    await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {});
    // console.log("region", gc_region);
    //GET Current UserId
    user = await uapi.getUsersMe({});
    console.log("user", user);
    //GET Active Emails
    getUsers();
    getQueues();
    getActiveEmails();
    getUTCOffset();
    getLakeTime();
    months12();
  } catch (err) {
    console.log("Error: ", err);
  }
} //End of start() function

async function getActiveEmails() {
  let table = document.getElementById("tbody");
  if (!table) {
    return;
  }
  table.innerHTML = "";
  document.getElementById("loading")!.style.display = "block";

  try {
    const conversations = await processEmailQuery();
    // console.log("conversations", conversations);
    if (!conversations) {
      console.log("No active emails found");
      return;
    }
    let emailsList: EmailListElement[] = [];
    const queueEmails = getEmailsByStatus(conversations, "acd", "interact");
    const queueEmailsData = extractEmailData(queueEmails, "In Queue");
    const interactingEmails = getEmailsByStatus(
      conversations,
      "agent",
      "interact",
      "user"
    );
    const interactingEmailsData = extractEmailData(
      interactingEmails,
      "Interacting"
    );
    // console.log("interactingEmails", interactingEmails);
    const parkedEmails = getEmailsByStatus(
      conversations,
      "agent",
      "parked",
      "user"
    );
    const parkedEmailsData = extractEmailData(parkedEmails, "Parked");
    console.log("parkedEmails", parkedEmails);
    const alertingEmails = getEmailsByStatus(conversations, "agent", "alert");
    const alertingEmailsData = extractEmailData(alertingEmails, "Alerting");
    // console.log("alertingEmails", alertingEmails);
    const heldEmails = getEmailsByStatus(
      conversations,
      "agent",
      "hold",
      "user"
    );
    const heldEmailsData = extractEmailData(heldEmails, "On Hold");
    // console.log("heldEmails", heldEmails);
    emailsList = [
      ...emailsList,
      ...queueEmailsData,
      ...interactingEmailsData,
      ...parkedEmailsData,
      ...alertingEmailsData,
      ...heldEmailsData,
    ];
    console.log("emailsList", emailsList);
    emailsList.sort(
      (a, b) =>
        new Date(b.lastMessage!).getTime() - new Date(a.lastMessage!).getTime()
    );
    // const queueOccurences = getQueueOccurrences(emailsList);
    // console.log("queueOccurences", queueOccurences);

    document.getElementById("loading")!.style.display = "none";

    populateTableData(emailsList);
    populateQueueStats(emailsList);

    const searchValue = (
      document.querySelector("[name=search-field]") as HTMLInputElement
    ).value;
    const statusValue = (
      document.querySelector("[name=status-field]") as HTMLSelectElement
    ).value;
    const queueFilterValue = (
      document.querySelector("[name=queue-filter-field]") as HTMLSelectElement
    ).value;
    filterTable(searchValue, statusValue, queueFilterValue);
  } catch (error) {
    console.error("Error: ", error);
  }
}

function extractEmailData(
  emails:
    | platformClient.Models.AnalyticsConversationWithoutAttributes[]
    | undefined,
  status: string
) {
  let emailListPart = [];
  if (emails) {
    for (const email of emails) {
      console.log("email", email);
      const customerParticipant = email.participants?.filter(
        (p) => p.purpose == "customer" || p.purpose == "external"
      )[0];
      const agentParticipants = email.participants?.filter(
        (p) => p.purpose == "agent" || p.purpose == "user"
      );
      const queueParticipants = email.participants?.filter(
        (p) => p.purpose == "acd"
      );
      let subject = "";
      // console.log("agentParticipants", agentParticipants);
      if (email.originatingDirection === "inbound") {
        subject = customerParticipant!.sessions![0].segments![0].subject || ""
      }
      else {
        // check if agentParticipants has sessions and segments
        if (agentParticipants && agentParticipants.length > 0 && agentParticipants[0].sessions && agentParticipants[0].sessions!.length > 0 && agentParticipants[0].sessions![0].segments && agentParticipants[0].sessions![0].segments!.length > 1)
          subject = agentParticipants![0].sessions![0].segments.find(segment => segment.segmentType === "transmitting")?.subject || "";

      }
      let emailElement = {
        conversationId: email.conversationId,
        from: customerParticipant!.sessions![0].addressFrom,
        to: customerParticipant!.sessions![0].addressTo,
        subject: subject,
        status: status,
        queue: findLatestInteractParticipant(queueParticipants) || "",
        firstQueue: findFirstInteractParticipant(queueParticipants) || "",
        firstMessage: customerParticipant!.sessions![0].metrics!.filter(
          (m) => m.name == "nConnected"
        )[0].emitDate,
        lastMessage: customerParticipant!.sessions![
          customerParticipant!.sessions!.length - 1
        ].metrics!.filter((m) => m.name == "nConnected")[0].emitDate,
        lastAgent: findLatestInteractParticipant(agentParticipants) || "",
        lastACDparticipant:
          status == "In Queue" || status == "Alerting"
            ? findLatestInteractParticipant(queueParticipants, "id") || ""
            : findLatestInteractParticipant(agentParticipants, "id") || "",
      };
      emailListPart.push(emailElement);
    }
  }
  return emailListPart;
}

async function processEmailQuery() {
  let data: platformClient.Models.AnalyticsConversationQueryResponse = {
    conversations: [],
  };
  for (let i = 0; i < 3; i++) {
    let startDate, endDate;
    if (i == 0) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      endDate = new Date();
    } else if (i == 1) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 60);
      endDate = new Date();
      endDate.setDate(endDate.getDate() - 30);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      endDate = new Date();
      endDate.setDate(endDate.getDate() - 60);
    }
    try {
      const body: conversationDetailQuery = {
        segmentFilters: [
          {
            type: "or",
            predicates: [
              {
                type: "dimension",
                dimension: "mediaType",
                operator: "matches",
                value: "email",
              },
            ],
          },
        ],
        interval: startDate.toISOString() + "/" + endDate.toISOString(),
        conversationFilters: [
          {
            type: "and",
            predicates: [
              {
                type: "dimension",
                dimension: "conversationEnd",
                operator: "notExists",
              },
              // {
              //   type: "dimension",
              //   dimension: "originatingDirection",
              //   operator: "matches",
              //   value: "inbound",
              // },
            ],
          },
        ],
        paging: {
          pageSize: 100,
          pageNumber: 1,
        },
      };

      const periodData = await capi.postAnalyticsConversationsDetailsQuery(
        body
      );
      // console.log("periodData", periodData);
      if (!periodData.conversations) {
        console.log(`No data found in loop ${i}`);
        break;
      }
      // Add first page of conversations
      data.conversations = [
        ...data.conversations!,
        ...periodData.conversations!,
      ];

      // Check if pagination is needed
      if (periodData.totalHits && periodData.totalHits > 100) {
        const totalPages = Math.ceil(periodData.totalHits / 100);
        console.log(`Total hits: ${periodData.totalHits}, fetching ${totalPages} pages`);

        // Fetch remaining pages
        for (let page = 2; page <= totalPages; page++) {
          body.paging = {
            pageSize: 100,
            pageNumber: page,
          };

          const nextPageData = await capi.postAnalyticsConversationsDetailsQuery(body);
          console.log(`Fetched page ${page} of ${totalPages}`);

          if (nextPageData.conversations) {
            data.conversations = [
              ...data.conversations!,
              ...nextPageData.conversations!,
            ];
          }
          console.log("data.conversations.length", data.conversations.length);
        }
      }
    } catch (error) {
      console.error("Error: ", error);
    }
  }
  return data;
}
function getEmailsByStatus(
  conversations: platformClient.Models.AnalyticsConversationQueryResponse,
  purpose: string,
  segmentType: string,
  purpose2?: string
) {
  if (!conversations) {
    return [];
  }
  return conversations.conversations?.filter((conversation) => {
    if (!conversation.participants) {
      return false;
    }
    return conversation.participants.some((participant) => {
      if (!participant.sessions) {
        return false;
      }
      return (
        (participant.purpose === purpose || participant.purpose === purpose2) &&
        participant.sessions.some((session) => {
          if (!session.segments) {
            return false;
          }
          return session.segments.some((segment) => {
            return (
              segment.segmentType === segmentType &&
              !segment.hasOwnProperty("segmentEnd")
            );
          });
        })
      );
    });
  });
}

function findLatestInteractParticipant(
  data: platformClient.Models.Participant[] | undefined,
  type?: "name" | "id"
) {
  let latestParticipant: string | null = null;
  let latestTimestamp: Date | null = null;
  if (!data) {
    return null;
  }
  data.forEach((participant: any) => {
    participant.sessions.forEach((session: any) => {
      session.segments.forEach((segment: any) => {
        if (segment.segmentType === "interact") {
          const segmentStart = new Date(segment.segmentStart);

          if (!latestTimestamp || segmentStart > latestTimestamp) {
            latestTimestamp = segmentStart;
            if (type === "id") {
              latestParticipant = participant.participantId;
            } else {
              latestParticipant = participant.participantName;
            }
          }
        }
      });
    });
  });

  return latestParticipant;
}

function findFirstInteractParticipant(
  data: platformClient.Models.Participant[] | undefined,
  type?: "name" | "id"
) {
  let firstParticipant: string | null = null;
  let firstTimestamp: Date | null = null;
  if (!data) {
    return null;
  }
  data.forEach((participant: any) => {
    participant.sessions.forEach((session: any) => {
      session.segments.forEach((segment: any) => {
        if (segment.segmentType === "interact") {
          const segmentStart = new Date(segment.segmentStart);

          if (!firstTimestamp || segmentStart < firstTimestamp) {
            firstTimestamp = segmentStart;
            if (type === "id") {
              firstParticipant = participant.participantId;
            } else {
              firstParticipant = participant.participantName;
            }
          }
        }
      });
    });
  });

  return firstParticipant;
}

export async function transferQueue(
  conversationId: string,
  participantId: string,
  selectedQueueId: string
) {
  const body = {
    queueId: selectedQueueId,
  };
  try {
    const data = await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      body
    );
    console.log(
      "postConversationsEmailParticipantReplace returned successfully.",
      data
    );
    const transferQueue = await rapi.getRoutingQueue(selectedQueueId)
    const participantKey = `transferred at ${new Date().toLocaleString()} by`
    const body2: { attributes: { [key: string]: string } } = { attributes: {} }
    body2.attributes[participantKey] = `${user?.name || "Unknown"} to queue ${transferQueue.name}`
    await capi.patchConversationsEmailParticipantAttributes(conversationId, participantId, body2)

  } catch (error) {
    console.log(
      "There was a failure calling postConversationsEmailParticipantReplace"
    );
    console.error(error);
  }
}

export async function transferUser(
  conversationId: string,
  participantId: string,
  selectedUserId: string
) {
  try {
    const userStatus = await papi.getUserPresencesPurecloud(selectedUserId);
    console.log("userStatus", userStatus);

    if (
      userStatus.presenceDefinition &&
      userStatus.presenceDefinition.systemPresence == "Offline"
    ) {
      console.log("User is offline");
      popUp(Date.now(), "error", "User is offline");
      return;
    }
    const body = {
      userId: selectedUserId,
      transferType: "Unattended",
    };
    let data = await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      body
    );
    console.log(
      "postConversationsEmailParticipantReplace returned successfully.",
      data
    );
    const transferUser = await uapi.getUser(selectedUserId, {})
    const participantKey = `transferred at ${new Date().toLocaleString()} by`
    const body2: { attributes: { [key: string]: string } } = { attributes: {} }
    body2.attributes[participantKey] = `${user?.name || "Unknown"} to user ${transferUser.name}`
    await capi.patchConversationsEmailParticipantAttributes(conversationId, participantId, body2)

    //getting active participantId of the transferred conversation
    // const opts = {
    //   communicationType: "email",
    // };
    // const a = await capi.getConversation(conversationId);
    // console.log("a", JSON.stringify(a, null, 2));
    // const b = a.participants.slice().reverse().find(
    //   (p: any) => p.purpose == "agent" && p.userId == selectedUserId
    // ).id;
    // console.log("b", JSON.stringify(b, null, 2));
    // await delay(1000);
    // const alertingParticipantId = a.participants.find(p=>p.purpose=="agent"&&p.userId == selectedUserId).id
    // // const alertingParticipantId = getAlertingParticipantId(a);
    // console.log("alertingParticipantId", alertingParticipantId);

    // get last alerting participant

    // const data2 = await capi.getConversations(opts);
    // console.log(
    //   `getConversations success! data: ${JSON.stringify(data2, null, 2)}`
    // );
    // const activeConversations = data2.entities.length;
    // const lastInteractionParticipants =
    //   data2.entities[activeConversations - 1].participants;
    // console.log("lastInteractionParticipants", lastInteractionParticipants);
    // const participantAgents = lastInteractionParticipants.filter(
    //   (l: any) => l.purpose == "agent"
    // );
    // console.log("participantAgents", participantAgents);
    // const currentParticipantId =
    //   participantAgents[participantAgents.length - 1].id;

    // console.log("new participantId", currentParticipantId);
    // const body2 = {
    //   state: "connected",
    // };
    // await delay(1000);
    // const data3 = await capi.patchConversationParticipant(
    //   conversationId,
    //   alertingParticipantId,
    //   body2
    // );
    // console.log("patchConversationsEmailParticipant returned successfully.");
  } catch (error: any) {
    // toast.error(error.message);
    console.log("There was a failure transfering", error);
  }
}

// function getAlertingParticipantId(conversation) {
//   for (const participant of conversation.participants) {
//     if (participant.purpose === "agent" && participant.emails) {
//       for (const session of participant.emails) {
//         if (session.segments) {
//           for (const segment of session.segments) {
//             console.log("segment", segment);
//             if (segment.stype === "Alert" && !segment.hasOwnProperty("endTime")) {
//               return participant.id;
//             }
//           }
//         }
//       }
//     }
//   }
//   return null; // Return null if no matching participant is found
// }

// async function getConversationPreview(conversationId: string) {
//   console.log("getConversationPreview conversationId", conversationId);
//   try {
//     const messages = await capi.getConversationsEmailMessages(conversationId);
//     console.log("messages :", messages);
//     //skipping autoreply if that was the last message in thread
//     const messageId = getFirstNonCustomerEmailId(messages);
//     if (!messageId) {
//       console.error("No message ID found");
//       return;
//     }
//     console.log("messageId :", messageId);
//     const messageContent = await capi.getConversationsEmailMessage(
//       conversationId,
//       messageId
//     );
//     console.log("messageContent :", messageContent);
//     let body = "";
//     if (messageContent.htmlBody) {
//       body = messageContent.htmlBody;
//     } else {
//       body = messageContent.textBody;
//     }
//     return body;
//   } catch (error) {
//     console.log(error);
//   }
// }

async function getConversationThread(conversationId: string): Promise<string> {
  try {
    const listing = await capi.getConversationsEmailMessages(conversationId);
    const nonCustomerMessages = (listing.entities ?? []).filter(
      entity => entity.from?.email && !isCustomerEmail(entity.from.email)
    );

    if (nonCustomerMessages.length === 0) {
      return "<p>No messages found in this conversation.</p>";
    }

    const messageHtmlParts: string[] = [];

    for (const preview of nonCustomerMessages) {
      if (!preview.id) continue;

      const msg = await capi.getConversationsEmailMessage(conversationId, preview.id);

      const formatAddress = (a: platformClient.Models.EmailAddress) =>
        a.name ? `${a.name} &lt;<a href="mailto:${a.email}">${a.email}</a>&gt;` : `<a href="mailto:${a.email}">${a.email}</a>`;

      const from = msg.from?.email ? formatAddress(msg.from) : "—";

      const formatAddressList = (list?: platformClient.Models.EmailAddress[]) =>
        list && list.length > 0 ? list.map(formatAddress).join(", ") : null;

      const toStr = formatAddressList(msg.to);
      const ccStr = formatAddressList(msg.cc);

      const date = preview.time
        ? new Date(preview.time).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      const subject = msg.subject ?? preview.subject ?? "(no subject)";
      const body = msg.htmlBody || (msg.textBody ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${msg.textBody}</pre>` : "");

      messageHtmlParts.push(`
        <div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000">
          <p style="margin:0"><b>From:</b> ${from}</p>
          ${date ? `<p style="margin:0"><b>Sent:</b> ${date}</p>` : ""}
          ${toStr ? `<p style="margin:0"><b>To:</b> ${toStr}</p>` : ""}
          ${ccStr ? `<p style="margin:0"><b>CC:</b> ${ccStr}</p>` : ""}
          <p style="margin:0"><b>Subject:</b> ${subject}</p>
          <br>
          ${body}
        </div>`);
    }

    return messageHtmlParts.join('<hr style="border:none;border-top:1px solid #d1d5db;margin:16px 0">');
  } catch (error) {
    console.error("Failed to load conversation thread:", error);
    return "<p>Failed to load conversation thread.</p>";
  }
}

// function getFirstShortId(
//   entities: platformClient.Models.EmailMessagePreviewListing
// ) {
//   for (let entity of entities.entities!) {
//     if (entity.id && entity.id.length < 37) {
//       return entity.id;
//     }
//   }
//   return null; // Return null if no such ID is found
// }

const CUSTOMER_DOMAINS = new Set([
  'bigbank.ee', 'bigbank.lv', 'bigbank.lt', 'bigbank.at', 'bigbank.fi',
  'bigbank.se', 'bigbank.de', 'bigbank.bg', 'bigbank.nl',
  'sissenoudekeskus.ee', 'seb.ee', 'seb.lv', 'seb.lt'
]);

function isCustomerEmail(email: string | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return CUSTOMER_DOMAINS.has(domain);
}

// function getFirstNonCustomerEmailId(data: platformClient.Models.EmailMessagePreviewListing) {
//   // Find the first entity where from.email domain is not bigbank.ee or bigbank.lv or other country as well as not tootukassa or not ergo or not seb
//   if (!data.entities) {
//     return null;
//   }
//   const firstNonCustomer = data.entities.find(entity => {
//     if (!entity.from || !entity.from.email) {
//       return null;
//     }
//     return !isCustomerEmail(entity.from.email);
//   });

//   return firstNonCustomer ? firstNonCustomer.id : data.entities[data.entities.length - 1].id;
// }

async function claimEmail(conversationId: string, participantId: string) {
  // if (selectedStatus !== "In Queue") {
  //   console.log("Email is not in queue");
  //   return;
  // }
  if (!user) {
    console.error("User not found");
    return;
  }
  try {
    // assigning conversation to app user

    let body = {
      userId: user.id,
    };
    await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      body
    );

    const conversation = await capi.getConversationsEmail(conversationId);
    console.log("conversation", conversation);
    if (!user.id) {
      console.error("User ID not found");
      return;
    }
    //function for 1000ms delay
    await delay(1000);

    const newParticipantId = getParticipantIdByUserId(conversation, user.id);
    if (!newParticipantId) {
      console.error("No participant found for user ID", user.id);
      return;
    }
    // console.log("newParticipantId", newParticipantId);
    let body2 = {
      state: "connected",
    };
    await capi.patchConversationsEmailParticipant(
      conversationId,
      newParticipantId,
      body2
    );
    //@ts-ignore
    document.getElementById("preview-modal")!.close();
  } catch (error) {
    console.error("claim email error", error);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getParticipantIdByUserId(
  conversation: any,
  userId: string
): string | null {
  for (const participant of conversation.participants) {
    if (participant.user && participant.user.id === userId) {
      return participant.id;
    }
  }
  return null; // Return null if no matching participant is found
}

function populateTableData(emailList: EmailListElement[]) {
  let table = document.getElementById("tbody");
  if (!table) {
    return;
  }
  emailList.forEach((email) => {
    // console.log("email", email);

    addRow(
      email.conversationId!,
      email.firstMessage!,
      email.lastMessage!,
      email.from!,
      email.to!,
      email.subject!,
      email.status!,
      email.firstQueue!,
      email.queue!,
      email.lastAgent!,
      email.lastACDparticipant!
    );
  });
  document.getElementById("loading")!.style.display = "none";
}

function populateQueueStats(emailList: EmailListElement[]) {
  const tbody = document.getElementById("queue-stats-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const counts: Record<string, number> = {};
  const oldestMessage: Record<string, number> = {};
  for (const email of emailList) {
    const queueName = email.queue || "Unknown";
    if (queueName=="Unknown") continue
    counts[queueName] = (counts[queueName] || 0) + 1;
    const msgTime = email.lastMessage ? new Date(email.lastMessage).getTime() : Date.now();
    if (oldestMessage[queueName] === undefined || msgTime < oldestMessage[queueName]) {
      oldestMessage[queueName] = msgTime;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const top5 = sorted.slice(0, 5);
  const othersTotal = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
  const pieData: [string, number][] = [...top5];
  if (othersTotal > 0) pieData.push(["Others", othersTotal]);
  renderQueuePieChart(pieData);

  for (const [name, count] of sorted) {
    const waitMs = Date.now() - oldestMessage[name];
    // @ts-ignore
    const waitFormatted = new Intl.DurationFormat("en", { style: "narrow", fields: ["day", "hour", "minute"] }).format(convertToDuration(waitMs));
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.dataset.queue = name;
    tr.innerHTML = `<td>${name}</td><td style="text-align: right;">${count}</td><td>${waitFormatted}</td>`;
    tbody.appendChild(tr);
  }

  queueCounts = counts;
  refreshQueueFilterLabels();
}

function refreshQueueFilterLabels() {
  const filterList = document.getElementById("queue-filter-value");
  if (!filterList) return;
  const selectedValue = (filterList as HTMLSelectElement).value;
  filterList.querySelectorAll("gux-option").forEach(option => {
    const queueName = option.getAttribute("value")!;
    if (!queueName) return;
    const count = queueCounts[queueName] || 0;
    const isSelected = queueName === selectedValue;
    (option as HTMLElement).innerHTML = (!isSelected && count > 0)
      ? `<span style="display:flex;justify-content:space-between;width:100%"><span>${queueName}</span><span>${count}</span></span>`
      : queueName;
  });
}

function renderQueuePieChart(data: [string, number][]) {
  const container = document.getElementById("queue-stats-chart");
  if (!container) return;

  const total = data.reduce((sum, [, c]) => sum + c, 0);
  if (total === 0) { container.innerHTML = ""; return; }

  const colors = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#bab0ac"];
  const cx = 110, cy = 110, r = 90;

  let paths = "";
  let startAngle = -Math.PI / 2;
  data.forEach(([, count], i) => {
    const angle = (count / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${colors[i % colors.length]}" stroke="white" stroke-width="1.5"><title>${data[i][0]}: ${count}</title></path>`;
    startAngle = endAngle;
  });

  let legend = "";
  data.forEach(([name, count], i) => {
    const pct = Math.round((count / total) * 100);
    legend += `<g transform="translate(0,${i * 28})">
      <rect width="13" height="13" rx="2" fill="${colors[i % colors.length]}"/>
      <text x="19" y="11" font-size="12" fill="currentColor">${name} — ${count} (${pct}%)</text>
    </g>`;
  });

  container.innerHTML = `<svg viewBox="0 0 520 220" width="520" height="220" style="overflow:visible;font-family:inherit">
    <g>${paths}</g>
    <g transform="translate(230,10)">${legend}</g>
  </svg>`;
}

document.getElementById("queue-stats-tbody")!.addEventListener("click", function (e) {
  const row = (e.target as HTMLElement).closest("tr") as HTMLTableRowElement | null;
  if (!row) return;

  const queueName = row.dataset.queue || "";
  const searchValue = (document.querySelector("[name=search-field]") as HTMLInputElement).value;
  const statusValue = (document.querySelector("[name=status-field]") as HTMLSelectElement).value;

  // Hide the stats panel
  document.getElementById("queue-stats-panel")!.style.display = "none";

  // Reflect selection in the queue filter dropdown
  const queueDropdown = document.getElementById("queue-filter-field") as any;
  queueDropdown.value = queueName;
  queueDropdown.guxForceUpdate?.();

  filterTable(searchValue, statusValue, queueName);
});

function addRow(
  this: any,
  id: string,
  firstMessage: string,
  lastMessage: string,
  from: string,
  to: string,
  subject: string,
  status: string,
  firstQueue: string,
  queue: string,
  lastAgent: string,
  participantId?: string
) {
  let table = document.getElementById("tbody");
  let row = document.createElement("tr");
  let select = document.createElement("td");
  // let T_originating_direction = document.createElement("td");
  let T_first_message = document.createElement("td");
  let T_last_message = document.createElement("td");
  let T_processingTime = document.createElement("td");
  let T_from = document.createElement("td");
  let T_to = document.createElement("td");
  let T_subject = document.createElement("td");
  T_subject.style.maxWidth = "500px";
  T_subject.style.wordBreak = "break-word";

  let T_status = document.createElement("td");
  let T_last_agent = document.createElement("td");
  let T_first_queue = document.createElement("td");
  let T_queue = document.createElement("td");
  let T_participantId = document.createElement("td");
  let T_action = document.createElement("td");

  // T_originating_direction.classList.add("size-x");
  // T_start_date.classList.add("size-x");
  // T_end_date.classList.add("end-column");
  // T_from.classList.add("size-l");
  // T_subject.classList.add("subject-column");
  // T_status.classList.add("status-column");
  // T_assigned_to.classList.add("size-x");
  // T_last_agent.classList.add("size-l");
  // T_queue.classList.add("size-m");
  // T_wrapUp.classList.add("size-l");
  // T_external_tag.classList.add("size-l");

  row.id = id;
  row.setAttribute("data-row-id", id);
  status == "In Queue" || status == "Alerting" || status == "Parked" || status == "Interacting" || status == "On Hold"
    ? (select.innerHTML = "<gux-row-select></gux-row-select>")
    : (select.innerHTML = "<gux-row-select disabled></gux-row-select>");
  // T_originating_direction.innerHTML = originating_direction;
  T_first_message.innerHTML = `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(firstMessage))}`;

  T_last_message.innerHTML = `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(lastMessage))}`;

  const processingTime = Math.round(
    new Date().getTime() - new Date(lastMessage).getTime()
  );
  // console.log("processingTime", processingTime);
  // @ts-ignore
  T_processingTime.innerHTML = new Intl.DurationFormat("en", {
    style: "narrow",
    fields: ["day", "hour", "minute"],
  }).format(convertToDuration(processingTime));

  const threshold = 7 * 24 * 60 * 60 * 1000; // 7*24H

  // Change row color if processing time is larger than the threshold
  if (processingTime > threshold) {
    // console.log("processing time is larger than threshold");
    T_processingTime.style.backgroundColor = "lightcoral"; // Change to your desired color
  }

  T_from.innerHTML = `<gux-truncate>${from}</gux-truncate>`;
  T_to.innerHTML = `<gux-truncate>${to}</gux-truncate>`;
  T_subject.innerHTML = `<gux-truncate>${subject}</gux-truncate>`;
  T_subject.style.maxWidth = "500px"
  T_status.innerHTML = status;
  // T_routing_state.innerHTML = routing_state;
  // T_assigned_to.innerHTML = assigned_to;
  T_last_agent.innerHTML = lastAgent;
  T_queue.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  T_first_queue.innerHTML = `<gux-truncate>${firstQueue}</gux-truncate>`;
  T_first_queue.style.display = "none";
  T_participantId.textContent = participantId || "";
  T_participantId.style.display = "none";
  //action buttons
  let T_actionButtonDiv = document.createElement("div");
  T_actionButtonDiv.classList.add("button-container");
  T_action.appendChild(T_actionButtonDiv);
  let T_action_viewButton = document.createElement("gux-button");
  T_action_viewButton.setAttribute("accent", "primary");
  T_action_viewButton.onclick = previewEmail.bind(
    this,
    id,
    participantId!,
    status!
  );
  let T_action_viewButton_icon = document.createElement("gux-icon");
  T_action_viewButton_icon.setAttribute("icon-name", "fa/eye-regular");
  T_action_viewButton_icon.setAttribute("screenreader-text", "View");
  T_action_viewButton.appendChild(T_action_viewButton_icon);
  T_actionButtonDiv.appendChild(T_action_viewButton);
  let T_action_claimButton = document.createElement("gux-button");
  T_action_claimButton.setAttribute("accent", "tertiary");
  status == "Interacting" || status == "On Hold"
    ? T_action_claimButton.setAttribute("disabled", "true")
    : null;
  T_action_claimButton.onclick = function () {
    console.log("claim button clicked", id);
    claimEmail(id, participantId!);
  };
  let T_action_claimButton_icon = document.createElement("gux-icon");
  T_action_claimButton_icon.setAttribute("icon-name", "arrow-down");
  T_action_claimButton_icon.setAttribute("screenreader-text", "View");
  T_action_claimButton.appendChild(T_action_claimButton_icon);
  T_actionButtonDiv.appendChild(T_action_claimButton);

  // T_action.innerHTML = `<gux-button accent="danger" id="view-${id}">
  //   <gux-icon
  //     icon-name="fa/eye-regular"
  //     screenreader-text="This will be read by a screen reader"
  //   ></gux-icon
  // ></gux-button>`;
  // if (status === "In Queue") {
  //   T_assigned_to.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  // } else if (status === "Parked") {
  //   T_assigned_to.innerHTML = `<gux-truncate><p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p></gux-truncate>`;
  // }
  // T_queue.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  // T_wrapUp.innerHTML = wrapUp;
  // T_external_tag.innerHTML = external_tag;

  // row.addEventListener("click", function (e:MouseEvent) {
  //   console.log("row clicked", this);
  //   const conversationId = this.id;
  //   const conversationEnd = this.querySelector(".end-column").textContent;
  //   const subject = this.querySelector(".subject-column").textContent || "";
  //   const status = this.querySelector(".status-column").textContent || "";
  //   console.log("conversationStatus", status);
  //   console.log("conversationSubject", subject);
  //   console.log("conversationEnd", conversationEnd);
  //   rowClickHandler(conversationId, conversationEnd, status, subject);
  // });

  row.appendChild(select);
  // row.appendChild(T_originating_direction);
  row.appendChild(T_first_message);
  row.appendChild(T_last_message);
  row.appendChild(T_processingTime);
  row.appendChild(T_from);
  row.appendChild(T_to);
  row.appendChild(T_subject);
  row.appendChild(T_status);
  row.appendChild(T_last_agent);
  row.appendChild(T_first_queue);
  row.appendChild(T_queue);
  // row.appendChild(T_wrapUp);
  // row.appendChild(T_external_tag);
  row.appendChild(T_participantId);
  row.appendChild(T_action);

  table!.appendChild(row);
}

function convertToDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return {
    days,
    hours,
    minutes,
  };
}

function popUp(
  id: Number,
  type: "error" | "info" | "success" | undefined,
  message: string
) {
  let time = id.toString();
  // console.log("type", type);
  let options = {
    type: type,
    id: time,
    timeout: 3,
    showCloseButton: true,
  };
  myClientApp.alerting.showToastPopup("", message, options);
}

async function previewEmail(id: string, participantId: string, status: string) {
  selectedConversationId = id;
  selectedParticipantId = participantId;
  selectedStatus = status;
  console.log("view button clicked", id);
  const emailContent = await getConversationThread(id);
  if (!emailContent) {
    console.error("No email content found");
    return;
  }
  // if (status == "Interacting" || status == "On Hold") {
  //   currentEmailClaim = "disabled";
  // } else {
  //   currentEmailClaim = "";
  // }
  document.getElementById("preview-modal-content")!.innerHTML = emailContent;
  // document.getElementById("claim-email")!.setAttribute("disabled", currentEmailClaim);
  document.getElementById("claim-email")!.setAttribute("disabled", "false");
  status == "Interacting" || status == "On Hold"
    ? document.getElementById("claim-email")!.setAttribute("disabled", "true")
    : status == "Disconnected" ? document.getElementById("claim-email")!.innerHTML = "Reconnect" : null;

  //@ts-expect-error
  document.getElementById("preview-modal")!.showModal();
}

async function disconnectEmail(conversationId: string) {
  try {
    const disconnectedConversation = await capi.postConversationDisconnect(
      conversationId
    );
    console.log("disconnectedConversation", disconnectedConversation);
    const conversation = await capi.getConversation(conversationId);


    const participantObject = conversation.participants.filter((p) => (p.purpose === "external" || p.purpose == "customer"))[0];
    console.log("participantObject", participantObject);
    const participantKey = `Disconnected in app`
    const body2: { attributes: { [key: string]: string } } = { attributes: {} }
    body2.attributes[participantKey] = `${new Date().toLocaleString()} by user?.name` || "Unknown"
    if (!participantObject.id) return
    await capi.patchConversationsEmailParticipantAttributes(conversationId, participantObject.id, body2)

    // let communicationId = participantObject.emails![0].id;
    // let body = {
    //   wrapup: {
    //     notes: `Email disconnected in Email Preview by ${user.name}`,
    //   },
    //   state: "disconnected",
    // };
    // if (!communicationId) {
    //   console.error("No communication ID found");
    //   return;
    // }
    // const result = await capi.patchConversationsEmailParticipantCommunication(
    //   conversationId,
    //   participantId,
    //   communicationId,
    //   body
    // );
    // console.log("result", result);
  } catch (error) {
    console.error("Error: ", error);
  }
}

async function getUsers() {
  try {
    const list = document.getElementById("listUsers")!;
    let pageNumber = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const users = await uapi.getUsers({
        pageSize: 500,
        pageNumber,
        // expand: ["presence"],
        state: "active",
      });

      if (!users?.entities) break;

      for (const user of users.entities) {
        const item = document.createElement("gux-option");
        item.innerText = user.name!;
        item.setAttribute("value", user.id!);
        list.appendChild(item);
      }

      hasNextPage = !!users.nextUri;
      pageNumber++;
    }
  } catch (error) {
    console.error("Failed to load users:", error);
  }
}

async function getQueues() {
  try {
    let queues = await rapi.getRoutingQueues({
      pageSize: 500,
    });
    if (!queues) {
      return;
    }
    // console.log(queues);
    let list = document.getElementById("listQueues")!;
    let filterList = document.getElementById("queue-filter-value")!;
    for (const queue of queues.entities!) {
      let item = document.createElement("gux-option");
      item.innerText = queue.name!;
      item.setAttribute("value", queue.id!);
      list.appendChild(item);

      if (queue.name!.toLowerCase().includes("email") || queue.name!.toLowerCase().includes("ootel")) {
        let filterItem = document.createElement("gux-option");
        filterItem.innerText = queue.name!;
        filterItem.setAttribute("value", queue.name!);
        filterList.appendChild(filterItem);
      }
    }
  } catch (error) {
    console.error("Failed to load queues:", error);
  }
}

function filterTable(searchValue: string, status: string, queue: string = "") {
  const rows = document.querySelectorAll("#tbody tr");
  const headers = document.querySelectorAll("#sortable-table thead th");
  let statusColumnIndex = -1;
  let queueColumnIndex = -1;

  // Find the index of the "Status" and "Queue" columns
  headers.forEach((header, index) => {
    if (header.getAttribute("data-column-name") === "status") {
      statusColumnIndex = index;
    }
    if (header.getAttribute("data-column-name") === "queue") {
      queueColumnIndex = index;
    }
  });

  if (statusColumnIndex === -1) {
    console.error("Status column not found");
    return;
  }

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    let match = false;
    cells.forEach((cell) => {
      if (cell.textContent?.toLowerCase().includes(searchValue.toLowerCase())) {
        match = true;
      }
    });
    const statusCell = cells[statusColumnIndex];
    if (
      status &&
      statusCell &&
      statusCell.textContent?.toLowerCase() !== status.toLowerCase()
    ) {
      match = false;
    }
    if (queue && queueColumnIndex !== -1) {
      const queueCell = cells[queueColumnIndex];
      if (
        queueCell &&
        queueCell.textContent?.toLowerCase() !== queue.toLowerCase()
      ) {
        match = false;
      }
    }
    if (match) {
      row.setAttribute("style", "display: table-row;");
    } else {
      row.setAttribute("style", "display: none;");
    }
  });

  updateFilterInfo(searchValue, status, queue);
}

function updateFilterInfo(searchValue: string, status: string, queue: string) {
  const bar = document.getElementById("filter-info-bar");
  if (!bar) return;

  const allRows = document.querySelectorAll("#tbody tr");
  const total = allRows.length;
  const visible = Array.from(allRows).filter(
    (r) => (r as HTMLElement).style.display !== "none"
  ).length;

  if (!searchValue && !status && !queue) {
    bar.style.display = "none";
    return;
  }

  const parts: string[] = [];
  if (searchValue) parts.push(`Search: "${searchValue}"`);
  if (status) parts.push(`Status: ${status}`);
  if (queue) parts.push(`Queue: ${queue}`);

  bar.textContent = `${parts.join(" · ")} · Showing ${visible} of ${total} emails`;
  bar.style.display = "block";
}

// function getQueueOccurrences(emailsList:any): { queueName: string; count: number }[] {
//   const queueCounts: Record<string, number> = {};

//   emailsList.forEach((email:any) => {
//     const queueName = email.queue || "Unknown"; // Use "Unknown" if queue name is not available
//     queueCounts[queueName] = (queueCounts[queueName] || 0) + 1;
//   });

//   return Object.entries(queueCounts).map(([queueName, count]) => ({
//     queueName,
//     count
//   }));
// }

// functions for historical search functionality

async function getLakeTime() {
  const lake = await capi.getAnalyticsConversationsDetailsJobsAvailability();
  (
    document.getElementById("lakeTime") as HTMLInputElement
  ).innerText = `Data available from: ${new Date(
    lake.dataAvailabilityDate as string
  ).toLocaleString()}`;
}
function months12() {
  let today = new Date();
  let aMonthAgo = new Date();
  aMonthAgo.setMonth(aMonthAgo.getMonth() - 12);
  // prettier-ignore
  (document.getElementById('datepicker') as HTMLInputElement).value = `${aMonthAgo.getFullYear()}-${String(aMonthAgo.getMonth() + 1).padStart(2, '0')}-${String(aMonthAgo.getDate()).padStart(2, '0')}/${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function months24() {
  let today = new Date();
  let aMonthAgo = new Date();
  aMonthAgo.setMonth(aMonthAgo.getMonth() - 24);
  // prettier-ignore
  (document.getElementById('datepicker') as HTMLInputElement).value = `${aMonthAgo.getFullYear()}-${String(aMonthAgo.getMonth() + 1).padStart(2, '0')}-${String(aMonthAgo.getDate()).padStart(2, '0')}/${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function getUTCOffset() {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60; // Invert for standard UTC offset representation

  let offsetString = "";
  if (offsetHours === 0) {
    offsetString = "+00:00";
  } else {
    const sign = offsetHours > 0 ? "+" : "-";
    const absHours = Math.abs(Math.floor(offsetHours));
    const minutes = Math.abs(Math.floor((offsetHours - absHours) * 60));
    const hoursString = absHours.toString().padStart(2, "0");
    const minutesString = minutes.toString().padStart(2, "0");
    offsetString = `${sign}${hoursString}:${minutesString}`;
  }
  const timeZoneElement = document.getElementById(
    "timeZone"
  ) as HTMLInputElement;
  if (timeZoneElement) {
    timeZoneElement.value = offsetString;
  }
}

// download csv
// function buildCsv() {
//   let csvContent =
//     "data:text/csv;charset=utf-8," +
//     csvRows.map((e) => e.join(",")).join("\r\n");
//   const encodedUri = encodeURI(csvContent);
//   const link = document.createElement("a");
//   link.setAttribute("href", encodedUri);
//   link.setAttribute("download", "report.csv");
//   document.body.appendChild(link);
//   link.click();
// }

async function clearData() {
  console.log("%cClearing data", "color: green");
  const tableLocation = document.getElementById("tableLocation");
  if (tableLocation) {
    tableLocation.innerHTML = "";
  }
  const spinner = document.getElementById("spinner");
  if (spinner) {
    spinner.style.display = "none";
  }
  const download = document.getElementById("download");
  if (download) {
    download.style.display = "none";
  }
  csvRows = [];
  document.getElementById(
    "tCount"
  )!.innerText = `Total Count: 0`;
}

function notification(type: string, message: string) {
  if (window.location !== window.parent.location) {
    // if in an iframe
    myClientApp.alerting.showToastPopup(type, message);
    return;
  }
  window.alert(message);
  return;
}

// dynamic table creation
async function buildTableRows(rows: any) {
  for (const row of rows) {
    let tableBody = document.getElementById("tableBody");
    if (!tableBody) {
      // create the top table row if its not already there
      console.log("Creating table");
      let top = document.getElementById("tableLocation") as HTMLElement;
      let guxTable = document.createElement("gux-table");
      let table = document.createElement("table");
      let header = document.createElement("thead");
      let headerRow = document.createElement("tr");
      let tbody = document.createElement("tbody");

      headerRow.setAttribute("data-row-id", "head");
      tbody.setAttribute("id", "tableBody");
      table.setAttribute("slot", "data");
      guxTable.setAttribute("resizable-columns", "");

      header.appendChild(headerRow);
      guxTable.appendChild(table);
      table.appendChild(header);
      table.appendChild(tbody);

      // create column names on first row
      for (const item of row) {
        if (item === "Disconnected in App") continue;
        let th = document.createElement("th");
        th.setAttribute("data-column-name", item);
        th.style.textWrap = "auto";
        if (item === "Subject") {
          th.style.maxWidth = "200px";
          th.style.overflow = "hidden";
          th.style.textOverflow = "ellipsis";
        }
        th.innerHTML = item;
        th.title = item;
        headerRow.appendChild(th);
      }
      top.appendChild(guxTable);
      continue;
    }
    if (tableBody) {
      // add data to the row
      let tr = document.createElement("tr");
      let columnIndex = 0;
      for (const item of row) {
        const columnName = csvRows[0][columnIndex];
        columnIndex++;
        if (columnName === "Disconnected in App") continue;
        let column = document.createElement("td");
        if (columnName === "Subject") {
          column.style.maxWidth = "200px";
          column.style.overflow = "hidden";
          column.style.textOverflow = "ellipsis";
          column.style.whiteSpace = "nowrap";
          column.title = item; // Add tooltip with full subject text
        }
        if (item === "OpenBtn") {
          let btnOpen = document.createElement("gux-button");
          btnOpen.setAttribute("accent", "secondary");
          btnOpen.setAttribute("size", "small");
          btnOpen.innerText = "Open in Genesys";
          btnOpen.onclick = function () {
            myClientApp.conversations.showInteractionDetails(
              (this as HTMLElement).parentNode!.parentNode!.firstChild!
                .textContent!
            );
          };
          column.appendChild(btnOpen);
        } else if (item === "PreviewBtn") {
          let btnPreview = document.createElement("gux-button");
          btnPreview.setAttribute("accent", "secondary");
          btnPreview.setAttribute("size", "small");
          btnPreview.innerText = "Preview";
          btnPreview.onclick = function () {
            previewEmail(
              (this as HTMLElement).parentNode!.parentNode!.firstChild!
                .textContent!,
              "N/A",
              "Disconnected"
            );
          };
          row[1] === "voice" ? btnPreview.setAttribute("disabled", "true") : null;

          column.appendChild(btnPreview);
        } else {
          column.innerHTML = item;
        }
        tr.appendChild(column);
      }
      tableBody.appendChild(tr);
    }
  }
}

async function getData(rowFilter?: (row: any[]) => boolean) {
  console.log("%cGetting data", "color: green");
  csvRows = [];
  document.getElementById("tableLocation")!.innerHTML = "";
  document.getElementById("loading")!.style.display = "block";
  let conversations: any = {};
  try {
    conversations = await more31Days();
    // console.log("Conversations: ", conversations);
    document.getElementById(
      "tCount"
    )!.innerText = `Total Count: ${conversations.conversations.length}`;

    if (conversations.conversations.length === 0) {
      notification("Info", "No conversations found for the given criteria.");
      document.getElementById("loading")!.style.display = "none";
      return;
    }

    const userIds: string[] = conversations.conversations
      .map(
        (conv: any) =>
          conv.participants.find((p: any) => p.purpose == "agent")?.userId
      )
      .filter((userId: string | undefined) => userId !== undefined);
    const uniqueUserIds = Array.from(new Set(userIds));
    const allUserEntities: any[] = [];
    for (let i = 0; i < uniqueUserIds.length; i += 100) {
      const batch = uniqueUserIds.slice(i, i + 100);
      const result = await uapi.getUsers({ pageSize: 100, id: batch });
      if (result?.entities) allUserEntities.push(...result.entities);
    }
    const users = { entities: allUserEntities };

    for (const conv of conversations.conversations) {

      // add the column names to the first row
      if (csvRows.length === 0) {
        csvRows.push(["ConversationId"]);
        csvRows[0].push('Media Type')
        csvRows[0].push("First queue");
        csvRows[0].push("Subject");
        csvRows[0].push("First Agent");
        csvRows[0].push("Start Date");
        csvRows[0].push("Open");
        csvRows[0].push("Preview");
        csvRows[0].push("Disconnected in App");

      }
      // add the data to the row
      csvRows.push([conv.conversationId]);
      csvRows[csvRows.length - 1].push(conv.participants[0].sessions[0].mediaType)
      csvRows[csvRows.length - 1].push(
        conv.participants.find((p: any) => p.purpose == "acd")
          ?.participantName || "N/A"
      );
      csvRows[csvRows.length - 1].push(
        conv.participants.find(
          (p: any) => p.purpose == "customer" || p.purpose == "external"
        )?.sessions[0]?.segments[0]?.subject || "N/A"
      );
      let agentName =
        conv.participants.find((p: any) => p.purpose == "agent")
          ?.participantName || "N/A";
      if (agentName === "N/A") {
        // try to get from userId
        const userId = conv.participants.find(
          (p: any) => p.purpose == "agent"
        )?.userId;
        const user = users.entities?.find((entity) => entity.id === userId);
        const name = user ? user.name : null;
        if (name) {
          agentName = name;
        }
      }

      csvRows[csvRows.length - 1].push(agentName);

      csvRows[csvRows.length - 1].push(
        new Date(conv.conversationStart).toLocaleString().replace(",", " ")
      );
      csvRows[csvRows.length - 1].push("OpenBtn");
      csvRows[csvRows.length - 1].push("PreviewBtn");

      const firstCustomer = conv.participants.find(
        (p: any) => p.purpose == "customer" || p.purpose == "external"
      );
      const disconnectedInApp = firstCustomer?.attributes
        ? Object.keys(firstCustomer.attributes).some((key: string) =>
            key.toLowerCase().startsWith("Disconnected")
          )
        : false;
      csvRows[csvRows.length - 1].push(disconnectedInApp);
    }
    const rowsToDisplay = rowFilter
      ? [csvRows[0], ...csvRows.slice(1).filter(rowFilter)]
      : csvRows;
    await buildTableRows(rowsToDisplay);
    document.getElementById("loading")!.style.display = "none";
    // document.getElementById("download").style.display = "block";
  } catch (err) {
    console.log("Error: ", err);
    notification("Error", `Error: ${err}`);
  }
}

async function more31Days() {
  let job: any = {};
  if ((document.getElementById("type") as HTMLInputElement).value === "ani") {
    job = await createJobAni();
    console.log("Job created: ", job);
  }
  if ((document.getElementById("type") as HTMLInputElement).value === "email") {
    job = await createJobRemote();
    console.log("Job created: ", job);
  }
  if (
    (document.getElementById("type") as HTMLInputElement).value ===
    "externalTag"
  ) {
    job = await createJobExternalTag();
    console.log("Job created: ", job);
  }
  let jobStatus: any = await getJobStatus(job.jobId);
  console.log("Job status: ", jobStatus);
  while (jobStatus.state !== "FULFILLED") {
    console.log("Waiting for job to complete...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    jobStatus = await getJobStatus(job.jobId);
    console.log("Job status: ", jobStatus);
  }
  if (jobStatus.state === "FAILED") {
    throw new Error("Job failed to complete.");
  }
  const results = await getJobResults(job.jobId);
  console.log("Job Results: ", results);
  return results;
}

async function createJobAni() {
  const job = await capi.postAnalyticsConversationsDetailsJobs({
    // prettier-ignore
    interval: `${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[0]}T00:00:00${(document.getElementById('timeZone') as HTMLInputElement).value}/${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[1]}T23:59:59${(document.getElementById('timeZone') as HTMLInputElement).value}`,
    segmentFilters: [
      {
        type: "and",
        predicates: [
          {
            dimension: "ani",
            value: (document.getElementById("input") as HTMLInputElement).value,
          },
        ],
      },
    ],
    orderBy: "conversationStart",
  });
  return job;
}

// async function createJobRemote() {
//   const job = await capi.postAnalyticsConversationsDetailsJobs({
//     // prettier-ignore
//     interval: `${document.getElementById('datepicker').value.split('/')[0]}T00:00:00${document.getElementById('timeZone').value}/${document.getElementById('datepicker').value.split('/')[1]}T23:59:59${document.getElementById('timeZone').value}`,
//     segmentFilters: [
//       {
//         type: "and",
//         predicates: [
//           {
//             dimension: "remote",
//             value: document.getElementById("input").value,
//           },
//         ],
//       },
//     ],
//     orderBy: "conversationStart",
//   });
//   return job;
// }

async function createJobExternalTag() {
  const job = await capi.postAnalyticsConversationsDetailsJobs({
    // prettier-ignore
    interval: `${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[0]}T00:00:00${(document.getElementById('timeZone') as HTMLInputElement).value}/${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[1]}T23:59:59${(document.getElementById('timeZone') as HTMLInputElement).value}`,
    conversationFilters: [
      {
        type: "and",
        predicates: [
          {
            dimension: "externalTag",
            value: (document.getElementById("input") as HTMLInputElement)!
              .value,
          },
        ],
      },
    ],
    orderBy: "conversationStart",
  });
  return job;
}

async function createJobRemote() {
  let query: any =
  {
    // prettier-ignore
    interval: `${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[0]}T00:00:00${(document.getElementById('timeZone') as HTMLInputElement).value}/${(document.getElementById('datepicker') as HTMLInputElement).value.split('/')[1]}T23:59:59${(document.getElementById('timeZone') as HTMLInputElement).value}`,
    segmentFilters: [
      {
        type: "and",
        predicates: [
          {
            dimension: "mediaType",
            value: "email",
          },
        ],
      },
    ],
    orderBy: "conversationStart",
  }
  let searchString = (document.getElementById("input") as HTMLInputElement).value
  if (searchString){
    query.segmentFilters[0].predicates.push =  {
            dimension: "remote",
            value: (document.getElementById("input") as HTMLInputElement).value,
          }
    
  }
  const job = await capi.postAnalyticsConversationsDetailsJobs(query);
  return job;
}

async function getJobStatus(jobId: any) {
  let jobStatus = await capi.getAnalyticsConversationsDetailsJob(jobId);
  return jobStatus;
}

async function getJobResults(jobId: any) {
  let result = await capi.getAnalyticsConversationsDetailsJobResults(jobId);

  if (!result.cursor) {
    console.log("Single page of results");
    return result;
  } else {
    console.log("Multiple pages of results");
    let pages = true;
    let allResults = result;
    while (pages) {
      const nextResult = await capi.getAnalyticsConversationsDetailsJobResults(
        jobId,
        {
          cursor: result.cursor,
        }
      );
      if (
        allResults.conversations !== undefined &&
        nextResult.conversations !== undefined
      ) {
        allResults.conversations = allResults.conversations.concat(
          nextResult.conversations
        );
      }
      result.cursor = nextResult.cursor;
      if (!nextResult.cursor) {
        pages = false;
      }
    }
    return allResults;
  }
}

async function reconnectEmail(conversationId:string) {
  try {
    await capi.postConversationsEmailReconnect(conversationId);
  } catch (error: any) {
    if (error?.code === 'email.reconnect.expired' || error?.status === 400) {
      // Conversation is expired — create a new outbound email with the original thread content
      console.warn("Reconnect not available, creating new conversation:", error?.message ?? error);
      if (!user?.username?.includes("adventus"))
      // remove return statement to enable reconnect
      return
      else{
      const emailConversation = await capi.getConversation(conversationId);

      const externalParticipant = emailConversation.participants?.find(
        p => p.purpose === 'external' || p.purpose === 'customer'
      );
      const acdParticipant = emailConversation.participants?.find(p => p.purpose === 'acd');

      const toAddress = externalParticipant?.address;
      const toName = externalParticipant?.name;
      const queueId = acdParticipant?.queueId;

      const messages = await capi.getConversationsEmailMessages(conversationId);
      const subject = messages.entities?.[0]?.subject ?? "(no subject)";

      const threadHtml = await getConversationThread(conversationId);

      if (!toAddress || !queueId) {
        console.error("Cannot create new conversation: missing customer address or queue", { toAddress, queueId });
        return;
      }

      const createdConversation = await capi.postConversationsEmails({
        provider: "PureCloud Email",
        queueId:"2a40a655-f926-47ca-b2b3-3f0cee219551",
        toAddress,
        toName,
        subject,
        direction:"OUTBOUND",
        // htmlBody: `<br><br><br>${threadHtml}`
      });
      if (!createdConversation.id){
        console.log("error creating new conversation")
        return
      }
      const conversationDraft = await capi.getConversationsEmailMessagesDraft(createdConversation.id)
      const initialDraft = conversationDraft.htmlBody
      conversationDraft.htmlBody = `${initialDraft}<br><br><br>${threadHtml}`
      await capi.putConversationsEmailMessagesDraft(createdConversation.id, conversationDraft)
      const newConversation = await capi.getConversationsEmail(createdConversation.id)
      if (!newConversation.participants) return
      const agentParticipant = newConversation.participants[0]!.id
      if (!agentParticipant) return
      // parking new conversation
      await capi.patchConversationsEmailParticipant(createdConversation.id, agentParticipant, {state: "PARKED"})
      await capi.patchConversationsEmailParticipantParkingstate(createdConversation.id, agentParticipant, {state: "CONNECTED"})
      return;
    }
    console.log("Error reconnecting", error);
  }
  } finally {

//@ts-ignore
       document.getElementById("preview-modal")!.close();
  }


  
}
