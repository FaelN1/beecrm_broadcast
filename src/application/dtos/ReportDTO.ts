export interface GenerateReportDTO {
  broadcastId: string;
  type: 'summary' | 'contacts' | 'messages';
  format: 'pdf' | 'csv' | 'xlsx';
  email?: string; // Email opcional para envio do relatório
}

export interface ReportResponseDTO {
  id: string;
  url: string;
  key: string;
  type: string;
  format: string;
  status: string;
  createdAt: Date;
  emailSent?: boolean; // Indica se o relatório foi enviado por email
}

export interface GetReportDTO {
  id: string;
}

export interface ListReportsDTO {
  broadcastId?: string;
  type?: string;
  format?: string;
  page?: number;
  limit?: number;
}

export interface ReportListResponseDTO {
  reports: ReportResponseDTO[];
  total: number;
  page: number;
  limit: number;
}
