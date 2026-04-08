import platformClient from "purecloud-platform-client-v2";
import { APP_NAME } from "./config";

// Singleton SDK client — persists the OAuth token across page loads under APP_NAME key
export const client = platformClient.ApiClient.instance;
client.setPersistSettings(true, APP_NAME);

// Each export is a typed wrapper around a specific Genesys Cloud API surface:
export const uapi = new platformClient.UsersApi();          // user lookups, presence
export const capi = new platformClient.ConversationsApi();  // conversation detail queries, email actions
export const aapi = new platformClient.AnalyticsApi();      // aggregate metrics (nOffered, tPark, etc.)
                                                            // NOTE: postAnalyticsConversationsAggregatesQuery lives here,
                                                            // NOT on ConversationsApi
export const rapi = new platformClient.RoutingApi();        // queue lookups
export const papi = new platformClient.PresenceApi();       // presence checks before transfer
