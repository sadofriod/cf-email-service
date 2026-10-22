import { agentInfra } from './agent-infra';
import { clinicalPharma } from './clinical-pharma';
import { energyStorage } from './energy-storage';
import { semiconductorControls } from './semiconductor-controls';
import { web3Security } from './web3-security';
import type { DomainPack } from './types';

export const DEFAULT_DOMAIN = 'energy-storage';
export const domains: Record<string, DomainPack> = {
  [energyStorage.id]: energyStorage,
  [semiconductorControls.id]: semiconductorControls,
  [web3Security.id]: web3Security,
  [clinicalPharma.id]: clinicalPharma,
  [agentInfra.id]: agentInfra,
};
export function getDomain(id: string): DomainPack | undefined { return domains[id]; }
export function listDomains(): DomainPack[] { return Object.values(domains); }
export type { DomainCopy, DomainPack, DomainSampleFinding } from './types';
