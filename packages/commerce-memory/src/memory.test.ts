import { describeConnectorConformance } from "@gifting/commerce/conformance";

import { createMemoryConnector } from "./memory";

let n = 0;
const newEmail = () => `person-${++n}@conformance.example`;

describeConnectorConformance("memory, password sign-in", { connector: () => createMemoryConnector().connector, newEmail });

describeConnectorConformance("memory, password sign-in without platform sessions", {
  connector: () => createMemoryConnector({ platformSessions: false }).connector,
  newEmail,
});

const hosted = createMemoryConnector({ signIn: "hosted" });
describeConnectorConformance("memory, hosted sign-in", { connector: () => hosted.connector, newEmail, completeHostedSignIn: hosted.completeHostedSignIn });
