import { demoProvider } from './demoProvider.js';
import { bilibiliProvider } from './bilibiliProvider.js';

const providers = [demoProvider, bilibiliProvider];

export function getProvider(providerId = 'demo') {
  return providers.find((provider) => provider.id === providerId) || null;
}

export function listProviders() {
  return providers.map(toProviderSummary);
}

export function toProviderSummary(provider) {
  return {
    id: provider.id,
    name: provider.name,
    mode: provider.mode,
    authorized: provider.authorized,
    configured: provider.configured ?? true,
    canStream: provider.canStream,
    canDownload: provider.canDownload,
    description: provider.description,
    complianceNotice: provider.complianceNotice
  };
}
