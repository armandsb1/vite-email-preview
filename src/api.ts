import platformClient from "purecloud-platform-client-v2";
import { APP_NAME } from "./config";

export const client = platformClient.ApiClient.instance;
client.setPersistSettings(true, APP_NAME);

export const uapi = new platformClient.UsersApi();
export const capi = new platformClient.ConversationsApi();
export const rapi = new platformClient.RoutingApi();
export const papi = new platformClient.PresenceApi();
