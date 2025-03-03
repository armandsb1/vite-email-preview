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

let user: platformClient.Models.UserMe|null = null;
let selectedConversationId = "";
let selectedParticipantId = "";
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
  const selectedOptions = document.querySelectorAll("gux-option-multi.gux-selected");
  console.log("selectedOptions", selectedOptions);
  const selectedValues = Array.from(selectedOptions).map(option => option.getAttribute("value"));
  return selectedValues;
}

// Example usage
const selectedValues = getSelectedColumnValues();
console.log("Selected column values:", selectedValues);


function toggleColumnVisibility(columnName: string | null, isVisible: boolean) {
  if (!columnName) return;

  const headers = document.querySelectorAll(`#sortable-table thead th[data-column-name=${columnName}]`);
  const columnIndex = Array.from(headers).map(header => Array.from(header.parentElement!.children).indexOf(header));

  const rows = document.querySelectorAll("#tbody tr");
  rows.forEach(row => {
    columnIndex.forEach(index => {
      const cell = row.children[index] as HTMLElement;
      if (cell) {
        cell.style.display = isVisible ? "" : "none";
      }
    });
  });

  headers.forEach(header => {
    // @ts-ignore
    header.style.display = isVisible ? "" : "none";
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const checklistItems = document.querySelectorAll("#column-visibility-checklist input[type=checkbox]");
  checklistItems.forEach(item => {
    const target = item as HTMLInputElement;
    const columnName = target.getAttribute("data-column-name");
    const isChecked = target.checked;
    toggleColumnVisibility(columnName, isChecked);
  });
});



document.getElementById("search-value")!.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    const searchField = document.getElementById("search-field") as HTMLSelectElement;

    const searchValue = document.querySelector("[name=search-field]") as HTMLInputElement;
    console.log("searchValue", searchValue.value);
    const statusValue = document.querySelector("[name=status-field]") as HTMLSelectElement;
    filterTable(searchValue.value, statusValue.value);
    searchValue.value = "";
    //@ts-ignore
    searchField.guxForceUpdate();
  }
});

document.getElementById("status-value")!.addEventListener("change", function () {
  const searchValue = (document.querySelector("[name=search-field]") as HTMLInputElement).value;
  const statusValue = (document.querySelector("[name=status-field]") as HTMLSelectElement).value;
  filterTable(searchValue, statusValue);
});

window.addEventListener("click", async function (e) {
  console.log("Window click", e);


  if ((e.target as HTMLElement).id === "column-visibility-setting") {
    console.log("Column visibility button clicked");
    
   
  }
  if ((e.target as HTMLElement).id === "transfer-queue") {
    console.log("Transfer Queue button clicked");
    let selectedQueue = (document.getElementById("listQueues") as HTMLSelectElement).value;
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
      console.log("participantColumnIndex", participantColumnIndex);
      console.log("statusColumnIndex", statusColumnIndex);
    
      let selectedCount = 0;
      for (let i=0; i<rows.length; i++)  {
        let row = rows[i];
        const cells = row.querySelectorAll("td");
        if (
          row?.attributes[2]?.name == "data-selected-row" &&
          cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue"
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
      }
      else {
        await delay(2000);
        getActiveEmails();
      }
    } catch (error) {
      console.error("Error: ", error);
    }
  }

  if ((e.target as HTMLElement).id === "transfer-user") {
    console.log("Transfer User button clicked");
    let selectedUser = (document.getElementById("listUsers") as HTMLSelectElement).value;
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
      for (let i=0; i<rows.length; i++)  {
        let row = rows[i];
        const cells = row.querySelectorAll("td");

        if (
          row?.attributes[2]?.name == "data-selected-row" &&
          cells[statusColumnIndex]?.textContent?.toLowerCase() == "in queue"
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
      }
      else {
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
      if (row?.attributes[2]?.name == "data-selected-row") {
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
      if (row?.attributes[2]?.name == "data-selected-row") {
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
    const searchField = document.getElementById("search-field") as HTMLSelectElement;

    const searchValue = document.querySelector("[name=search-field]") as HTMLInputElement;
    console.log("searchValue", searchValue.value);
    // const statusField = document.getElementById("status-field") as HTMLSelectElement;
    let statusValue = document.querySelector("[name=status-field]") as HTMLSelectElement;
    filterTable(searchValue.value, statusValue.value);
    searchValue.value = "";
    //@ts-ignore
    searchField.guxForceUpdate();
  }

  if ((e.target as HTMLElement).id === "claim-email") {
    console.log("Claim emeail button clicked");
    // if (selectedStatus !== "In Queue" || selectedStatus !== "Parked") {
    //   console.log("Email is not in queue");
    //   return;
    // }
    claimEmail(selectedConversationId, selectedParticipantId);
  }
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
    if (!participantId||!rowId) {
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
    const interactingEmails = getEmailsByStatus(conversations, "agent", "interact", "user");
    const interactingEmailsData = extractEmailData(interactingEmails, "Interacting");
    // console.log("interactingEmails", interactingEmails);
    const parkedEmails = getEmailsByStatus(conversations, "agent", "parked", "user");
    const parkedEmailsData = extractEmailData(parkedEmails, "Parked");
    console.log("parkedEmails", parkedEmails);
    const alertingEmails = getEmailsByStatus(conversations, "agent", "alert");
    const alertingEmailsData = extractEmailData(alertingEmails, "Alerting");
    // console.log("alertingEmails", alertingEmails);
    const heldEmails = getEmailsByStatus(conversations, "agent", "hold", "user");
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
      (a, b) => new Date(b.lastMessage!).getTime() - new Date(a.lastMessage!).getTime()
    );
    document.getElementById("loading")!.style.display = "none";

    populateTableData(emailsList);
  } catch (error) {
    console.error("Error: ", error);
  }
}

function extractEmailData(
  emails: platformClient.Models.AnalyticsConversationWithoutAttributes[] | undefined,
  status: string
) {
  let emailListPart = [];
  if (emails) {
    for (const email of emails) {
      const customerParticipant = email.participants?.filter(
        (p) => p.purpose == "customer" || p.purpose == "external"
      )[0];
      const agentParticipants = email.participants?.filter(
        (p) => p.purpose == "agent" || p.purpose == "user"
      );
      const queueParticipants = email.participants?.filter((p) => p.purpose == "acd");
      console.log("agentParticipants", agentParticipants);
      let emailElement = {
        conversationId: email.conversationId,
        subject: customerParticipant!.sessions![0].segments![0].subject || "",
        from: customerParticipant!.sessions![0].addressFrom,
        to: customerParticipant!.sessions![0].addressTo,
        status: status,
        queue: findLatestInteractParticipant(queueParticipants) || "",
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
  let data: platformClient.Models.AnalyticsConversationQueryResponse = { conversations: [] };
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
              {
                type: "dimension",
                dimension: "originatingDirection",
                operator: "matches",
                value: "inbound",
              },
            ],
          },
        ],
        paging: {
          pageSize: 100,
          pageNumber: 1,
        },
      };

      const periodData = await capi.postAnalyticsConversationsDetailsQuery(body);
      console.log("periodData", periodData);
      if (!periodData.conversations) {
        console.log(`No data found in loop ${i}`);
        break;
      }
      data.conversations = [...data.conversations!, ...periodData.conversations!];
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
            return segment.segmentType === segmentType && !segment.hasOwnProperty("segmentEnd");
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
  )
  console.log(
    "postConversationsEmailParticipantReplace returned successfully.",
    data
  );
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

    const userStatus = await papi.getUserPresencesPurecloud(selectedUserId)
    console.log("userStatus", userStatus);
    
    if (userStatus.presenceDefinition&&userStatus.presenceDefinition.systemPresence == "Offline") {
      console.log("User is offline");
      popUp(Date.now(), 'error', 'User is offline')
      return;
    }
    const body = {
      userId: selectedUserId,
      transferType: "Unattended"
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

async function getConversationPreview(conversationId: string) {
  try {
    const messages = await capi.getConversationsEmailMessages(conversationId);
    console.log("messages :", messages);
    //skipping autoreply if that was the last message in thread
    const messageId = getFirstShortId(messages);
    if (!messageId) {
      console.error("No message ID found");
      return;
    }
    console.log("messageId :", messageId);
    const messageContent = await capi.getConversationsEmailMessage(conversationId, messageId);
    console.log("messageContent :", messageContent);
    let body = "";
    if (messageContent.htmlBody) {
      body = messageContent.htmlBody;
    } else {
      body = messageContent.textBody;
    }
    return body;
  } catch (error) {
    console.log(error);
  }
}

function getFirstShortId(entities: platformClient.Models.EmailMessagePreviewListing) {
  for (let entity of entities.entities!) {
    if (entity.id && entity.id.length < 37) {
      return entity.id;
    }
  }
  return null; // Return null if no such ID is found
}

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
    await capi.postConversationsEmailParticipantReplace(conversationId, participantId, body);

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
    console.log("newParticipantId", newParticipantId);
    let body2 = {
      state: "connected",
    };
    await capi.patchConversationsEmailParticipant(conversationId, newParticipantId, body2);
    //@ts-ignore
    document.getElementById("preview-modal")!.close();
  } catch (error) {
    console.error("claim email error", error);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getParticipantIdByUserId(conversation: any, userId: string): string | null {
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
    console.log("email", email);

    addRow(
      email.conversationId!,
      email.firstMessage!,
      email.lastMessage!,
      email.from!,
      email.to!,
      email.subject!,
      email.status!,
      email.queue!,
      email.lastAgent!,
      email.lastACDparticipant!
    );
  });
  document.getElementById("loading")!.style.display = "none";
}

function addRow(
  this: any,
  id: string,
  firstMessage: string,
  lastMessage: string,
  from: string,
  to: string,
  subject: string,
  status: string,
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
  let T_status = document.createElement("td");
  let T_last_agent = document.createElement("td");
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
  status == "In Queue" || status == "Alerting" || status == "Parked"
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
    (new Date().getTime() - new Date(lastMessage).getTime())
  )
  console.log("processingTime", processingTime);
  // @ts-ignore
  T_processingTime.innerHTML =  new Intl.DurationFormat("en", { style: "narrow" , fields: ["day", "hour", "minute"]}).format(convertToDuration(processingTime))

  const threshold = 7*24*60*60*1000; // 7*24H

  // Change row color if processing time is larger than the threshold
  if (processingTime > threshold) {
    console.log("processing time is larger than threshold");
    T_processingTime.style.backgroundColor = "lightcoral"; // Change to your desired color
  }

  T_from.innerHTML = `<gux-truncate>${from}</gux-truncate>`;
  T_to.innerHTML = `<gux-truncate>${to}</gux-truncate>`;
  T_subject.innerHTML = `<gux-truncate>${subject}</gux-truncate>`;
  T_status.innerHTML = status;
  // T_routing_state.innerHTML = routing_state;
  // T_assigned_to.innerHTML = assigned_to;
  T_last_agent.innerHTML = lastAgent;
  T_queue.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  T_participantId.textContent = participantId || "";
  T_participantId.style.display = "none";
  //action buttons
  let T_actionButtonDiv = document.createElement("div");
  T_actionButtonDiv.classList.add("button-container");
  T_action.appendChild(T_actionButtonDiv);
  let T_action_viewButton = document.createElement("gux-button");
  T_action_viewButton.setAttribute("accent", "primary");
  T_action_viewButton.onclick = previewEmail.bind(this, id, participantId!, status!);
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

function popUp(id:Number, type:"error"|"info"|"success"|undefined, message:string) {
  let time = id.toString()
  console.log("type", type);
  let options = {
    type: type,
    id: time,
    timeout: 3,
    showCloseButton: true,
  }
  myClientApp.alerting.showToastPopup('', message, options)
}

async function previewEmail(id: string, participantId: string, status: string) {
  selectedConversationId = id;
  selectedParticipantId = participantId;
  selectedStatus = status;
  console.log("view button clicked", id);
  const emailContent = await getConversationPreview(id);
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
  document.getElementById("claim-email")!.setAttribute("disabled", "false") 
  status == "Interacting" || status == "On Hold"
  ? document.getElementById("claim-email")!.setAttribute("disabled", "true")  : null;

  //@ts-expect-error
  document.getElementById("preview-modal")!.showModal();
}

async function disconnectEmail(conversationId: string) {
  try {
    // const conversation = await capi.getConversation(conversationId);
    const disconnectedConversation=await capi.postConversationDisconnect(conversationId)
    console.log("disconnectedConversation",disconnectedConversation)
    // const participantObject = conversation.participants.filter((p) => p.id === participantId)[0];
    // console.log("participantObject", participantObject);
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
  // TODO - if more then 500 active users in ORG need setup paging
  let users = await uapi.getUsers({
    pageSize: 500,
    expand: ["presence"],
    state: "active",
  });
  if (!users) {
    return;
  }
  console.log(users);
  let list = document.getElementById("listUsers")!;
  for (const user of users.entities!) {
    let item = document.createElement("gux-option");
    item.innerText = user.name!;
    item.setAttribute("value", user.id!);
    list.appendChild(item);
  }
}

async function getQueues() {
  // TODO - if more then 500 active users in ORG need setup paging
  let queues = await rapi.getRoutingQueues({
    pageSize: 500,
  });
  if (!queues) {
    return;
  }
  console.log(queues);
  let list = document.getElementById("listQueues")!;
  for (const queue of queues.entities!) {
    let item = document.createElement("gux-option");
    item.innerText = queue.name!;
    item.setAttribute("value", queue.id!);
    list.appendChild(item);
  }
}

function filterTable(searchValue: string, status: string) {
  const rows = document.querySelectorAll("#tbody tr");
  const headers = document.querySelectorAll("#sortable-table thead th");
  let statusColumnIndex = -1;

  // Find the index of the "Status" column
  headers.forEach((header, index) => {
    if (header.getAttribute("data-column-name") === "status") {
      statusColumnIndex = index;
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
    if (status && statusCell && statusCell.textContent?.toLowerCase() !== status.toLowerCase()) {
      match = false;
    }
    if (match) {
      row.setAttribute("style", "display: table-row;");
    } else {
      row.setAttribute("style", "display: none;");
    }
  });
}
