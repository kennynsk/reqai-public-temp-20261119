import { readFileSync } from 'node:fs';
import { Agent as HttpsAgent } from 'node:https';
import GigaChat from 'gigachat';

export function createGigaChatClient(config) {
  const options = {
    baseUrl: config.llm.baseUrl,
    authUrl: config.llm.authUrl,
    scope: config.llm.scope,
    timeout: Math.ceil(config.llm.requestTimeoutMs / 1000),
    model: undefined,
  };
  if (config.llm.credentials) options.credentials = config.llm.credentials;
  if (config.llm.accessToken) options.accessToken = config.llm.accessToken;
  if (config.llm.user) options.user = config.llm.user;
  if (config.llm.password) options.password = config.llm.password;
  if (config.llm.caCertPath || config.llm.tlsCertPath || config.llm.tlsKeyPath || !config.llm.rejectUnauthorized) {
    const agent = { rejectUnauthorized: config.llm.rejectUnauthorized };
    if (config.llm.caCertPath) agent.ca = readFileSync(config.llm.caCertPath);
    if (config.llm.tlsCertPath) agent.cert = readFileSync(config.llm.tlsCertPath);
    if (config.llm.tlsKeyPath) agent.key = readFileSync(config.llm.tlsKeyPath);
    if (config.llm.tlsKeyPassphrase) agent.passphrase = config.llm.tlsKeyPassphrase;
    options.httpsAgent = new HttpsAgent(agent);
  }
  return new GigaChat(options);
}
