import { QueryEventProcessingPack } from '../model';
import { BootstrapPack } from '../bootstrap';

export type QueryNodeStartUpOptions = IndexerOptions | ProcessorOptions | BootstrapOptions;

export interface IndexerOptions  {
  atBlock?: number;
  typeRegistrator?: () => void;
  wsProviderURI: string;
}

export interface ProcessorOptions {
  processingPack: QueryEventProcessingPack;
  // translates event handler to the even name, e.g. handleTreasuryDeposit -> treasury.Deposit
  mappingToEventTranslator?: (mapping: string) => string;
  name?: string;
  atBlock?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities?: any[];
}

export interface BootstrapOptions {
  atBlock?: number;
  typeRegistrator?: () => void;
  wsProviderURI: string;
  processingPack: BootstrapPack
}