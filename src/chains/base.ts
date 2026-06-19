export interface ChainInspectionResult {
  valid: boolean;
  chain: string;
  details: string;
}

export abstract class ChainInspector {
  abstract inspectSettlement(params: {
    to: string;
    amount: string;
    token: string;
    txData?: string;
  }): Promise<ChainInspectionResult>;
}
