export interface DomainEvent<T = unknown> {
  id: string;
  tenantId: string;
  type: string;
  version: 1;
  occurredAt: string;
  payload: T;
}
export interface ObjectStorage {
  createUploadUrl(input: {
    tenantId: string;
    key: string;
    contentType: string;
    expiresIn: number;
  }): Promise<string>;
  createDownloadUrl(input: {
    tenantId: string;
    key: string;
    expiresIn: number;
  }): Promise<string>;
  delete(input: { tenantId: string; key: string }): Promise<void>;
}
export interface IntegrationPort {
  publish(event: DomainEvent): Promise<void>;
}
export interface LoyaltyPort extends IntegrationPort {}
export interface CrmPort extends IntegrationPort {}
export interface MarketingPort extends IntegrationPort {}
export interface MarketplacePort extends IntegrationPort {}
export interface AiPort {
  forecast(input: {
    tenantId: string;
    branchId: string;
    productIds: string[];
  }): Promise<unknown>;
}
