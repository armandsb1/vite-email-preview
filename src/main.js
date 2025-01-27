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
// gc_redirectUrl = "http://localhost:5173/index.html";
// gc_redirectUrl = "https://magical-piroshki-be2276.netlify.app";

// let platformClient = require("platformClient");
// const client = platformClient.ApiClient.instance;
const uapi = new platformClient.UsersApi();
const capi = new platformClient.ConversationsApi();
let emailSettings = {};
let user = {};
let interval = "";
let searchBy = "externalContactId";


// const ClientApp = window.purecloud.apps.ClientApp
      const myClientApp = new ClientApp({
        pcEnvironment: gc_region,
      })
//   const wapi = new platformClient.TaskManagementApi()

// Configure Client App for UI notifications
// const ClientApp = window.purecloud.apps.ClientApp;
// document.getElementById("tbody").addEventListener("click", async function (e) {
//   const clickedConversationId = e.target.parentNode.dataset?.rowId;
//   console.log("clickedConversationId", clickedConversationId);
//   if (clickedConversationId) {
//     let accordionDiv = document.createElement("div");
//     accordionDiv.setAttribute("id", "messages-accordion");

//     document.getElementById("messages-content").appendChild(accordionDiv);

//     const messages = await capi.getConversationsEmailMessages(clickedConversationId);
//     for (let i = 0; i < messages.entities.length; i++) {
//       let messageDetails = await capi.getConversationsEmailMessage(
//         clickedConversationId,
//         messages.entities[i].id
//       );
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

//       accordionSlot.innerHTML = messages.entities[i].subject;
//       accordionSlot.setAttribute("style", "background-color: #F6F7F9");

//       accordionElement.appendChild(accordionSlot);
//       let accordionContent = document.createElement("p");
//       accordionContent.setAttribute("slot", "content");
//       accordionContent.innerHTML = body;
//       accordionElement.appendChild(accordionContent);
//       accordionDiv.appendChild(accordionElement);
//     }
//     console.log("messages", messages);
//     document.getElementById("originalView").classList.remove("active");
//     document.getElementById("separateView").classList.add("active");
//   }
// });

document
  .getElementById("backToOriginalView")
  .addEventListener("click", function () {
    let messagesAccordion = document.getElementById("messages-accordion");
    if (messagesAccordion){
    messagesAccordion.remove()};
    let threadAttachmentList = document.getElementById("attachment-table");
    if (threadAttachmentList){
    threadAttachmentList.remove()};
    if (document.getElementById("reconnectButton")){
      document.getElementById("reconnectButton").remove();
    }
    if (document.getElementById("reassignButton")){
      document.getElementById("reassignButton").remove();
    }
    // messagesAccordion = document.getElementById("threadAttachments");
    document.getElementById("separateView").classList.remove("active");
    document.getElementById("originalView").classList.add("active");
  });


var form = document.getElementById("searchForm");

form.addEventListener("submit", handleForm);

function handleForm(event) {
  event.preventDefault();
  console.log("search term :", document.getElementById("searchEmail").value);
  let searchEmail = document.getElementById("searchEmail").value;
  if (searchEmail) {
    getEmailContactHistory(searchEmail, interval);
    searchBy = "addressFrom";
  }
}

document.getElementById("move-period-back").addEventListener("click", function () {
  let initialInterval = document.getElementById("search-dates");
  let interval = moveIntervalBack(initialInterval.value);
  console.log("interval", interval);
  let displayInterval = new Date(interval.split("/")[0]).toLocaleDateString() + "-" + new Date(interval.split("/")[1]).toLocaleDateString();

  initialInterval.setAttribute("value",displayInterval)

  if (searchBy === "addressFrom") {
    getEmailContactHistory(document.getElementById("searchEmail").value, interval);
  } else {

  getExternalContactHistory(interval);
  }
});

document.getElementById("move-period-forward").addEventListener("click", function () {
  let initialInterval = document.getElementById("search-dates");
  let interval = moveIntervalForward(initialInterval.value);
  console.log("interval", interval);
  let displayInterval = new Date(interval.split("/")[0]).toLocaleDateString() + "-" + new Date(interval.split("/")[1]).toLocaleDateString();

  initialInterval.setAttribute("value",displayInterval)

  if (searchBy === "addressFrom") {
    getEmailContactHistory(document.getElementById("searchEmail").value, interval);
  } else {

  getExternalContactHistory(interval);
  }
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
    await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {});
    console.log("region", gc_region);
    // const myClientApp = new ClientApp({
    //   pcEnvironment: gc_region,
    // });
    // console.log("myClientApp", myClientApp);

    //GET Current UserId
    user = await uapi.getUsersMe({});
    console.log("user",user);
    emailSettings = await getEmailThreading(client.authData.accessToken);
    let intervalEnd = new Date();
    let intervalStart = new Date();
    intervalStart = intervalStart.setDate(intervalStart.getDate() - 30);
    interval=new Date(intervalStart).toISOString() + "/" + intervalEnd.toISOString()
    let searchDateField = document.getElementById("search-dates");
    searchDateField.setAttribute("value",new Date(intervalStart).toLocaleDateString() + "-" + intervalEnd.toLocaleDateString())
   await getExternalContactHistory(interval);
    // console.log("history", externalContactId);
    //Enter in starting code.
    //  getWorkbins()
    //   getUsers()
  } catch (err) {
    console.log("Error: ", err);
  }
} //End of start() function

async function getExternalContactHistory(interval) {
  let table = document.getElementById("tbody");
  table.innerHTML = "";
  try {
    let conversation = await capi.getConversation(gc_conversationId);
    console.log("conversation", conversation);
    let externalContactId = conversation.participants
      .filter((p) => p.purpose === "external" || p.purpose === "customer")
      .map((p) => p.externalContactId)[0];
    console.log("externalContactId", externalContactId);
   
    let body = {
      interval:interval,
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
          queueElelement[queueElelement.length - 1]?.participantName || "";
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
        let from = item.participants[0].sessions[0].addressFrom;
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
        console.log("status1", status);
        addRow(
          item.conversationId,
          item.originatingDirection,
          item.conversationStart,
          item.conversationEnd,
          from,
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

async function getEmailContactHistory(addressFrom, interval) {
  let table = document.getElementById("tbody");
  table.innerHTML = "";
  try {
   
    let body = {
      interval:
        interval,
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
              dimension: "addressFrom",
              operator: "matches",
              value: addressFrom,
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
        let from = item.participants[0].sessions[0].addressFrom;
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

        console.log("status1", status);

        addRow(
          item.conversationId,
          item.originatingDirection,
          item.conversationStart,
          item.conversationEnd,
          from,
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
  from,
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
  let T_from = document.createElement("td");
  let T_subject = document.createElement("td");
  let T_status = document.createElement("td");
  let T_assigned_to = document.createElement("td");
  let T_queue = document.createElement("td");
  let T_external_tag = document.createElement("td");

  T_end_date.classList.add("end-date-column");
  T_from.classList.add("end-date-column");
  T_queue.classList.add("end-date-column");
  T_external_tag.classList.add("end-date-column");
  T_subject.classList.add("subject-column");
  T_status.classList.add("status-column");

  row.id = id;
  row.setAttribute("data-row-id", id);
  select.innerHTML = "<gux-row-select></gux-row-select>";
  T_originating_direction.innerHTML = originating_direction;
  T_start_date.innerHTML = `<gux-truncate>${new Date(start_date).toLocaleString(
    "en-GB"
  )}</gux-truncate>`;

  end_date
    ? (T_end_date.innerHTML = `<gux-truncate>${new Date(
        end_date
      ).toLocaleString("en-GB")}</gux-truncate>`)
    : (T_end_date.innerHTML = "N/A");
  T_from.innerHTML = `<gux-truncate>${from}</gux-truncate>`;
  T_subject.innerHTML = `<gux-truncate>${subject}</gux-truncate>`;
  T_status.innerHTML = status;
  // T_routing_state.innerHTML = routing_state;
  T_assigned_to.innerHTML = assigned_to;
  if (status === "In Queue") {
    T_assigned_to.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  } else if (status === "Parked") {
    T_assigned_to.innerHTML = `<gux-truncate><p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p></gux-truncate>`;
  }
  // status==="Parked" ?T_assigned_to.innerHTML = `<p style="display:inline-block;">${assigned_to} <img src="park.png" width="15" height="15"></p>`:assigned_to
  // T_assigned_to.innerHTML = '<p style="display:inline-block;">Some text <img src="park.png" width="15" height="15"></p>'
  T_queue.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;
  T_external_tag.innerHTML = external_tag;

  row.addEventListener("click", function () {
    const conversationId = this.id;
    const conversationEnd = this.querySelector(".end-date-column").textContent;
    const subject = this.querySelector(".subject-column").textContent||""
    const status = this.querySelector(".status-column").textContent||""
    console.log("conversationStatus", status)
    console.log("conversationSubject", subject)
    rowClickHandler(conversationId, conversationEnd, status, subject);
  });

  // row.appendChild(select);
  row.appendChild(T_originating_direction);
  row.appendChild(T_start_date);
  row.appendChild(T_end_date);
  row.appendChild(T_from);
  row.appendChild(T_subject);
  row.appendChild(T_status);
  row.appendChild(T_assigned_to);
  row.appendChild(T_queue);
  row.appendChild(T_external_tag);

  table.appendChild(row);
}

async function rowClickHandler(clickedConversationId, conversationEnd, status, subject) {
  const conversationEndObject = convertStringToDate(conversationEnd);
  let cutOutDate = new Date();
  console.log("threading", JSON.parse(emailSettings).timeoutInMinutes);
  let conversationIsActive = true
  
  if (conversationEndObject) {
   let difference = (cutOutDate.getMinutes()-JSON.parse(emailSettings).timeoutInMinutes)
    cutOutDate.setMinutes(difference)
    conversationEndObject<cutOutDate?conversationIsActive = false:conversationIsActive = true
  }

  console.log("conversationIsActive", conversationIsActive);

  // const clickedConversationId = e.target.parentNode.dataset?.rowId;
  // console.log("clickedConversationId", clickedConversationId);

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
      let accordionContent = document.createElement("div");
      accordionContent.setAttribute("slot", "content");
      let arccordionBody = document.createElement("p");
      arccordionBody.innerHTML = body;
      accordionContent.appendChild(arccordionBody);
      if (messageDetails.attachments.length==0) {
        document.getElementById("attachmentTab").style.display = "none";
        console.log("no attachments");
      }
      else {document.getElementById("attachmentTab").style.display = "block";}
      if (messageDetails.attachments.length > 0) {
        let attachmentDiv = document.createElement("div");
        attachmentDiv.setAttribute("class", "attachment-div");
        let attachmentHeader = document.createElement("h4");
        attachmentHeader.innerHTML = "Attachments";
        attachmentDiv.appendChild(attachmentHeader);
        var attachmentList = document.createElement("ul");
        attachmentList.setAttribute("class", "attachment-list");
        attachmentDiv.appendChild(attachmentList);
        let anyOfAttachmentsShown = false
        for (let j = 0; j < messageDetails.attachments.length; j++) {
          var attachmentListItem = document.createElement("li");
          attachmentListItem.setAttribute("class", "attachment-list-item");
          let attachmentElement = document.createElement("div");
          attachmentElement.setAttribute("class", "attachment-element");
          attachmentListItem.appendChild(attachmentElement);
          let attachmentName = document.createElement("span");
          attachmentName.innerHTML = messageDetails.attachments[j].name;
          attachmentElement.appendChild(attachmentName);
          let attachment = messageDetails.attachments[j];
          if (
            attachment.contentType === "image/jpg" ||
            attachment.contentType === "image/jpeg" ||
            attachment.contentType === "image/png"
          ) {
            let previewButton = document.createElement("gux-button");
            let icon = document.createElement("gux-icon");
            icon.setAttribute("icon-name", "fa/eye-regular");
            icon.setAttribute("screenreader-text", "Preview");
            icon.setAttribute("size", "small");
            previewButton.appendChild(icon);
            let attachmentShown = false;

            previewButton.addEventListener("click", function () {
              
              if (!attachmentShown) {
                let img = document.createElement("img");
                img.setAttribute("id", attachment.contentUri);
                img.setAttribute("src", attachment.contentUri);
                img.setAttribute("alt", attachment.name);
                img.setAttribute("style", "max-width: 50%; height: auto;");
                attachmentDiv.appendChild(img);
                attachmentShown = true;
                anyOfAttachmentsShown = true
              }
              else {
                let img = document.getElementById(attachment.contentUri);
                if (img){
                img.remove()};
                attachmentShown = false;
                anyOfAttachmentsShown = false
              }
            });

            attachmentElement.appendChild(previewButton);
          }
          //  else {
          //   let link = document.createElement("a");
          //   link.setAttribute("href", attachment.url);
          //   link.setAttribute("download", attachment.name);
          //   link.innerHTML = attachment.name;
          //   attachmentDiv.appendChild(link);
          // }
          let downloadButton = document.createElement("gux-button");
          let icon2 = document.createElement("gux-icon");
          icon2.setAttribute("icon-name", "fa/download-regular");
          icon2.setAttribute("screenreader-text", "Download");
          icon2.setAttribute("size", "small");
          downloadButton.appendChild(icon2);
          downloadButton.addEventListener("click", function () {
            let link = document.createElement("a");
            link.setAttribute("href", attachment.contentUri);
            link.setAttribute("download", attachment.name);
            link.click();
          });

          attachmentElement.appendChild(downloadButton);
          attachmentList.appendChild(attachmentListItem);
        }
        accordionContent.appendChild(attachmentDiv);
      }
      accordionElement.appendChild(accordionContent);
      accordionDiv.appendChild(accordionElement);
    }

  
    const messagesWithAttachments = messages.entities.filter(m=>m.attachments.length>0);
    console.log("messagesWithAttachments", messagesWithAttachments);
    if (messagesWithAttachments.length > 0) {
      let attachmentDiv = document.getElementById("threadAttachments");
      attachmentDiv.setAttribute("class", "attachment-div");
      let guxtable = document.createElement("gux-table");
      guxtable.setAttribute("compact","");
      let table = document.createElement("table");
      table.setAttribute("class", "attachment-table");
      table.setAttribute("id", "attachment-table");
      table.setAttribute("slot", "data");
      guxtable.appendChild(table);
    
      let thead = document.createElement("thead");
      let headerRow = document.createElement("tr");
      let headers = ["Time", "Subject", "Attachment Name", "Preview", "Download"];
      headers.forEach(headerText => {
        let th = document.createElement("th");
        th.innerHTML = headerText;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
    
      let tbody = document.createElement("tbody");
      table.appendChild(tbody);
    
      for (let j = 0; j < messagesWithAttachments.length; j++) {
        let message = messagesWithAttachments[j];
        let messageRow = document.createElement("tr");
        messageRow.classList.add("message-row");
    
        let timeCell = document.createElement("td");
        timeCell.innerHTML = new Date(message.time).toLocaleString("en-GB");
        messageRow.appendChild(timeCell);

        let subjectCell = document.createElement("td");
        subjectCell.innerHTML = message.subject;
        messageRow.appendChild(subjectCell);
        
        let attachmentNameCell = document.createElement("td");
        attachmentNameCell.innerHTML = "";
        messageRow.appendChild(attachmentNameCell);
    
        let previewCell = document.createElement("td");
        previewCell.innerHTML = "";
        messageRow.appendChild(previewCell);
    
        let downloadCell = document.createElement("td");
        downloadCell.innerHTML = "";
        messageRow.appendChild(downloadCell);
    
        tbody.appendChild(messageRow);
    
        for (let k = 0; k < message.attachments.length; k++) {
          let attachment = message.attachments[k];
          let attachmentRow = document.createElement("tr");
          attachmentRow.classList.add("attachment-row");
    
          let emptyCell1 = document.createElement("td");
          emptyCell1.innerHTML = "";
          attachmentRow.appendChild(emptyCell1);
    
          let emptyCell2 = document.createElement("td");
          emptyCell2.innerHTML = "";
          attachmentRow.appendChild(emptyCell2);
    
          let attachmentNameCell = document.createElement("td");
          attachmentNameCell.innerHTML = attachment.name;
          attachmentRow.appendChild(attachmentNameCell);
    
          let previewCell = document.createElement("td");
          if (
            attachment.contentType === "image/jpg" ||
            attachment.contentType === "image/jpeg" ||
            attachment.contentType === "image/png" ||
            attachment.contentType === "application/pdf"
          ) {
            let previewButton = document.createElement("gux-button");
            let icon = document.createElement("gux-icon");
            icon.setAttribute("icon-name", "fa/eye-regular");
            icon.setAttribute("screenreader-text", "Preview");
            icon.setAttribute("size", "small");
            previewButton.appendChild(icon);
            let attachmentShown = false;
    
            previewButton.addEventListener("click", function () {
              if (!attachmentShown) {
                if (attachment.contentType.startsWith("image/")) {
                  let img = document.createElement("img");
                  img.setAttribute("id", attachment.contentUri);
                  img.setAttribute("src", attachment.contentUri);
                  img.setAttribute("alt", attachment.name);
                  img.setAttribute("style", "max-width: 50%; height: auto;");
                  attachmentDiv.appendChild(img);
                } else if (attachment.contentType === "application/pdf") {
                  let iframe = document.createElement("iframe");
                  iframe.setAttribute("id", attachment.contentUri);
                  iframe.setAttribute("src", attachment.contentUri);
                  iframe.setAttribute("style", "width: 100%; height: 500px;");
                  attachmentDiv.appendChild(iframe);
                }
                attachmentShown = true;
              } else {
                let element = document.getElementById(attachment.contentUri);
                element.remove();
                attachmentShown = false;
              }
            });
    
            previewCell.appendChild(previewButton);
          }
          attachmentRow.appendChild(previewCell);
    
          let downloadCell = document.createElement("td");
          let downloadButton = document.createElement("gux-button");
          let icon2 = document.createElement("gux-icon");
          icon2.setAttribute("icon-name", "fa/download-regular");
          icon2.setAttribute("screenreader-text", "Download");
          icon2.setAttribute("size", "small");
          downloadButton.appendChild(icon2);
          downloadButton.addEventListener("click", function () {
            let link = document.createElement("a");
            link.setAttribute("href", attachment.contentUri);
            link.setAttribute("download", attachment.name);
            link.click();
          });
          downloadCell.appendChild(downloadButton);
          attachmentRow.appendChild(downloadCell);
    
          tbody.appendChild(attachmentRow);
        }
      }
    
      attachmentDiv.appendChild(guxtable);
    }


          
    console.log("messages", messages);
    if (conversationIsActive&&status == "Ended") {
      const reconnectButton = document.createElement("gux-button");
      reconnectButton.setAttribute("id", "reconnectButton");
      reconnectButton.innerHTML = "Reconnect";
      reconnectButton.addEventListener("click", function () {
        capi.postConversationsEmailReconnect(clickedConversationId)
      });
      document.getElementById("messages-content").appendChild(reconnectButton);
    }

    console.log("status", status);
    console.log("aaaaa", !subject.includes("(Current)"));
    const conversation = await capi.getConversation(clickedConversationId);

    if (status == "In Queue" && !subject.includes("(Current)")) {
      const reassignButton = document.createElement("gux-button");
      reassignButton.setAttribute("id", "reassignButton");
      reassignButton.innerHTML = "Assign to Me";
      reassignButton.addEventListener("click", function () {
        console.log("conversation", conversation);
        const activeQueue = conversation.participants.filter(c=>c.purpose==="acd"&&c.hasOwnProperty("conversationEnd")===false);
        const participantId = activeQueue[0].id;
        console.log("participantId", participantId);
        transferUser(clickedConversationId, participantId, user.id);
      });
      document.getElementById("messages-content").appendChild(reassignButton);
    
    }
    document.getElementById("originalView").classList.remove("active");
    document.getElementById("separateView").classList.add("active");
  }
}


function getEmailThreading(token) {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      `https://api.mypurecloud.de/api/v2/emails/settings/threading`
    );
    xhr.setRequestHeader("Authorization", "bearer " + token);
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.send();
  });
}

function convertStringToDate(dateString) {
  if (dateString == "N/A") return null;
const [datePart, timePart] = dateString.split(",");
const [day, month, year] = datePart.split("/");
const [hours, minutes, seconds] = timePart.split(":");

const dateObject = new Date(year, month - 1, day, hours, minutes, seconds);
return dateObject;
}

export async function transferUser(
  conversationId,
  participantId,
  selectedUserId
) {
  try {
    const body = {
      userId: selectedUserId,
      "transferType": "Unattended"
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
    // getting active participantId of the transferred conversation
    // const opts = {
    //   communicationType: "email",
    // };
    // const a = await conversationsApi.getConversation(conversationId);
    // console.log("a", JSON.stringify(a, null, 2));
    // const b = a.participants.slice().reverse().find(
    //   (p: any) => p.purpose == "agent" && p.userId == selectedUserId
    // ).id;
    // console.log("b", JSON.stringify(b, null, 2));
    // const data2 = await conversationsApi.getConversations(opts);
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
    // const data3 = await conversationsApi.patchConversationParticipant(
    //   conversationId,
    //   b,
    //   body2
    // );
    // console.log("patchConversationsEmailParticipant returned successfully.");

  } catch (error) {
    // toast.error(error.message);
    console.log("There was a failure transfering", error);
  }
}



function moveIntervalBack(){
  let interval = document.getElementById("search-dates").value;
  let intervalArray = interval.split("-");
  let intervalStart = new Date(intervalArray[0]);
  let intervalEnd = new Date(intervalArray[1]);
  intervalStart = intervalStart.setDate(intervalStart.getDate() - 30);
  intervalEnd = intervalEnd.setDate(intervalEnd.getDate() - 30);
  console.log("intervalStart", intervalStart);
  console.log("intervalEnd", intervalEnd);
  interval = new Date(intervalStart).toISOString() + "/" + new Date(intervalEnd).toISOString();
  // sessionStorage.setItem("interval", interval);
  popUp(interval,"","Interval moved back by 30 days")
  return interval;
}

function moveIntervalForward(){
  let interval = document.getElementById("search-dates").value;
  let intervalArray = interval.split("-");
  let intervalStart = new Date(intervalArray[0]);
  let intervalEnd = new Date(intervalArray[1]);
  intervalStart = intervalStart.setDate(intervalStart.getDate() + 30);
  intervalEnd = intervalEnd.setDate(intervalEnd.getDate() + 30);
  console.log("intervalStart", intervalStart);
  console.log("intervalEnd", intervalEnd);
  interval = new Date(intervalStart).toISOString() + "/" + new Date(intervalEnd).toISOString();
  // sessionStorage.setItem("interval", interval);
  return interval;
}