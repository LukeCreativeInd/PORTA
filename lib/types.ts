export type Role = 'admin' | 'submitter';
export type StateCode = 'NSW'|'QLD'|'SA/NT'|'VIC/TAS'|'WA';
export type Period = { id:string; year:number; month:number; period_code:string; status:'open'|'finalising'|'finalised'; report_pdf_path?:string|null };
export type MetricInput = Record<string, number>;
