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
// let statusValue = "";
let selectedConversationId = "";
let selectedParticipantId = "";
// @ts-ignore
let selectedStatus = "";
// let interval = "";
// let searchBy = "externalContactId";

// document.getElementById("backToOriginalView").addEventListener("click", function () {
//   let messagesAccordion = document.getElementById("messages-accordion");
//   if (messagesAccordion) {
//     console.log("removing messagesAccordion");
//     messagesAccordion.remove();
//   }
//   let threadAttachmentList = document.getElementById("attachment-table");
//   if (threadAttachmentList) {
//     console.log("removing threadAttachmentList");
//     threadAttachmentList.remove();
//   }
//   if (document.getElementById("reconnectButton")) {
//     console.log("removing reconnectButton");
//     document.getElementById("reconnectButton").remove();
//   }
//   if (document.getElementById("reassignButton")) {
//     console.log("removing reassignButton");
//     document.getElementById("reassignButton").remove();
//   }
//   // messagesAccordion = document.getElementById("threadAttachments");
//   document.getElementById("separateView").classList.remove("active");
//   document.getElementById("originalView").classList.add("active");
// });

// // handling search by email
// var form = document.getElementById("searchForm");
// form.addEventListener("submit", handleForm);

// function handleForm(event) {
//   event.preventDefault();
//   console.log("search term :", document.getElementById("searchEmail").value);
//   let searchEmail = document.getElementById("searchEmail").value;
//   if (searchEmail) {
//     getEmailContactHistory(searchEmail, interval);
//     searchBy = "addressFrom";
//   }
// }

// document.getElementById("move-period-back").addEventListener("click", function () {
//   let initialInterval = document.getElementById("search-dates");
//   let interval = moveIntervalBack(initialInterval.value);
//   console.log("interval", interval);
//   let displayInterval =
//     new Date(interval.split("/")[0]).toLocaleDateString() +
//     "-" +
//     new Date(interval.split("/")[1]).toLocaleDateString();

//   initialInterval.setAttribute("value", displayInterval);

//   if (searchBy === "addressFrom") {
//     getEmailContactHistory(document.getElementById("searchEmail").value, interval);
//   } else {
//     getExternalContactHistory(interval);
//   }
// });

// document.getElementById("move-period-forward").addEventListener("click", function () {
//   let initialInterval = document.getElementById("search-dates");
//   let interval = moveIntervalForward(initialInterval.value);
//   console.log("interval", interval);
//   let displayInterval =
//     new Date(interval.split("/")[0]).toLocaleDateString() +
//     "-" +
//     new Date(interval.split("/")[1]).toLocaleDateString();

//   initialInterval.setAttribute("value", displayInterval);

//   if (searchBy === "addressFrom") {
//     getEmailContactHistory(document.getElementById("searchEmail").value, interval);
//   } else {
//     getExternalContactHistory(interval);
//   }
// });

// document.getElementById("home-view").addEventListener("click", function () {
//   const formField = document.getElementById("searchField");
//   const input = document.getElementById("searchEmail");
//   input.value = "";
//   formField.guxForceUpdate();
//   getExternalContactHistory();
// });

// document.getElementById("refresh")!.addEventListener("click", function () {
//   getActiveEmails();
// });

document.getElementById("search-value")!.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    const searchField = document.getElementById("search-field") as HTMLSelectElement;

    const searchValue = document.querySelector("[name=search-field]") as HTMLInputElement;
    console.log("searchValue", searchValue.value);
    // const statusField = document.getElementById("status-field") as HTMLSelectElement;
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

  if ((e.target as HTMLElement).id === "transfer-queue") {
    console.log("Transfer Queue button clicked");
    let selectedQueue = (document.getElementById("listQueues") as HTMLSelectElement).value;
    console.log("selectedQueue", selectedQueue);
    try {
      let rows = document.getElementById("tbody")!.children;
      let selectedCount = 0;
      for (let i=0; i<rows.length; i++)  {
        let row = rows[i];
        if (
          row?.attributes[2]?.name == "data-selected-row" &&
          row?.children[6]?.textContent?.toLowerCase() == "in queue"
        ) {
          console.log("row", row);
          console.log("row id", row?.children[9]?.textContent);
          const participantId = row.querySelector("td:nth-child(10)")?.textContent;
          console.log("participantId", participantId);
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
      let selectedCount = 0;
      for (let i=0; i<rows.length; i++)  {
        let row = rows[i];
        if (
          row?.attributes[2]?.name == "data-selected-row" &&
          row?.children[6]?.textContent?.toLowerCase() == "in queue"
        ) {
          console.log("row", row);
          console.log("row id", row?.children[9]?.textContent);
          const participantId = row.querySelector("td:nth-child(10)")?.textContent;
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
        // const participantId = row.querySelector("td:nth-child(10)")?.textContent;
        // console.log("participantId", participantId);
        // if (!participantId) {
        //   console.error("Participant ID not found");
        //   return;
        // }
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
        // const participantId = row.querySelector("td:nth-child(10)")?.textContent;
        // console.log("participantId", participantId);
        // if (!participantId) {
        //   console.error("Participant ID not found");
        //   return;
        // }
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
    getActiveEmails();
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
  if (row) {
    const rowId = row.getAttribute("data-row-id");
    console.log("Double-clicked row ID:", rowId);
    const participantId = row.querySelector("td:nth-child(10)")?.textContent;
    console.log("participantId", participantId);
    if (!participantId||!rowId) {
      console.error("Participant ID not found");
      return;
    }
    const status = row.querySelector("td:nth-child(7)")?.textContent;
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
    //function for 500ms delay
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
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    console.log("cells", cells);
    let match = false;
    cells.forEach((cell) => {
      if (cell.textContent?.toLowerCase().includes(searchValue.toLowerCase())) {
        match = true;
        console.log("match", match);
      }
    });
    const statusCell = row.querySelector("td:nth-child(7)"); // Assuming the status column is the 7th column
    if (status && statusCell && statusCell.textContent?.toLowerCase() !== status.toLowerCase()) {
      match = false;
    }
    if (match) {
      // row.style.display = "";
      row.setAttribute("style", "display: table-row;");
    } else {
      // row.style.display = "none";
      row.setAttribute("style", "display: none;");
      
    }
  });
}
// async function getExternalContactHistory() {
//   let intervalEnd = new Date();
//   let intervalStart = new Date();
//   intervalStart = intervalStart.setDate(intervalStart.getDate() - 30);
//   interval = new Date(intervalStart).toISOString() + "/" + intervalEnd.toISOString();
//   let searchDateField = document.getElementById("search-dates");
//   searchDateField.setAttribute(
//     "value",
//     new Date(intervalStart).toLocaleDateString() + "-" + intervalEnd.toLocaleDateString()
//   );
//   let table = document.getElementById("tbody");
//   table.innerHTML = "";
//   try {
//     let conversation = await capi.getConversation(gc_conversationId);
//     console.log("conversation", conversation);
//     let externalContactId = conversation.participants
//       .filter((p) => p.purpose === "external" || p.purpose === "customer")
//       .map((p) => p.externalContactId)[0];
//     console.log("externalContactId", externalContactId);

//     let body = {
//       interval: interval,
//       segmentFilters: [
//         {
//           predicates: [
//             {
//               type: "dimension",
//               dimension: "mediaType",
//               operator: "matches",
//               value: "email",
//             },
//             {
//               dimension: "externalContactId",
//               operator: "matches",
//               value: externalContactId,
//               type: "dimension",
//             },
//           ],
//           type: "and",
//         },
//       ],
//       order: "desc",
//     };

//     const history = await capi.postAnalyticsConversationsDetailsQuery(body);
//     console.log("history1", history);
//     if (history.totalHits > 0) {
//       for (const item of history.conversations) {
//         const queueElelement = item.participants.filter((p) => p.purpose === "acd");
//         const lastQueue = queueElelement[queueElelement.length - 1]?.participantName || "";
//         const agentElement = item.participants.filter((p) => p.purpose === "agent");
//         let lastAgent = "";
//         if (agentElement.length > 0) {
//           lastAgent = agentElement[agentElement.length - 1].participantName;
//         }
//         let status = getEmailStatus(item);
//         let owner = "";
//         let subject = "";
//         let from = item.participants[0].sessions[0].addressFrom;
//         if (item.conversationId === gc_conversationId) {
//           subject = item.participants[0].sessions[0].segments[0].subject + " (Current)";
//         } else {
//           subject = item.participants[0].sessions[0].segments[0].subject;
//         }
//         if (item.hasOwnProperty("conversationEnd")) {
//           owner = "Ended";
//         } else if (status == "In Queue") {
//           owner = lastQueue;
//         } else {
//           owner = lastAgent;
//         }

//         const wrapUp = await getLatestWrapUpCode(item);
//         console.log("wrapUp", wrapUp);
//         addRow(
//           item.conversationId,
//           item.originatingDirection,
//           item.conversationStart,
//           item.conversationEnd,
//           from,
//           subject,
//           status,
//           owner,
//           lastAgent,
//           lastQueue,
//           wrapUp,
//           item.externalTag ? item.externalTag : ""
//         );
//       }
//     }
//     document.getElementById("loading").style.display = "none";
//   } catch (err) {
//     console.error(err);
//   }
// }

// async function getEmailContactHistory(addressFrom, interval) {
//   let table = document.getElementById("tbody");
//   table.innerHTML = "";
//   try {
//     let body = {
//       interval: interval,
//       segmentFilters: [
//         {
//           predicates: [
//             {
//               type: "dimension",
//               dimension: "mediaType",
//               operator: "matches",
//               value: "email",
//             },
//             {
//               dimension: "addressFrom",
//               operator: "matches",
//               value: addressFrom,
//               type: "dimension",
//             },
//           ],
//           type: "and",
//         },
//       ],
//       order: "desc",
//     };
//     const history = await capi.postAnalyticsConversationsDetailsQuery(body);
//     console.log("history1", history);
//     if (history.totalHits > 0) {
//       for (const item of history.conversations) {
//         const queueElelement = item.participants.filter((p) => p.purpose === "acd");
//         const lastQueue = queueElelement[queueElelement.length - 1].participantName;
//         const agentElement = item.participants.filter((p) => p.purpose === "agent");
//         let lastAgent = "";
//         if (agentElement.length > 0) {
//           lastAgent = agentElement[agentElement.length - 1].participantName;
//         }
//         let status = getEmailStatus(item);
//         let from = item.participants[0].sessions[0].addressFrom;
//         let owner = "";
//         let subject = "";
//         if (item.conversationId === gc_conversationId) {
//           subject = item.participants[0].sessions[0].segments[0].subject + " (Current)";
//         } else {
//           subject = item.participants[0].sessions[0].segments[0].subject;
//         }
//         if (item.hasOwnProperty("conversationEnd")) {
//           owner = "Ended";
//         } else if (status == "In Queue") {
//           owner = lastQueue;
//         } else {
//           owner = lastAgent;
//         }

//         console.log("status1", status);

//         const wrapUp = await getLatestWrapUpCode(item);
//         console.log("wrapUp", wrapUp);

//         addRow(
//           item.conversationId,
//           item.originatingDirection,
//           item.conversationStart,
//           item.conversationEnd,
//           from,
//           subject,
//           status,
//           owner,
//           lastAgent,
//           lastQueue,
//           wrapUp,
//           item.externalTag ? item.externalTag : ""
//         );
//       }
//     }
//     document.getElementById("loading").style.display = "none";
//   } catch (err) {
//     console.error(err);
//   }
// }

// function getEmailStatus(conversation) {
//   let status = "";
//   const agentParticipant = conversation.participants.filter((p) => p.purpose === "agent");
//   const interactAgentSegment = agentParticipant.map((s) =>
//     s.sessions.map((a) => a.segments.filter((s) => s.segmentType === "interact"))
//   );
//   const parkAgentSegment = agentParticipant.map((p) =>
//     p.sessions.map((s) => s.segments.filter((s) => s.segmentType === "parked"))
//   );

//   const alertAgentSegment = agentParticipant.map((p) =>
//     p.sessions.map((s) => s.segments.filter((s) => s.segmentType === "alert"))
//   );

//   const isParked = hasMissingSegmentEnd(parkAgentSegment);
//   const isInteracting = hasMissingSegmentEnd(interactAgentSegment);
//   const isAlerting = hasMissingSegmentEnd(alertAgentSegment);
//   if (conversation.hasOwnProperty("conversationEnd")) {
//     status = "Ended";
//   } else if (
//     isInteracting
//   ) {
//     status = "Interacting";
//   } else if (isParked) {
//     status = "Parked";
//   } else if (isAlerting) {
//     status = "Alerting";
//   } else {
//     status = "In Queue";
//   }

//   return status;
// }

// function hasMissingSegmentEnd(data) {
//   // Flatten the nested arrays into a single array
//   const flatData = data.flat(Infinity);

//   // Check if any object does not have the `segmentEnd` key
//   return flatData.some((item) => !item.hasOwnProperty("segmentEnd"));
// }

// function popUp(id, type, message) {
//   let time = id.toString();
//   let options = {
//     id: time,
//     timeout: 3,
//     showCloseButton: true,
//   };
//   myClientApp.alerting.showToastPopup("", message, options);
// }

// function addRow(
//   id,
//   originating_direction,
//   start_date,
//   end_date,
//   from,
//   subject,
//   status,
//   assigned_to,
//   last_agent,
//   queue,
//   wrapUp,
//   external_tag
// ) {
//   let table = document.getElementById("tbody");
//   let row = document.createElement("tr");
//   let select = document.createElement("td");
//   let T_originating_direction = document.createElement("td");
//   let T_start_date = document.createElement("td");
//   let T_end_date = document.createElement("td");
//   let T_from = document.createElement("td");
//   let T_subject = document.createElement("td");
//   let T_status = document.createElement("td");
//   let T_assigned_to = document.createElement("td");
//   let T_last_agent = document.createElement("td");
//   let T_queue = document.createElement("td");
//   let T_wrapUp = document.createElement("td");
//   let T_external_tag = document.createElement("td");

//   T_originating_direction.classList.add("size-x");
//   T_start_date.classList.add("size-x");
//   T_end_date.classList.add("end-column");
//   T_from.classList.add("size-l");
//   T_subject.classList.add("subject-column");
//   T_status.classList.add("status-column");
//   T_assigned_to.classList.add("size-x");
//   T_last_agent.classList.add("size-l");
//   T_queue.classList.add("size-m");
//   T_wrapUp.classList.add("size-l");
//   T_external_tag.classList.add("size-l");

//   row.id = id;
//   row.setAttribute("data-row-id", id);
//   select.innerHTML = "<gux-row-select></gux-row-select>";
//   T_originating_direction.innerHTML = originating_direction;
//   T_start_date.innerHTML = `<gux-truncate>${new Intl.DateTimeFormat("en-GB", {
//     dateStyle: "short",
//     timeStyle: "short",
//   }).format(new Date(start_date))}</gux-truncate>`;

//   end_date
//     ? (T_end_date.innerHTML = `<gux-truncate>${new Intl.DateTimeFormat("en-GB", {
//         dateStyle: "short",
//         timeStyle: "short",
//       }).format(new Date(end_date))}</gux-truncate>`)
//     : (T_end_date.innerHTML = "N/A");
//   T_from.innerHTML = `<gux-truncate>${from}</gux-truncate>`;
//   T_subject.innerHTML = `<gux-truncate>${subject}</gux-truncate>`;
//   T_status.innerHTML = status;
//   // T_routing_state.innerHTML = routing_state;
//   T_assigned_to.innerHTML = assigned_to;
//   T_last_agent.innerHTML = last_agent;
//   if (status === "In Queue") {
//     T_assigned_to.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
//   } else if (status === "Parked") {
//     T_assigned_to.innerHTML = `<gux-truncate><p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p></gux-truncate>`;
//   }
//   T_queue.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
//   T_wrapUp.innerHTML = wrapUp;
//   T_external_tag.innerHTML = external_tag;

//   row.addEventListener("click", function (e) {
//     console.log("row clicked", this);
//     const conversationId = this.id;
//     const conversationEnd = this.querySelector(".end-column").textContent;
//     const subject = this.querySelector(".subject-column").textContent || "";
//     const status = this.querySelector(".status-column").textContent || "";
//     console.log("conversationStatus", status);
//     console.log("conversationSubject", subject);
//     console.log("conversationEnd", conversationEnd);
//     rowClickHandler(conversationId, conversationEnd, status, subject);
//   });

//   // row.appendChild(select);
//   row.appendChild(T_originating_direction);
//   row.appendChild(T_start_date);
//   row.appendChild(T_end_date);
//   row.appendChild(T_from);
//   row.appendChild(T_subject);
//   row.appendChild(T_status);
//   row.appendChild(T_assigned_to);
//   row.appendChild(T_last_agent);
//   row.appendChild(T_queue);
//   row.appendChild(T_wrapUp);
//   row.appendChild(T_external_tag);

//   table.appendChild(row);
// }

// async function rowClickHandler(clickedConversationId, conversationEnd, status, subject) {
//   const conversationEndObject = convertStringToDate(conversationEnd);
//   console.log("conversationEndObject", conversationEndObject);
//   let cutOutDate = new Date();
//   // console.log("threading", JSON.parse(emailSettings).timeoutInMinutes);
//   let conversationIsActive = true;

//   if (conversationEndObject) {
//     cutOutDate.setMinutes(-43200);

//     conversationEndObject < cutOutDate
//       ? (conversationIsActive = false)
//       : (conversationIsActive = true);
//   }

//   console.log("conversationIsActive", conversationIsActive);

//   if (clickedConversationId) {
//     await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {});
//     let accordionDiv = document.createElement("div");
//     accordionDiv.setAttribute("id", "messages-accordion");

//     document.getElementById("messages-content").appendChild(accordionDiv);

//     const messages = await capi.getConversationsEmailMessages(clickedConversationId);
//     for (let i = 0; i < messages.entities.length; i++) {
//       let messageDetails = await capi.getConversationsEmailMessage(
//         clickedConversationId,
//         messages.entities[i].id
//       );
//       console.log("messageDetails", messageDetails);
//       let htmlBody = messageDetails?.htmlBody;
//       let textBody = messageDetails?.textBody;
//       let body = htmlBody ? htmlBody : textBody;

//       let accordionElement = document.createElement("gux-accordion-section");
//       // opening first email content automatically
//       if (i === 0) {
//         accordionElement.setAttribute("open", "");
//       }

//       let accordionSlot = document.createElement("h2");
//       accordionSlot.setAttribute("slot", "header");
//       let options = {
//         year: "numeric",
//         month: "numeric",
//         day: "numeric",
//         hour: "numeric",
//         minute: "numeric",
//       };

//       let headerRow = `<span class="message-date">${new Intl.DateTimeFormat(
//         "en-GB",
//         options
//       ).format(new Date(messages.entities[i].time))}</span> <span> ${
//         messages.entities[i].subject
//       }</span>`;
//       console.log("headerRow", headerRow);

//       accordionSlot.innerHTML = headerRow;
//       accordionSlot.setAttribute("style", "background-color: #F6F7F9");

//       accordionElement.appendChild(accordionSlot);
//       let accordionContent = document.createElement("div");
//       accordionContent.setAttribute("slot", "content");
//       let arccordionBody = document.createElement("p");
//       arccordionBody.innerHTML = body;
//       accordionContent.appendChild(arccordionBody);
//       if (messageDetails.attachments.length == 0) {
//         document.getElementById("attachmentTab").style.display = "none";
//         console.log("no attachments");
//       } else {
//         document.getElementById("attachmentTab").style.display = "block";
//       }
//       if (messageDetails.attachments.length > 0) {
//         let attachmentDiv = document.createElement("div");
//         attachmentDiv.setAttribute("class", "attachment-div");
//         let attachmentHeader = document.createElement("h4");
//         attachmentHeader.innerHTML = "Attachments";
//         attachmentDiv.appendChild(attachmentHeader);
//         var attachmentList = document.createElement("ul");
//         attachmentList.setAttribute("class", "attachment-list");
//         attachmentDiv.appendChild(attachmentList);
//         let anyOfAttachmentsShown = false;
//         for (let j = 0; j < messageDetails.attachments.length; j++) {
//           var attachmentListItem = document.createElement("li");
//           attachmentListItem.setAttribute("class", "attachment-list-item");
//           let attachmentElement = document.createElement("div");
//           attachmentElement.setAttribute("class", "attachment-element");
//           attachmentListItem.appendChild(attachmentElement);
//           let attachmentName = document.createElement("span");
//           attachmentName.innerHTML = messageDetails.attachments[j].name;
//           attachmentElement.appendChild(attachmentName);
//           let attachment = messageDetails.attachments[j];
//           if (
//             attachment.contentType === "image/jpg" ||
//             attachment.contentType === "image/jpeg" ||
//             attachment.contentType === "image/png"
//           ) {
//             let previewButton = document.createElement("gux-button");
//             let icon = document.createElement("gux-icon");
//             icon.setAttribute("icon-name", "fa/eye-regular");
//             icon.setAttribute("screenreader-text", "Preview");
//             icon.setAttribute("size", "small");
//             previewButton.appendChild(icon);
//             let attachmentShown = false;

//             previewButton.addEventListener("click", function () {
//               if (!attachmentShown) {
//                 let img = document.createElement("img");
//                 img.setAttribute("id", attachment.contentUri);
//                 img.setAttribute("src", attachment.contentUri);
//                 img.setAttribute("alt", attachment.name);
//                 img.setAttribute("style", "max-width: 50%; height: auto;");
//                 attachmentDiv.appendChild(img);
//                 attachmentShown = true;
//                 anyOfAttachmentsShown = true;
//               } else {
//                 let img = document.getElementById(attachment.contentUri);
//                 if (img) {
//                   img.remove();
//                 }
//                 attachmentShown = false;
//                 anyOfAttachmentsShown = false;
//               }
//             });

//             attachmentElement.appendChild(previewButton);
//           }
//           let downloadButton = document.createElement("gux-button");
//           let icon2 = document.createElement("gux-icon");
//           icon2.setAttribute("icon-name", "fa/download-regular");
//           icon2.setAttribute("screenreader-text", "Download");
//           icon2.setAttribute("size", "small");
//           downloadButton.appendChild(icon2);
//           downloadButton.addEventListener("click", function () {
//             let link = document.createElement("a");
//             link.setAttribute("href", attachment.contentUri);
//             link.setAttribute("download", attachment.name);
//             link.click();
//           });

//           attachmentElement.appendChild(downloadButton);
//           attachmentList.appendChild(attachmentListItem);
//         }
//         accordionContent.appendChild(attachmentDiv);
//       }
//       accordionElement.appendChild(accordionContent);
//       accordionDiv.appendChild(accordionElement);
//     }

//     const messagesWithAttachments = messages.entities.filter((m) => m.attachments.length > 0);
//     console.log("messagesWithAttachments", messagesWithAttachments);
//     if (messagesWithAttachments.length > 0) {
//       let attachmentDiv = document.getElementById("threadAttachments");
//       attachmentDiv.setAttribute("class", "attachment-div");
//       let guxtable = document.createElement("gux-table");
//       guxtable.setAttribute("compact", "");
//       let table = document.createElement("table");
//       table.setAttribute("class", "attachment-table");
//       table.setAttribute("id", "attachment-table");
//       table.setAttribute("slot", "data");
//       guxtable.appendChild(table);

//       let thead = document.createElement("thead");
//       let headerRow = document.createElement("tr");
//       let headers = ["Time", "Subject", "Attachment Name", "Preview", "Download"];
//       headers.forEach((headerText) => {
//         let th = document.createElement("th");
//         th.innerHTML = headerText;
//         headerRow.appendChild(th);
//       });
//       thead.appendChild(headerRow);
//       table.appendChild(thead);

//       let tbody = document.createElement("tbody");
//       table.appendChild(tbody);

//       for (let j = 0; j < messagesWithAttachments.length; j++) {
//         let message = messagesWithAttachments[j];
//         let messageRow = document.createElement("tr");
//         messageRow.classList.add("message-row");

//         let timeCell = document.createElement("td");
//         timeCell.innerHTML = new Date(message.time).toLocaleString("en-GB");
//         messageRow.appendChild(timeCell);

//         let subjectCell = document.createElement("td");
//         subjectCell.innerHTML = message.subject;
//         messageRow.appendChild(subjectCell);

//         let attachmentNameCell = document.createElement("td");
//         attachmentNameCell.innerHTML = "";
//         messageRow.appendChild(attachmentNameCell);

//         let previewCell = document.createElement("td");
//         previewCell.innerHTML = "";
//         messageRow.appendChild(previewCell);

//         let downloadCell = document.createElement("td");
//         downloadCell.innerHTML = "";
//         messageRow.appendChild(downloadCell);

//         tbody.appendChild(messageRow);

//         for (let k = 0; k < message.attachments.length; k++) {
//           let attachment = message.attachments[k];
//           let attachmentRow = document.createElement("tr");
//           attachmentRow.classList.add("attachment-row");

//           let emptyCell1 = document.createElement("td");
//           emptyCell1.innerHTML = "";
//           attachmentRow.appendChild(emptyCell1);

//           let emptyCell2 = document.createElement("td");
//           emptyCell2.innerHTML = "";
//           attachmentRow.appendChild(emptyCell2);

//           let attachmentNameCell = document.createElement("td");
//           attachmentNameCell.innerHTML = attachment.name;
//           attachmentRow.appendChild(attachmentNameCell);

//           let previewCell = document.createElement("td");
//           if (
//             attachment.contentType === "image/jpg" ||
//             attachment.contentType === "image/jpeg" ||
//             attachment.contentType === "image/png"
//           ) {
//             let previewButton = document.createElement("gux-button");
//             let icon = document.createElement("gux-icon");
//             icon.setAttribute("icon-name", "fa/eye-regular");
//             icon.setAttribute("screenreader-text", "Preview");
//             icon.setAttribute("size", "small");
//             previewButton.appendChild(icon);
//             let attachmentShown = false;

//             previewButton.addEventListener("click", function () {
//               if (!attachmentShown) {
//                 if (attachment.contentType.startsWith("image/")) {
//                   let img = document.createElement("img");
//                   img.setAttribute("id", attachment.contentUri);
//                   img.setAttribute("src", attachment.contentUri);
//                   img.setAttribute("alt", attachment.name);
//                   img.setAttribute("style", "max-width: 50%; height: auto;");
//                   attachmentDiv.appendChild(img);
//                 } else if (attachment.contentType === "application/pdf") {
//                   let iframe = document.createElement("iframe");
//                   iframe.setAttribute("id", attachment.contentUri);
//                   iframe.setAttribute("src", attachment.contentUri);
//                   iframe.setAttribute("style", "width: 100%; height: 500px;");
//                   attachmentDiv.appendChild(iframe);
//                 }
//                 attachmentShown = true;
//               } else {
//                 let element = document.getElementById(attachment.contentUri);
//                 element.remove();
//                 attachmentShown = false;
//               }
//             });

//             previewCell.appendChild(previewButton);
//           }
//           attachmentRow.appendChild(previewCell);

//           let downloadCell = document.createElement("td");
//           let downloadButton = document.createElement("gux-button");
//           let icon2 = document.createElement("gux-icon");
//           icon2.setAttribute("icon-name", "fa/download-regular");
//           icon2.setAttribute("screenreader-text", "Download");
//           icon2.setAttribute("size", "small");
//           downloadButton.appendChild(icon2);
//           downloadButton.addEventListener("click", function () {
//             let link = document.createElement("a");
//             link.setAttribute("href", attachment.contentUri);
//             link.setAttribute("download", attachment.name);
//             link.click();
//           });
//           downloadCell.appendChild(downloadButton);
//           attachmentRow.appendChild(downloadCell);

//           tbody.appendChild(attachmentRow);
//         }
//       }

//       attachmentDiv.appendChild(guxtable);
//     }

//     console.log("messages", messages);
//     if (conversationIsActive && status == "Ended") {
//       const reconnectButton = document.createElement("gux-button");
//       reconnectButton.setAttribute("id", "reconnectButton");
//       reconnectButton.innerHTML = "Reconnect";
//       reconnectButton.addEventListener("click", function () {
//         capi.postConversationsEmailReconnect(clickedConversationId);
//       });
//       document.getElementById("messages-content").appendChild(reconnectButton);
//     }

//     const conversation = await capi.getConversation(clickedConversationId);

//     if (status == "In Queue" && !subject.includes("(Current)")) {
//       const reassignButton = document.createElement("gux-button");
//       reassignButton.setAttribute("id", "reassignButton");
//       reassignButton.innerHTML = "Assign to Me";
//       reassignButton.addEventListener("click", function () {
//         console.log("conversation", conversation);
//         const activeQueue = conversation.participants.filter(
//           (c) => c.purpose === "acd" && c.hasOwnProperty("conversationEnd") === false
//         );
//         const participantId = activeQueue[0].id;
//         console.log("participantId", participantId);
//         transferUser(clickedConversationId, participantId, user.id);
//       });
//       document.getElementById("messages-content").appendChild(reassignButton);
//     }
//     document.getElementById("originalView").classList.remove("active");
//     document.getElementById("separateView").classList.add("active");
//   }
// }

// function getEmailThreading(token) {
//   return new Promise((resolve, reject) => {
//     let xhr = new XMLHttpRequest();
//     xhr.open("GET", `https://api.mypurecloud.de/api/v2/emails/settings/threading`);
//     xhr.setRequestHeader("Authorization", "bearer " + token);
//     xhr.onload = function () {
//       resolve(xhr.response);
//     };
//     xhr.send();
//   });
// }

// function convertStringToDate(dateString) {
//   if (dateString == "N/A") return null;
//   const [datePart, timePart] = dateString.split(",");
//   const [day, month, year] = datePart.split("/");
//   const [hours, minutes, seconds] = timePart.split(":");

//   const dateObject = new Date(year, month - 1, day, hours, minutes);
//   return dateObject;
// }

// export async function transferUser(conversationId, participantId, selectedUserId) {
//   try {
//     const body = {
//       userId: selectedUserId,
//       transferType: "Unattended",
//     };
//     let data = await capi.postConversationsEmailParticipantReplace(
//       conversationId,
//       participantId,
//       body
//     );
//     console.log("postConversationsEmailParticipantReplace returned successfully.", data);
//   } catch (error) {
//     console.log("There was a failure transfering", error);
//   }
// }

// function moveIntervalBack() {
//   let interval = document.getElementById("search-dates").value;
//   let intervalArray = interval.split("-");
//   let intervalStart = new Date(intervalArray[0]);
//   let intervalEnd = new Date(intervalArray[1]);
//   intervalStart = intervalStart.setDate(intervalStart.getDate() - 30);
//   intervalEnd = intervalEnd.setDate(intervalEnd.getDate() - 30);
//   console.log("intervalStart", intervalStart);
//   console.log("intervalEnd", intervalEnd);
//   interval = new Date(intervalStart).toISOString() + "/" + new Date(intervalEnd).toISOString();
//   return interval;
// }

// function moveIntervalForward() {
//   let interval = document.getElementById("search-dates").value;
//   let intervalArray = interval.split("-");
//   let intervalStart = new Date(intervalArray[0]);
//   let intervalEnd = new Date(intervalArray[1]);
//   intervalStart = intervalStart.setDate(intervalStart.getDate() + 30);
//   intervalEnd = intervalEnd.setDate(intervalEnd.getDate() + 30);
//   console.log("intervalStart", intervalStart);
//   console.log("intervalEnd", intervalEnd);
//   interval = new Date(intervalStart).toISOString() + "/" + new Date(intervalEnd).toISOString();
//   // sessionStorage.setItem("interval", interval);
//   return interval;
// }

// async function getLatestWrapUpCode(conversation) {
//   let latestWrapUpCodeId = null;
//   let latestSegmentEnd = null;
//   let latestWrapUpCode = "";

//   // Loop through each participant
//   conversation.participants.forEach((participant) => {
//     if (participant.purpose === "agent") {
//       // Loop through each session of the participant
//       participant.sessions.forEach((session) => {
//         // Loop through each segment of the session
//         session.segments.forEach((segment) => {
//           if (segment.segmentType === "wrapup") {
//             // Parse the segmentEnd timestamp into a Date object for comparison
//             const segmentEndDate = new Date(segment.segmentEnd);

//             // Check if the current segment has the latest segmentEnd
//             if (!latestSegmentEnd || segmentEndDate > latestSegmentEnd) {
//               latestSegmentEnd = segmentEndDate;
//               latestWrapUpCodeId = segment.wrapUpCode; // Store the wrapUpCode for the latest segment
//             }
//           }
//         });
//       });
//     }
//   });

//   if (latestWrapUpCodeId) {
//     try {
//       const wrapUpCodeDetails = await rapi.getRoutingWrapupcode(latestWrapUpCodeId);
//       latestWrapUpCode = wrapUpCodeDetails.name;
//     } catch (error) {
//       console.error("Error getting wrap-up code details:", error);
//     }
//   }
//   return latestWrapUpCode;
// }
