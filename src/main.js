import platformClient from "purecloud-platform-client-v2";
import { registerSparkComponents } from "genesys-spark";
import ClientApp from "purecloud-client-app-sdk";
const client = platformClient.ApiClient.instance;
client.setEnvironment("mypurecloud.de");
client.setPersistSettings(true, "my_app_name");

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

// setting test data
gc_region = "mypurecloud.de";
gc_clientId = "3c2df9bc-bac4-4bee-947a-71da0385e6ad";
gc_redirectUrl = "http://127.0.0.1:5173/index.html";  

// let platformClient = require("platformClient");
// const client = platformClient.ApiClient.instance;
const uapi = new platformClient.UsersApi();
const capi = new platformClient.ConversationsApi();
//   const wapi = new platformClient.TaskManagementApi()

// Configure Client App for UI notifications
// const ClientApp = window.purecloud.apps.ClientApp;
document.getElementById("tbody").addEventListener("click", async function (e) {
  const clickedConversationId = e.target.parentNode.dataset?.rowId;
  console.log("clickedConversationId", clickedConversationId);
  if (clickedConversationId) {
    let accordionDiv = document.createElement("div");
    accordionDiv.setAttribute("id", "messages-accordion");

    document.getElementById("messages-content").appendChild(accordionDiv);

    const messages = await capi.getConversationsEmailMessages(
      clickedConversationId
    );
    for (let i = 0; i < messages.entities.length; i++) {
      let messageDetails = await capi.getConversationsEmailMessage(
        clickedConversationId,
        messages.entities[i].id
      );
      let htmlBody = messageDetails?.htmlBody;
      let textBody = messageDetails?.textBody;
      let body = htmlBody ? htmlBody : textBody;

      let accordionElement = document.createElement("gux-accordion-section");
      // opening first email content automatically
      if (i === 0) {
        accordionElement.setAttribute("open", "");
      }
     
      let accordionSlot = document.createElement("h2");
      accordionSlot.setAttribute("slot", "header");
      
      accordionSlot.innerHTML = messages.entities[i].subject;
      accordionSlot.setAttribute("style", "background-color: #F6F7F9");

      accordionElement.appendChild(accordionSlot);
      let accordionContent = document.createElement("p");
      accordionContent.setAttribute("slot", "content");
      accordionContent.innerHTML = body;
      accordionElement.appendChild(accordionContent);
      accordionDiv.appendChild(accordionElement);
    }
    console.log("messages", messages);
    document.getElementById("originalView").classList.remove("active");
    document.getElementById("separateView").classList.add("active");
  }
});

document
  .getElementById("backToOriginalView")
  .addEventListener("click", function () {
    let messagesAccordion = document.getElementById("messages-accordion");
    messagesAccordion.remove();
    document.getElementById("separateView").classList.remove("active");
    document.getElementById("originalView").classList.add("active");
  });

loadSparkComponents();
async function loadSparkComponents() {
  await registerSparkComponents();
}

start();

async function start() {
  try {
    //   client.setEnvironment(gc_region)
    // client.setEnvironment("mypurecloud.de");
    // client.setPersistSettings(true, "_mm_");

    console.log("%cLogging in to Genesys Cloud", "color: green");
    //   await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {})
    console.log("client", client);
    console.log("gc_clientId", gc_clientId);
    console.log("gc_redirectUrl", gc_redirectUrl);
    await client.loginImplicitGrant(
      gc_clientId,
      gc_redirectUrl,
      {}
    );
    console.log("region", gc_region);
    const myClientApp = new ClientApp({
      pcEnvironment: gc_region,
    });
    console.log("myClientApp", myClientApp);
    

    //GET Current UserId
    let user = await uapi.getUsersMe({});
    console.log(user);
    let externalContactId = await getExternalContactHistory();
    // console.log("history", externalContactId);
    //Enter in starting code.
    //  getWorkbins()
    //   getUsers()
  } catch (err) {
    console.log("Error: ", err);
  }
} //End of start() function

async function getExternalContactHistory() {
  try {
    let conversation = await capi.getConversation(gc_conversationId);
    console.log("conversation", conversation);
    let externalContactId = conversation.participants
      .filter((p) => p.purpose === "external" || p.purpose === "customer")
      .map((p) => p.externalContactId)[0];
    console.log("externalContactId", externalContactId);
    let intervalEnd = new Date();
    let intervalStart = new Date();
    intervalStart = intervalStart.setDate(intervalStart.getDate() - 30);
    let body = {
      interval:
        new Date(intervalStart).toISOString() + "/" + intervalEnd.toISOString(),
      segmentFilters: [
        {
          predicates: [
            {
              type: "dimension",
              dimension: "mediaType",
              operator: "matches",
              value: "email",
            },
            {
              dimension: "externalContactId",
              operator: "matches",
              value: externalContactId,
              type: "dimension",
            },
          ],
          type: "and",
        },
      ],
      order: "desc",
    };
    const history = await capi.postAnalyticsConversationsDetailsQuery(body);
    console.log("history1", history);
    if (history.totalHits > 0) {
      for (const item of history.conversations) {
        // if (item.originatingDirection === "inbound") {
        //   item.subject = item.participants[0].sessions[0].segments[0].subject;
        // } else {
        //   item.subject = item.participants[1].sessions[0].segments[0].subject;
        // }
        const queueElelement = item.participants.filter(
          (p) => p.purpose === "acd"
        );
        const lastQueue =
          queueElelement[queueElelement.length - 1].participantName;
        const agentElement = item.participants.filter(
          (p) => p.purpose === "agent"
        );
        let lastAgent = "";
        if (agentElement.length > 0) {
          lastAgent = agentElement[agentElement.length - 1].participantName;
        }
        let status = getEmailStatus(item);
        let owner = "";
        let subject = "";
        if (item.conversationId === gc_conversationId) {
          subject =
            item.participants[0].sessions[0].segments[0].subject + " (Current)";
        } else {
          subject = item.participants[0].sessions[0].segments[0].subject;
        }
        if (item.hasOwnProperty("conversationEnd")) {
          owner = "Ended";
        } else if (status == "In Queue") {
          owner = lastQueue;
        } else {
          owner = lastAgent;
        }

        addRow(
          item.conversationId,
          item.originatingDirection,
          item.conversationStart,
          item.conversationEnd,
          subject,
          status,
          owner,
          lastQueue,
          item.externalTag
        );
      }
    }
    document.getElementById("loading").style.display = "none";
  } catch (err) {
    console.error(err);
  }
}

function getEmailStatus(conversation) {
  let status = "";
  // const acdParticipant = conversation.participants.filter(
  //   (p) => p.purpose === "acd"
  // );
  // if (!acdParticipant) return false;
  const agentParticipant = conversation.participants.filter(
    (p) => p.purpose === "agent"
  );
  console.log("agentParticipant", agentParticipant);
  // const interactAcdSegment = acdParticipant.map((s) =>
  //   s.sessions[0].segments.filter((s) => s.segmentType === "interact")
  // );
  const interactAgentSegment = agentParticipant.map((s) =>
    s.sessions.map((a) =>
      a.segments.filter((s) => s.segmentType === "interact")
    )
  );
  const parkAgentSegment = agentParticipant.map((p) =>
    p.sessions.map((s) => s.segments.filter((s) => s.segmentType === "parked"))
  );

  const alertAgentSegment = agentParticipant.map((p) =>
    p.sessions.map((s) => s.segments.filter((s) => s.segmentType === "alert"))
  );

  const isParked = hasMissingSegmentEnd(parkAgentSegment);
  const isInteracting = hasMissingSegmentEnd(interactAgentSegment);
  const isAlerting = hasMissingSegmentEnd(alertAgentSegment);
  // console.log("interactAcdSegment", interactAcdSegment);
  // console.log("interactAgentSegment", interactAgentSegment);
  // console.log(
  //   "parkAgentSegment",
  //   parkAgentSegment[0][0]
  //     .map((s) => s.hasOwnProperty("segmentEnd"))
  //     .includes(false)
  // );
  // parkAgentSegment[0][0].map((s) => console.log("s", s));
  if (conversation.hasOwnProperty("conversationEnd")) {
    status = "Ended";
  } else if (
    // interactAgentSegment.length > 0 &&
    // interactAgentSegment[0][0]
    //   .map((s) => s.hasOwnProperty("segmentEnd"))
    //   .includes(false)
    isInteracting
  ) {
    status = "Interacting";
  } else if (isParked) {
    status = "Parked";
  } else if (isAlerting) {
    status = "Alerting";
  } else {
    status = "In Queue";
  }

  return status;
}

function hasMissingSegmentEnd(data) {
  // Flatten the nested arrays into a single array
  const flatData = data.flat(Infinity);

  // Check if any object does not have the `segmentEnd` key
  return flatData.some((item) => !item.hasOwnProperty("segmentEnd"));
}

function popUp(id, type, message) {
  let time = id.toString();
  let options = {
    id: time,
    timeout: 3,
    showCloseButton: true,
  };
  myClientApp.alerting.showToastPopup("", message, options);
}

function addRow(
  id,
  originating_direction,
  start_date,
  end_date,
  subject,
  status,
  assigned_to,
  queue,
  external_tag
) {
  let table = document.getElementById("tbody");
  let row = document.createElement("tr");
  let select = document.createElement("td");
  let T_originating_direction = document.createElement("td");
  let T_start_date = document.createElement("td");
  let T_end_date = document.createElement("td");
  let T_subject = document.createElement("td");
  let T_status = document.createElement("td");
  let T_assigned_to = document.createElement("td");
  let T_queue = document.createElement("td");
  let T_external_tag = document.createElement("td");

  row.id = id;
  row.setAttribute("data-row-id", id);
  select.innerHTML = "<gux-row-select></gux-row-select>";
  T_originating_direction.innerHTML = originating_direction;
  T_start_date.innerHTML = new Date(start_date).toLocaleString('en-GB');
  T_end_date.innerHTML = new Date(end_date).toLocaleString('en-GB');
  T_subject.innerHTML = subject;
  T_status.innerHTML = status;
  // T_routing_state.innerHTML = routing_state;
  T_assigned_to.innerHTML = assigned_to;
  if(status==="In Queue"){
    T_assigned_to.innerHTML = queue
  }
  else if (status==="Parked"){
    T_assigned_to.innerHTML = `<p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p>`
  }
  // status==="Parked" ?T_assigned_to.innerHTML = `<p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p>`:assigned_to
  // T_assigned_to.innerHTML = '<p style="display:inline-block;">Some text <img src="park.png" width="15" height="15"></p>'
  T_queue.innerHTML = queue;
  T_external_tag.innerHTML = external_tag;

  row.appendChild(select);
  row.appendChild(T_originating_direction);
  row.appendChild(T_start_date);
  row.appendChild(T_end_date);
  row.appendChild(T_subject);
  // row.appendChild(T_status);
  row.appendChild(T_assigned_to);
  row.appendChild(T_queue);
  row.appendChild(T_external_tag);

  table.appendChild(row);
}
